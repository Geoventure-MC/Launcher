// Audit sécurité 2026-10-15 : garde de navigation, CSP, XSS (panel / Azuriom), noms de fichiers de mods,
// Azuriom en panne au démarrage, échec de lancement géré. Assertions indépendantes de la langue.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startMock } from './mock-panel.mjs';
import { launchLauncher, panelActive, installGame, gameDirFor, shot, ROOT } from './helpers.mjs';

let mock;
test.beforeAll(async () => { mock = await startMock(8792); });
test.afterAll(async () => { await mock.close(); });
test.afterEach(() => {
  mock.setMode('ok'); mock.setApiOver({}); mock.setMods(null); mock.setCommunityMods(null); mock.setAuthMode('ok');
});

const fatal = (logs) => logs.filter(l => l.type === 'pageerror' || /Uncaught|TypeError|ReferenceError|is not a function|Cannot read/.test(l.text)).map(l => l.text);
const pwned = (win) => win.evaluate(() => Object.keys(window).filter(k => k.startsWith('__pwned')));

async function openSettings(win, tab) {
  await win.locator('#settings-btn').click();
  await panelActive(win, 'settings');
  if (tab) await win.locator(`#${tab}-tab`).click();
}

test.describe('fenêtre', () => {
  test('CSP présente, navigation hors du launcher et nouvelles fenêtres refusées', async () => {
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      const csp = await L.win.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '');
      expect(csp).toContain("script-src 'self'");
      expect(csp.split(';').find(d => d.trim().startsWith('script-src'))).not.toContain('unsafe-inline');

      // Aucune ressource légitime du launcher n'est bloquée par la CSP.
      await L.win.waitForTimeout(1000);
      expect(L.logs.filter(l => /Content Security Policy/i.test(l.text)).map(l => l.text)).toEqual([]);

      // Un script en ligne injecté ne s'exécute pas.
      await L.win.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = '<img src="x" onerror="window.__pwnedInline=1">';
        document.body.appendChild(d);
      });

      const results = {};
      for (const target of ['file:///etc/hostname', 'data:text/html,<h1>x</h1>', 'about:blank']) {
        await L.win.evaluate((u) => { try { location.href = u; } catch (e) { /* refusé */ } }, target);
        await L.win.waitForTimeout(400);
        await L.win.waitForURL(/launcher\.html/, { timeout: 5000 }).catch(() => {});
        results[target] = L.win.url();
      }
      for (const [k, v] of Object.entries(results)) expect(v, k).toContain('launcher.html');
      const opened = await L.win.evaluate(() => window.open('about:blank') === null);
      expect(opened).toBe(true);
      await L.win.waitForTimeout(300);
      expect(L.app.windows().length).toBe(1);
      expect(await pwned(L.win)).toEqual([]);
      await expect(L.win.locator('.panel.home')).toBeVisible();
    } finally { await L.close(); }
  });
});

test.describe('XSS', () => {
  test('bandeau d\'alerte et message de maintenance : balises dangereuses retirées', async () => {
    mock.setApiOver({
      alert_activate: true, alert_scroll: false,
      alert_msg: '<p>Alerte <img src="x"/onerror="window.__pwnedA=1"> <a href="java&#x73;cript:window.__pwnedB=1">lien</a> <b>gras</b><script>window.__pwnedC=1</script></p>',
      maintenance: true,
      maintenance_message: '<img src=x onerror="window.__pwnedD=1">Travaux <svg onload="window.__pwnedE=1"></svg>',
    });
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      const banner = L.win.locator('.advert-banner');
      await expect(banner).toContainText('Alerte');
      await expect(banner.locator('b')).toHaveCount(1);
      await expect(banner.locator('img, script')).toHaveCount(0);
      expect(await banner.locator('a').first().getAttribute('href')).toBeNull();
      const maint = L.win.locator('[data-maintenance-banner]');
      await expect(maint).toContainText('Travaux');
      await expect(maint.locator('img, svg')).toHaveCount(0);
      await L.win.waitForTimeout(500);
      expect(await pwned(L.win)).toEqual([]);
      await shot(L.win, 'securite-bandeau');
    } finally { await L.close(); }
  });

  test('mods optionnels : nom, description et icône hostiles affichés en texte', async () => {
    mock.setMods({
      optionalMods: ['evil.jar', '<img src=x onerror="window.__pwnedK=1">.jar'],
      mods: { 'evil.jar': { name: '<img src=x onerror="window.__pwnedM=1">Nom piégé', description: '<b>desc</b>', icon: 'javascript:window.__pwnedI=1', recommanded: false } },
    });
    const L = await launchLauncher(mock, { prepare: (home) => installGame(home, 'geoventure') });
    try {
      await panelActive(L.win, 'home');
      await openSettings(L.win, 'mods');
      const list = L.win.locator('#mods-list');
      await expect(list).toContainText('Nom piégé');
      await expect(list).toContainText('<b>desc</b>');
      await expect(list.locator('img')).toHaveCount(0);
      await L.win.waitForTimeout(500);
      expect(await pwned(L.win)).toEqual([]);
      expect(fatal(L.logs)).toEqual([]);
    } finally { await L.close(); }
  });
});

