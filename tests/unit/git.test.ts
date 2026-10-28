import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverRepositories,
  isGitAvailable,
  scanLanguages,
  validateRepoPath,
} from '../../src/main/tracking/git';

describe('git safety and discovery', () => {
  it('validateRepoPath rejects relative paths and filesystem roots', () => {
    expect(() => validateRepoPath('relative/path')).toThrow();
    expect(() => validateRepoPath(path.parse(process.cwd()).root)).toThrow();
    expect(() => validateRepoPath('/nonexistent-dir-xyz')).toThrow();
  });

  it('discovers repositories up to the depth limit and skips node_modules', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-discover-'));
    const repoA = path.join(root, 'proj-a');
    const nested = path.join(root, 'group', 'proj-b');
    const ignored = path.join(root, 'node_modules', 'proj-c');
    for (const dir of [repoA, nested, ignored]) {
      fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    }
    const found = discoverRepositories(root);
    const paths = found.map((f) => f.path);
    expect(paths).toContain(repoA);
    expect(paths).toContain(nested);
    expect(paths).not.toContain(ignored);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scanLanguages counts files by extension and skips excluded dirs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-lang-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'x');
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'x');
    fs.writeFileSync(path.join(root, 'src', 'c.py'), 'x');
    fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'd.ts'), 'x');
    const langs = scanLanguages(root);
    expect(langs.find((l) => l.language === 'TypeScript')?.files).toBe(2);
    expect(langs.find((l) => l.language === 'Python')?.files).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('git CLI is available in this environment', async () => {
    expect(await isGitAvailable()).toBe(true);
  });
});
