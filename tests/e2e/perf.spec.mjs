import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMock } from './mock-panel.mjs';
import { launchLauncher, shot, panelActive, gameDirFor, writeFile } from './helpers.mjs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

// Les modules purs du launcher sont de l'ESM dans un package sans "type": on les charge tels quels via une data: URL.
const loadEsm = (rel) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64'));
const { buildProfile, recommendProfile, sanitizeJvmArgs, ramCapGb } = await loadEsm('src/assets/js/utils/perf.js');
const { redact, tailLines } = await loadEsm('src/assets/js/utils/diagnostic.js');

let mock;
test.beforeAll(async () => { mock = await startMock(8791); });
test.afterAll(async () => { await mock.close(); });

const fatal = (logs) => logs.filter(l => l.type === 'pageerror' || /Uncaught|TypeError|ReferenceError|is not a function|Cannot read/.test(l.text)).map(l => l.text);

async function openAdvanced(win) {
  await win.locator('#settings-btn').click();
  await panelActive(win, 'settings');
  await win.locator('#advanced-tab').click();
}

test.describe('profils : règles pures', () => {
  test('garde-fous RAM : jamais > 60 %, minimum 3 Go, sinon aucun profil', () => {
    for (const total of [2, 4, 5, 6, 8, 12, 16, 24, 32, 64]) {
      for (const id of ['eco', 'balanced', 'performance']) {
        const p = buildProfile(id, { totalGb: total, cores: 8 });
        if (ramCapGb(total) < 3) { expect(p.insufficient, `${total} Go`).toBe(true); expect(p.ramMax).toBeNull(); continue; }
        expect(p.insufficient).toBe(false);
        expect(p.ramMax).toBeLessThanOrEqual(total * 0.6);
        expect(p.ramMax).toBeGreaterThanOrEqual(3);
        expect(p.ramMin).toBeLessThanOrEqual(p.ramMax);
        expect(p.jvmArgs.join(' ')).not.toMatch(/-Xm[sx]|ZGenerational/);
      }
    }
    expect(buildProfile('eco', { totalGb: 4, cores: 4 }).warnings).toContain('perf_warn_insufficient');
    expect(buildProfile('balanced', { totalGb: 8, cores: 4 }).capped).toBe(true);
  });

  test('profil recommandé et ramasse-miettes selon la machine', () => {
    expect(recommendProfile(4, 2)).toBe('eco');
    expect(recommendProfile(8, 4)).toBe('balanced');
    expect(recommendProfile(16, 8)).toBe('performance');
    expect(recommendProfile(32, 4)).toBe('balanced');
    expect(buildProfile('performance', { totalGb: 32, cores: 12 }).jvmArgs).toContain('-XX:+UseZGC');
    expect(buildProfile('performance', { totalGb: 32, cores: 4 }).jvmArgs).toContain('-XX:+UseG1GC');
    expect(buildProfile('eco', { totalGb: 16, cores: 8 }).jvmArgs).toContain('-XX:+UseG1GC');
    expect(sanitizeJvmArgs('-Xmx9G -XX:+UseG1GC foo -Xms1G  -Dx=1')).toEqual(['-XX:+UseG1GC', '-Dx=1']);
  });

  test('masquage : jetons, mots de passe, e-mails, home -> ~', () => {
    const txt = [
      'java --accessToken tok-abcdef123 --uuid 1111 -Dfoo',
      'password=hunter2 et "access_token": "zzzzzzzz1234"',
      'Authorization: Bearer abc.def.ghi-123456',
      'contact moi@example.fr', '/home/alice/.nexus/logs et C:\\Users\\Bob\\AppData',
      'valeur-secrete-connue', 'ligne normale',
    ].join('\n');
    const out = redact(txt, { homes: ['/home/alice'], secrets: ['valeur-secrete-connue'] });
    for (const leak of ['tok-abcdef123', 'hunter2', 'zzzzzzzz1234', 'abc.def.ghi', 'moi@example.fr', 'alice', 'Bob', 'valeur-secrete-connue', ' 1111']) expect(out, leak).not.toContain(leak);
    expect(out).toContain('~/.nexus/logs');
    expect(out).toContain('ligne normale');
    expect(tailLines(Array.from({ length: 400 }, (_, i) => `l${i}`).join('\n'), 300).split('\n')).toHaveLength(300);
  });
});

