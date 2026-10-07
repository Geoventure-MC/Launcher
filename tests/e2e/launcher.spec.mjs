import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMock } from './mock-panel.mjs';
import { launchLauncher, shot, panelActive, installGame, gameDirFor, pillState } from './helpers.mjs';

let mock;
test.beforeAll(async () => { mock = await startMock(); });
test.afterAll(async () => { await mock.close(); });

const fatal = (logs) => logs.filter(l => l.type === 'pageerror' || /Uncaught|TypeError|ReferenceError|is not a function|Cannot read/.test(l.text)).map(l => ({ ...l, text: l.text + (l.stack ? '\n' + l.stack.split('\n').slice(0, 4).join('\n') : '') }));

test.describe('démarrage', () => {
  test('Electron démarre, charge launcher.html et affiche le sélecteur d\'instances (1er lancement)', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { account: false, instance: null });
    try {
      await panelActive(L.win, 'instances');
      expect(L.win.url()).toContain('launcher.html');
      await expect(L.win.locator('.instances-grid .instance-card, .instances-grid > *')).toHaveCount(3);
      await shot(L.win, 'instances-premier-lancement');
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { await L.close(); }
  });

  test('choisir une instance sans compte mène au panneau de connexion', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { account: false, instance: null });
    try {
      await panelActive(L.win, 'instances');
      await L.win.locator('.instances-grid > *').first().click();
      await panelActive(L.win, 'login');
      await expect(L.win.locator('#login-btn')).toBeVisible();
      await shot(L.win, 'login');
    } finally { await L.close(); }
  });
});

test.describe('home (panel OK)', () => {
  let L;
  test.beforeAll(async () => { mock.setMode('ok'); L = await launchLauncher(mock); await panelActive(L.win, 'home'); await L.win.waitForSelector('.server-pill[data-install-state]', { timeout: 15000 }); });
  test.afterAll(async () => { await L?.close(); });

  test('pastilles serveurs : 3 instances, état « à télécharger », joueurs en ligne', async () => {
    await expect(L.win.locator('.server-pill')).toHaveCount(3);
    for (const id of ['geoventure', 'elandor', 'pokeland']) await expect.poll(() => pillState(L.win, id)).toBe('not_installed');
    const title = await L.win.locator('.server-pill[data-server-id="geoventure"]').getAttribute('title');
    expect(title).toContain('7');
    await expect(L.win.locator('.server-text .desc')).toContainText('42');
    await shot(L.win, 'home-ok');
  });

  test('bandeau de notifications : 2 annonces, HTML échappé, lien et fermeture', async () => {
    const banner = L.win.locator('#notifications-banner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.notification-item')).toHaveCount(2);
    await expect(banner.locator('.notification-maintenance')).toContainText('Maintenance samedi 3h');
    expect(await banner.locator('b').count()).toBe(0); // <b> du message doit rester du texte
    await expect(banner.locator('.notification-event')).toContainText('<b>Wonder</b>');
    await banner.locator('.notification-item').first().locator('.notif-close').click();
    await expect(banner.locator('.notification-item')).toHaveCount(1);
  });

  test('contrat réseau : appels avec ?instance=geoventure vers le panel', async () => {
    const paths = mock.hits.map(h => h.path + h.query);
    expect(paths.some(p => p.startsWith('/utils/api?instance=geoventure'))).toBeTruthy();
    expect(paths.some(p => p.startsWith('/data?instance=geoventure'))).toBeTruthy();
    expect(paths).toContain('/utils/servers-status?instance=geoventure');
    expect(mock.hits.filter(h => h.path === '/utils/telemetry')).toHaveLength(0); // opt-in : rien sans consentement
  });

  test('aucune erreur JS non gérée', async () => {
    expect(fatal(L.logs).map(l => l.text)).toEqual([]);
  });
});

test.describe('état d\'installation des instances', () => {
  test('installé / mise à jour requise / incomplet / à télécharger', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock);
    try {
      installGame(L.home, 'geoventure');                        // complet
      installGame(L.home, 'elandor', { modpack: false });         // moteur ok, aucun fichier du modpack -> incomplet
      const pk = gameDirFor(L.home, 'pokeland');
      fs.mkdirSync(pk + '/libraries/a', { recursive: true });   // quelques libs seulement -> incomplet
      fs.writeFileSync(pk + '/libraries/a/b.jar', 'x');
      await L.win.reload();
      await panelActive(L.win, 'home');
      await expect.poll(() => pillState(L.win, 'geoventure'), { timeout: 15000 }).toBe('installed');
      await expect.poll(() => pillState(L.win, 'elandor')).toBe('incomplete');
      await expect.poll(() => pillState(L.win, 'pokeland')).toBe('incomplete');
      await shot(L.win, 'home-installe');

      fs.writeFileSync(gameDirFor(L.home, 'geoventure') + '/mods/geocore.jar', 'TRONQUE'); // taille différente
      await L.win.reload();
      await panelActive(L.win, 'home');
      await expect.poll(() => pillState(L.win, 'geoventure'), { timeout: 15000 }).toBe('update_required');
    } finally { await L.close(); }
  });
});

