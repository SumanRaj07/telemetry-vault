// Cross-platform dev runner: starts the Vite dev server for the renderer,
// then launches Electron pointing at it. Usage: `npm run dev`.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = spawn('npx', ['vite'], { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env } });

let started = false;
const startElectron = () => {
  if (started) return;
  started = true;
  const electron = spawn('npx', ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ELECTRON_RENDERER_URL: 'http://localhost:5173' },
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
};
// Vite is usually ready in ~2s; wait a little, then launch regardless.
setTimeout(startElectron, 3000);
vite.on('exit', (code) => {
  if (!started) process.exit(code ?? 0);
});