test.describe('profils : interface (RAM simulée)', () => {
  test('16 Go / 8 cœurs : recommande Performant, applique après confirmation et mémorise', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { env: { NEXUS_SIM_RAM_GB: '16', NEXUS_SIM_FREE_GB: '9', NEXUS_SIM_CORES: '8', NEXUS_SIM_GPU: 'GPU Test 1234' } });
    try {
      await panelActive(L.win, 'home');
      await openAdvanced(L.win);
      await expect(L.win.locator('#perf-hw')).toContainText(/16 (Go|GB)/);
      await expect(L.win.locator('#perf-hw')).toContainText('GPU Test 1234');
      await expect(L.win.locator('#perf-profile-select')).toHaveValue('performance');
      await expect(L.win.locator('#perf-details')).toContainText('ZGC');
      await shot(L.win, 'settings-performances');

      // Refus de la confirmation : rien n'est appliqué.
      await L.win.evaluate(() => { window.confirm = () => false; });
      await L.win.locator('#perf-optimize-btn').click();
      expect(await L.win.evaluate(() => localStorage.getItem('nexus_perf_profile'))).toBeNull();

      await L.win.evaluate(() => { window.confirm = () => true; });
      await L.win.locator('#perf-optimize-btn').click();
      await expect(L.win.locator('#perf-status')).toHaveClass(/repair-status-ok/);
      const stored = JSON.parse(await L.win.evaluate(() => localStorage.getItem('nexus_perf_profile')));
      expect(stored).toMatchObject({ id: 'performance', ramMin: 4, ramMax: 8, modified: false });
      await expect(L.win.locator('#jvm-args-input')).toHaveValue(/UseZGC/);
      await expect(L.win.locator('.slider-touch-right span')).toHaveAttribute('value', '8 Go');

      // Persisté en base (utilisé au lancement).
      const db = await L.win.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('database');
        r.onsuccess = () => {
          const d = r.result; const out = {};
          const get = (s) => new Promise(ok => { const q = d.transaction(s).objectStore(s).getAll(); q.onsuccess = () => ok(q.result[0]?.value); });
          Promise.all([get('ram'), get('java-args')]).then(([ram, args]) => { out.ram = ram; out.args = args; res(out); });
        };
      }));
      expect(db.ram).toMatchObject({ ramMin: '4', ramMax: '8' });
      expect(db.args.args).toContain('-XX:+UseZGC');

      // Modifiable à la main : le profil devient « modifié », -Xmx est retiré.
      await L.win.locator('#jvm-args-input').fill('-XX:+UseG1GC -Xmx12G -Dtest=1');
      await L.win.locator('#jvm-args-input').blur();
      await expect(L.win.locator('#jvm-args-input')).toHaveValue('-XX:+UseG1GC -Dtest=1');
      await expect(L.win.locator('#perf-current')).toContainText(/modifié|edited by hand/);
      expect(fatal(L.logs)).toEqual([]);
    } finally { await L.close(); }
  });

  test('4 Go : avertissement RAM insuffisante, bouton inactif, rien n\'est appliqué', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { env: { NEXUS_SIM_RAM_GB: '4', NEXUS_SIM_CORES: '2' } });
    try {
      await panelActive(L.win, 'home');
      await openAdvanced(L.win);
      await expect(L.win.locator('#perf-profile-select')).toHaveValue('eco');
      await expect(L.win.locator('#perf-warnings')).toContainText(/RAM insuffisante|Not enough RAM/);
      await expect(L.win.locator('#perf-optimize-btn')).toBeDisabled();
      expect(await L.win.evaluate(() => localStorage.getItem('nexus_perf_profile'))).toBeNull();
    } finally { await L.close(); }
  });

  test('8 Go : Équilibré plafonné à 60 % (4 Go) avec avertissement', async () => {
    mock.setMode('ok');
    const L = await launchLauncher(mock, { env: { NEXUS_SIM_RAM_GB: '8', NEXUS_SIM_CORES: '4' } });
    try {
      await panelActive(L.win, 'home');
      await openAdvanced(L.win);
      await expect(L.win.locator('#perf-profile-select')).toHaveValue('balanced');
      await expect(L.win.locator('#perf-details')).toContainText(/3–4 (Go|GB)/);
      await expect(L.win.locator('#perf-warnings')).toContainText(/60 ?%/);
    } finally { await L.close(); }
  });
});