test.describe('résilience aux erreurs du panel', () => {
  test('502 HTML avec cache de config : mode hors-ligne, pas de crash', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');           // 1er chargement OK : la config est mise en cache
      mock.setMode('html502');
      L.logs.length = 0;
      await L.win.reload();
      await panelActive(L.win, 'home');
      await expect(L.win.locator('#offline-badge')).toBeVisible({ timeout: 10000 });
      await shot(L.win, 'home-502-horsligne');
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
      // aucune pastille ne reste bloquée dans « vérification »
      await expect.poll(() => L.win.locator('.server-pill[data-install-state="checking"]').count(), { timeout: 15000 }).toBe(0);
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('502 HTML sans cache : message clair, pas d\'exception', async () => {
    mock.setMode('html502');
    const L = await launchLauncher(mock);
    try {
      await expect(L.win.locator('#preload-title')).toContainText(/Impossible de joindre le serveur/, { timeout: 15000 });
      await shot(L.win, 'preload-502');
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('panel coupé (socket détruit) sans cache : message clair', async () => {
    mock.setMode('down');
    const L = await launchLauncher(mock);
    try {
      await expect(L.win.locator('#preload-title')).toContainText(/Impossible de joindre le serveur/, { timeout: 15000 });
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('JSON vide ({} / []) : le launcher ne plante pas', async () => {
    mock.setMode('empty');
    const L = await launchLauncher(mock);
    try {
      await L.win.waitForTimeout(6000);
      await shot(L.win, 'home-json-vide');
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('azauth null : repli sur l\'URL du panel, connexion/profil sans exception', async () => {
    mock.setMode('azauthnull');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      await L.win.waitForTimeout(2000);
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
      // l'avatar ne doit jamais viser une URL « null/ »
      expect(mock.hits.some(h => /null/.test(h.path))).toBeFalsy();
    } finally { mock.setMode('ok'); await L.close(); }
  });
});

async function openSettings(win, tab) {
  await win.locator('#settings-btn').click();
  await panelActive(win, 'settings');
  if (tab) await win.locator(`#${tab}-tab`).click();
}

test.describe('réglages', () => {
  test('mods optionnels listés depuis /utils/mods?instance=, onglet Avancé et réparation', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { prepare: (home) => installGame(home, 'geoventure') });
    try {
      await panelActive(L.win, 'home');
      const dir = gameDirFor(L.home, 'geoventure');
      // Corruption : taille différente (supprimé), un fichier valide (conservé) et un hors-manifeste (conservé).
      fs.writeFileSync(dir + '/mods/geocore.jar', 'CORROMPU!!');
      fs.writeFileSync(dir + '/mods/perso.jar', 'mod du joueur');
      await openSettings(L.win, 'mods');
      await expect(L.win.locator('#mods-list')).toContainText('Mini-carte');
      await expect(L.win.locator('#mods-list')).toContainText('ghost.jar'); // mod optionnel sans fiche : message admin visible
      await shot(L.win, 'settings-mods');
      expect(mock.hits.some(h => h.path === '/utils/mods' && h.query.includes('instance=geoventure'))).toBeTruthy();

      await L.win.locator('#advanced-tab').click();
      L.win.on('dialog', d => d.accept());
      await L.win.evaluate(() => { window.confirm = () => true; });
      await L.win.locator('#repair-btn').click();
      await expect(L.win.locator('#repair-status')).toBeVisible();
      await expect(L.win.locator('#repair-status')).toHaveClass(/repair-status-ok/, { timeout: 15000 });
      await shot(L.win, 'settings-reparation');
      expect(fs.existsSync(dir + '/mods/geocore.jar')).toBeFalsy();          // corrompu : supprimé
      expect(fs.existsSync(dir + '/config/geo.toml')).toBeTruthy();          // valide : conservé
      expect(fs.existsSync(dir + '/mods/perso.jar')).toBeTruthy();           // hors manifeste : jamais touché
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { await L.close(); }
  });

  test('réparation : panel en 502 -> erreur affichée, aucun fichier supprimé', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      const dir = installGame(L.home, 'geoventure');
      fs.writeFileSync(dir + '/mods/geocore.jar', 'CORROMPU!!');
      mock.setMode('html502');
      await openSettings(L.win, 'advanced');
      await L.win.evaluate(() => { window.confirm = () => true; });
      await L.win.locator('#repair-btn').click();
      await expect(L.win.locator('#repair-status')).toHaveClass(/repair-status-error/, { timeout: 15000 });
      expect(fs.existsSync(dir + '/mods/geocore.jar')).toBeTruthy();
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('réparation : tentative de path traversal dans le manifeste ignorée', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      const dir = installGame(L.home, 'geoventure');
      const victim = L.home + '/victime.txt';
      fs.writeFileSync(victim, 'ne pas supprimer');
      mock.setManifest([{ path: '../victime.txt', size: 1, hash: 'x', url: 'x' }]);
      await openSettings(L.win, 'advanced');
      await L.win.evaluate(() => { window.confirm = () => true; });
      await L.win.locator('#repair-btn').click();
      await expect(L.win.locator('#repair-status')).toHaveClass(/repair-status-ok/, { timeout: 15000 });
      expect(fs.existsSync(victim)).toBeTruthy();
      expect(fs.existsSync(dir + '/config/geo.toml')).toBeTruthy();
    } finally { mock.setManifest(undefined); await L.close(); }
  });

  test('mods en 502 : onglet Mods sans exception', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock);
    try {
      await panelActive(L.win, 'home');
      mock.setMode('html502');
      L.logs.length = 0;
      await L.win.reload();
      await panelActive(L.win, 'home');
      await openSettings(L.win, 'mods');
      await L.win.waitForTimeout(1500);
      await shot(L.win, 'settings-mods-502');
      expect(fatal(L.logs).map(l => l.text)).toEqual([]);
    } finally { mock.setMode('ok'); await L.close(); }
  });
});
