import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { startMock } from './mock-panel.mjs';
import { launchLauncher, shot, panelActive, installGame, gameDirFor, pillState } from './helpers.mjs';

let mock;
test.beforeAll(async () => { mock = await startMock(); });
test.afterAll(async () => { await mock.close(); });

const fatal = (logs) => logs.filter(l => l.type === 'pageerror' || /Uncaught|TypeError|ReferenceError|is not a function|Cannot read/.test(l.text));

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