test.describe('fichiers de mods', () => {
  test('désactiver un mod optionnel : suffixe -disable, correspondance exacte du nom', async () => {
    const L = await launchLauncher(mock, {
      prepare: (home) => {
        const d = installGame(home, 'geoventure');
        fs.writeFileSync(d + '/mods/minimap.jar', 'mini');
        fs.writeFileSync(d + '/mods/minimapextra.jar', 'autre');
      },
    });
    try {
      await panelActive(L.win, 'home');
      const dir = gameDirFor(L.home, 'geoventure');
      await openSettings(L.win, 'mods');
      const box = L.win.locator('#mods-list input[type=checkbox]').first();
      await expect(box).toBeChecked();
      await box.evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change')); });
      await expect.poll(() => fs.existsSync(dir + '/mods/minimap.jar-disable')).toBeTruthy();
      expect(fs.existsSync(dir + '/mods/minimap.jar')).toBeFalsy();
      expect(fs.existsSync(dir + '/mods/minimapextra.jar')).toBeTruthy();
      expect(fs.readdirSync(dir + '/mods').some(f => f.endsWith('.jar.disable'))).toBeFalsy();
    } finally { await L.close(); }
  });

  test('mods communauté : nom de fichier hostile refusé, mod installé noté pour la vérification', async () => {
    mock.setCommunityMods([
      { name: 'Bon mod', description: 'ok', url: `${mock.url}__jar/good.jar`, filename: 'good.jar' },
      { name: 'Piege', description: 'traversal', url: `${mock.url}__jar/good.jar`, filename: '../../evil.jar' },
      { name: 'Lien local', description: 'schéma', url: 'file:///etc/passwd', filename: 'local.jar' },
    ]);
    const L = await launchLauncher(mock, { prepare: (home) => installGame(home, 'geoventure') });
    try {
      await panelActive(L.win, 'home');
      const dir = gameDirFor(L.home, 'geoventure');
      await openSettings(L.win, 'community');
      const list = L.win.locator('#community-mods-list');
      await expect(list).toContainText('Piege');
      const trap = list.locator('.mods-container', { hasText: 'Piege' });
      await expect(trap.locator('.community-mod-btn')).toHaveCount(0);
      const local = list.locator('.mods-container', { hasText: 'Lien local' });
      await expect(local.locator('.community-mod-btn, .community-link-btn')).toHaveCount(0);
      const good = list.locator('.mods-container', { hasText: 'Bon mod' });
      await good.locator('.community-mod-btn').click();
      await expect.poll(() => fs.existsSync(dir + '/mods/good.jar')).toBeTruthy();
      const noted = JSON.parse(fs.readFileSync(dir + '/launcher_config/community_mods.json', 'utf8'));
      expect(noted).toEqual(['good.jar']);
      expect(fs.existsSync(path.resolve(dir, 'mods', '../../evil.jar'))).toBeFalsy();
    } finally { await L.close(); }
  });
});

test.describe('pannes', () => {
  test('Azuriom en 502 au démarrage : compte en cache conservé, accueil affiché', async () => {
    mock.setAuthMode('html502');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      await expect(L.win.locator('.preload-content')).toBeHidden({ timeout: 15000 });
      expect(mock.hits.some(h => h.path === '/api/auth/verify')).toBeTruthy();
      expect(fatal(L.logs)).toEqual([]);
    } finally { await L.close(); }
  });

  test('lancement : manifeste Mojang en erreur -> message affiché, bouton Jouer rendu, aucun rejet non géré', async () => {
    const L = await launchLauncher(mock, { prepare: (home) => installGame(home, 'geoventure') });
    try {
      await L.app.evaluate(({ session }, target) => {
        session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://launcher.geoventure.fr/*', 'https://launchermeta.mojang.com/*'] }, (d, cb) => {
          cb({ redirectURL: d.url.replace('https://launcher.geoventure.fr/', target).replace('https://launchermeta.mojang.com/', target) });
        });
      }, mock.url);
      await panelActive(L.win, 'home');
      const play = L.win.locator('.play-btn');
      await play.click();
      await expect(L.win.locator('.text-download .red')).toBeVisible({ timeout: 30000 });
      await expect(play).toBeVisible();
      await L.win.waitForTimeout(500);
      expect(fatal(L.logs)).toEqual([]);
      await shot(L.win, 'securite-lancement-erreur');
    } finally { await L.close(); }
  });
});

test('règles pures : noms de fichiers de mods et adresse d\'authentification', async () => {
  const loadEsm = (rel) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64'));
  const m = await loadEsm('src/assets/js/utils/mods.js');
  for (const bad of ['../../x.jar', 'a/b.jar', 'a\\b.jar', '.hidden.jar', 'x.bat', 'C:x.jar', '', null]) expect(m.safeModFileName(bad), String(bad)).toBeNull();
  expect(m.safeModFileName('ok-1.2.jar')).toBe('ok-1.2.jar');
  expect(m.findModFile(['createaddition-1.jar', 'create-0.5.jar'], 'create')).toBe('create-0.5.jar');
  expect(m.findModFile(['createaddition-1.jar'], 'create')).toBeNull();
  expect(m.findModFile(['minimap.jar-disable'], 'minimap.jar')).toBe('minimap.jar-disable');
  expect(m.modTargetName('a.jar', false)).toBe('a.jar-disable');
  expect(m.modTargetName('a.jar-disable', true)).toBe('a.jar');
  const g = await import(path.join(ROOT, 'src/assets/js/utils/window-guard.js'));
  const guard = g.default || g;
  expect(guard.isSafeExternalUrl('https://geoventure.fr/x')).toBe(true);
  for (const bad of ['file:///C:/x.exe', '\\\\hote\\partage\\x.exe', 'ms-settings:', 'javascript:alert(1)', 'smb://h/x']) expect(guard.isSafeExternalUrl(bad), bad).toBe(false);
  expect(guard.isAppPage('file:///app/src/launcher.html', '/app')).toBe(true);
  expect(guard.isAppPage('file:///etc/x.html', '/app')).toBe(false);
});
