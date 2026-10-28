import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRepository } from '../../src/main/tracking/git';

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-repo-'));
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# demo\n');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync('git -c user.email=test@example.com -c user.name=Tester commit -m "initial commit"', { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'src', 'app.py'), 'print("hi")\n');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync('git -c user.email=test@example.com -c user.name=Tester commit -m "add python module"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

describe('scanRepository (real git CLI)', () => {
  it('parses commits, branch, and languages from a real repository', async () => {
    const dir = makeRepo();
    try {
      const result = await scanRepository(dir);
      expect(result.commits).toHaveLength(2);
      expect(result.commits.map((c) => c.message)).toContain('initial commit');
      expect(result.commits.map((c) => c.message)).toContain('add python module');
      expect(result.commits.every((c) => /^[0-9a-f]{40}$/.test(c.hash))).toBe(true);
      expect(result.branch).toBe('main');
      expect(result.clean).toBe(true);
      const langs = Object.fromEntries(result.languages.map((l) => [l.language, l.files]));
      expect(langs['TypeScript']).toBe(1);
      expect(langs['Python']).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a directory that is not a repository', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-notrepo-'));
    try {
      await expect(scanRepository(dir)).rejects.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
