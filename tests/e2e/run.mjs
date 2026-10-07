// Lance Playwright sous xvfb si aucun écran n'est disponible (Electron en a besoin).
import { spawnSync } from 'node:child_process';

const args = ['playwright', 'test', ...process.argv.slice(2)];
const cmd = process.env.DISPLAY || process.platform !== 'linux' ? ['npx', args] : ['xvfb-run', ['-a', 'npx', ...args]];
const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
