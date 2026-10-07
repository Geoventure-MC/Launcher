import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const SHOTS = path.join(here, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

export const ACCOUNT = {
  uuid: '11111111-2222-3333-4444-555555555555', name: 'E2EPlayer', access_token: 'tok-e2e', client_token: '11111111-2222-3333-4444-555555555555',
  user_properties: '{}', meta: { type: 'AZauth', offline: false }, user_info: { id: 7, role: { name: 'Joueur', color: '#fff' }, monnaie: 500, verified: true },
};

// Lance le VRAI Electron (xvfb requis) dans un dossier jetable : HOME isolé (dossier de jeu), userData dans <tmp>/AppData.
export async function launchLauncher(mock, { account = true, instance = 'geoventure', telemetry = false, prepare = null, env: extraEnv = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-e2e-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const env = { ...process.env, NODE_ENV: 'dev', HOME: home, APPDATA: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', ...extraEnv };
  delete env.HTTPS_PROXY; delete env.https_proxy; delete env.HTTP_PROXY; delete env.http_proxy; delete env.DEV_TOOL;
  const app = await electron.launch({
    executablePath: path.join(ROOT, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', ROOT], cwd: tmp, env,
  });
  // Les pastilles d'instance interrogent `pkg.servers[].settings` (le vrai https://launcher.geoventure.fr/) :
  // on redirige ce domaine vers le faux panel, depuis le processus principal.
  await app.evaluate(({ session }, target) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://launcher.geoventure.fr/*'] }, (details, cb) => {
      cb({ redirectURL: details.url.replace('https://launcher.geoventure.fr/', target) });
    });
  }, mock.url);
  const win = await app.firstWindow();
  const logs = [];
  win.on('console', m => logs.push({ type: m.type(), text: m.text() }));
  win.on('pageerror', e => logs.push({ type: 'pageerror', text: e.message, stack: e.stack }));
  await win.waitForLoadState('domcontentloaded');
  await seed(win, mock, { account, instance, telemetry });
  if (prepare) prepare(home);   // ex. dossier de jeu déjà installé AVANT l'init des panneaux
  await win.reload();
  return { app, win, logs, tmp, home, close: async () => { await app.close().catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

export async function seed(win, mock, { account, instance, telemetry }) {
  await win.evaluate(async ({ url, account, acc, instance, telemetry }) => {
    localStorage.clear();
    localStorage.setItem('geoventure_server_url', url);
    if (instance) localStorage.setItem('geoventure_selected_instance', instance);
    if (telemetry) localStorage.setItem('telemetry_consent', 'true');
    const genKey = (s) => { let k = 0; for (const c of s.split('')) k = (((k << 5) - k) + c.charCodeAt()) & 0xFFFFFFFF; return k; };
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('database', 1);
      r.onupgradeneeded = (e) => { for (const s of ['accounts', 'accounts-selected', 'java-path', 'java-args', 'launcher', 'profile', 'ram', 'screen']) if (!e.target.result.objectStoreNames.contains(s)) e.target.result.createObjectStore(s, { keyPath: 'key' }); };
      r.onsuccess = (e) => res(e.target.result); r.onerror = () => rej(r.error);
    });
    const put = (store, key, value) => new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put({ key, value }); t.oncomplete = res; t.onerror = () => rej(t.error); });
    const clear = (store) => new Promise((res) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear(); t.oncomplete = res; });
    await clear('accounts'); await clear('accounts-selected');
    if (acc) {
      await put('accounts', genKey(acc.uuid), acc);
      await put('accounts-selected', genKey('1234'), { uuid: '1234', selected: acc.uuid });
    }
    db.close();
  }, { url: mock.url, acc: account ? ACCOUNT : null, instance, telemetry });
}

export const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

// Attend qu'un panneau soit actif (classe `.panel.<id>.active`).
export const panelActive = (win, id) => win.waitForSelector(`.panel.${id}.active`, { timeout: 15000 });

// Fabrique sur le disque un dossier de jeu « installé » conforme au faux manifeste.
import { MANIFEST_FILES } from './mock-panel.mjs';
export function gameDirFor(home, slug = 'geoventure') {
  const base = path.join(home, '.geoventure-e2e');
  return slug === 'geoventure' ? base : path.join(base, 'instances', slug);
}
export function writeFile(p, content = '{}') { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }
export function installGame(home, slug = 'geoventure', { modpack = true } = {}) {
  const d = gameDirFor(home, slug);
  writeFile(path.join(d, 'versions/1.20.1/1.20.1.json'));
  writeFile(path.join(d, 'versions/1.20.1-forge-47.4.20/1.20.1-forge-47.4.20.json'));
  writeFile(path.join(d, 'libraries/net/minecraft/x.jar'), 'lib');
  if (modpack) for (const f of MANIFEST_FILES) writeFile(path.join(d, f.path), f.content);
  return d;
}
export const pillState = (win, id) => win.evaluate((i) => document.querySelector(`.server-pill[data-server-id="${i}"]`)?.dataset.installState ?? null, id);