test.describe('diagnostic', () => {
  const prepareLogs = (home) => {
    const dir = gameDirFor(home);
    const lines = Array.from({ length: 500 }, (_, i) => `[2026-10-07] ligne-${i + 1}`);
    lines.push(`erreur chemin ${home}/.geoventure-e2e/mods/x.jar accessToken=tok-e2e Bearer abcdefgh12345 password=hunter2 joueur@example.fr`);
    writeFile(dir + '/logs/launcher.log', lines.join('\n') + '\n');
    writeFile(dir + '/logs/latest.log', '[main/INFO] Setting user: E2EPlayer\n[main/INFO] --accessToken tok-e2e\n');
  };

  test('rapport sans panel : sections, 300 lignes, secrets et home masqués, copie possible', async () => {
    mock.setMode('down');
    const L = await launchLauncher(mock, { prepare: prepareLogs });
    try {
      await L.win.waitForLoadState('domcontentloaded');
      await L.win.waitForSelector('.panel.active', { timeout: 20000 }).catch(() => {});
      await L.win.evaluate(() => document.getElementById('settings-btn') && 0);
      // Le panneau d'accueil peut être en erreur (panel coupé) : on ouvre les réglages si le bouton existe.
      if (await L.win.locator('#settings-btn').count()) await openAdvanced(L.win);
      else { mock.setMode('ok'); await L.win.reload(); await panelActive(L.win, 'home'); mock.setMode('down'); await openAdvanced(L.win); }
      await L.win.locator('#diag-run-btn').click();
      await expect(L.win.locator('#diag-result')).toBeVisible({ timeout: 30000 });
      const report = await L.win.locator('#diag-output').inputValue();
      await shot(L.win, 'settings-diagnostic');
      for (const h of ['Système', 'Matériel', 'Java', 'Configuration', 'Réseau', 'launcher.log', 'latest.log']) expect(report).toContain(h);
      expect(report).toMatch(/Launcher: Nexus \d+\.\d+\.\d+/);
      expect(report).toMatch(/OS: Linux/);
      expect(report).toMatch(/Session: /);
      expect(report).toMatch(/Panel: INJOIGNABLE/);
      expect(report).toContain('Instance active: geoventure');
      // 300 dernières lignes seulement.
      expect(report).toContain('ligne-500');
      expect(report).toContain('ligne-202');
      expect(report).not.toContain('ligne-150 ');
      expect(report).not.toMatch(/ligne-150\b/);
      // Masquage.
      for (const leak of ['tok-e2e', 'hunter2', 'abcdefgh12345', 'joueur@example.fr', L.home]) expect(report, leak).not.toContain(leak);
      expect(report).toContain('~/.geoventure-e2e');
      expect(report).toContain('[MASQUÉ]');
      expect(fatal(L.logs)).toEqual([]);
    } finally { mock.setMode('ok'); await L.close(); }
  });

  test('envoi au panel : jamais sans clic, 404 toléré, puis succès si le panel accepte', async () => {
    mock.setMode('ok');
    mock.setDiagnosticAccept(false);
    const L = await launchLauncher(mock, { prepare: prepareLogs });
    try {
      await panelActive(L.win, 'home');
      await openAdvanced(L.win);
      await L.win.locator('#diag-run-btn').click();
      await expect(L.win.locator('#diag-result')).toBeVisible({ timeout: 30000 });
      expect(await L.win.locator('#diag-output').inputValue()).toMatch(/Panel: joignable/);
      expect(mock.hits.filter(h => h.path === '/utils/diagnostic')).toHaveLength(0);   // rien d'envoyé sans clic

      await L.win.locator('#diag-send-btn').click();
      await expect(L.win.locator('#diag-status')).toContainText('404', { timeout: 15000 });
      await expect(L.win.locator('#diag-status')).toHaveClass(/repair-status-error/);
      expect(mock.hits.filter(h => h.path === '/utils/diagnostic' && h.method === 'POST')).toHaveLength(1);

      mock.setDiagnosticAccept(true);
      await L.win.locator('#diag-send-btn').click();
      await expect(L.win.locator('#diag-status')).toHaveClass(/repair-status-ok/, { timeout: 15000 });
      const post = mock.hits.filter(h => h.path === '/utils/diagnostic' && h.method === 'POST').pop();
      const body = JSON.parse(post.body);
      expect(body.launcherVersion).toMatch(/^\d+\./);
      expect(body.report).not.toContain('tok-e2e');
      expect(fatal(L.logs)).toEqual([]);
    } finally { mock.setDiagnosticAccept(false); await L.close(); }
  });
});
