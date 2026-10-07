import { defineConfig } from '@playwright/test';

// Tests E2E : vrai Electron (sous xvfb) + faux panel HTTP local. Voir CLAUDE.md « Tests E2E ».
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  timeout: 90000,
  reporter: [['list']],
  outputDir: 'tests/e2e/.tmp/results',
});
