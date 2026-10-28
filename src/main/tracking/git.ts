// Git integration via the Git CLI. All invocations use execFile with an
// argument array (never a shell string), so repository paths cannot inject
// commands. Timeouts and output caps bound every call. Repositories are
// never modified and no source code is read for commit tracking.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGE_EXCLUDED_DIRS, LANGUAGE_EXTENSIONS } from '../../shared/constants';

export interface ParsedCommit {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string | null;
  commitMs: number;
  branch: string | null;
}

export interface ScanResult {
  commits: ParsedCommit[];
  branch: string | null;
  clean: boolean;
  languages: { language: string; files: number }[];
}

function runGit(args: string[], cwd: string, timeoutMs: number, maxBuffer: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: timeoutMs, maxBuffer, windowsHide: true }, (err, stdout) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${(err as Error).message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** Validate a user-supplied path before any filesystem or git use. */
export function validateRepoPath(p: string): void {
  if (typeof p !== 'string' || p.includes('\0')) throw new Error('Invalid path.');
  if (!path.isAbsolute(p)) throw new Error('Path must be absolute.');
  const parsed = path.parse(p);
  if (p === parsed.root) throw new Error('Refusing to scan a filesystem root.');
  const stat = fs.statSync(p);
  if (!stat.isDirectory()) throw new Error('Path is not a directory.');
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await runGit(['--version'], process.cwd(), 10000, 1024 * 64);
    return true;
  } catch {
    return false;
  }
}

function isRepoDir(dir: string): boolean {
  try {
    const gitPath = path.join(dir, '.git');
    if (!fs.existsSync(gitPath)) return false;
    const stat = fs.statSync(gitPath);
    return stat.isDirectory() || stat.isFile(); // file = linked worktree
  } catch {
    return false;
  }
}

/**
 * Discover repositories under a root folder, bounded by depth and count.
 * Hidden directories, node_modules, and .git internals are never descended
 * into, and the filesystem root is refused (see validateRepoPath).
 */
export function discoverRepositories(rootDir: string, maxDepth = 3, maxResults = 200): { path: string; name: string }[] {
  validateRepoPath(rootDir);
  const found: { path: string; name: string }[] = [];
  const walk = (dir: string, depth: number): void => {
    if (found.length >= maxResults || depth > maxDepth) return;
    if (isRepoDir(dir)) {
      found.push({ path: dir, name: path.basename(dir) });
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (found.length >= maxResults) return;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  walk(rootDir, 0);
  return found;
}

function parseBranch(refNames: string): string | null {
  // %D examples: "HEAD -> main, origin/main", "tag: v1.2", ""
  if (!refNames) return null;
  const head = refNames.split(',').map((s) => s.trim()).find((s) => s.startsWith('HEAD -> '));
  if (head) return head.replace('HEAD -> ', '');
  const first = refNames.split(',').map((s) => s.trim())[0];
  if (!first || first.startsWith('tag:')) return null;
  return first;
}

export async function scanRepository(repoPath: string): Promise<ScanResult> {
  validateRepoPath(repoPath);
  if (!isRepoDir(repoPath)) throw new Error('Not a Git repository (no .git found).');
  const log = await runGit(
    ['-C', repoPath, 'log', '--all', '--format=%H%x1f%an%x1f%ae%x1f%ad%x1f%D%x1f%s', '--date=iso-strict', '--max-count=5000'],
    repoPath,
    60000,
    10 * 1024 * 1024,
  );
  const commits: ParsedCommit[] = [];
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\x1f');
    if (parts.length < 6) continue;
    const [hash, authorName, authorEmail, dateStr, refNames, message] = parts as [string, string, string, string, string, string];
    const commitMs = Date.parse(dateStr);
    if (!hash || Number.isNaN(commitMs)) continue;
    commits.push({
      hash,
      message: message ?? '',
      authorName: authorName ?? '',
      authorEmail: authorEmail || null,
      commitMs,
      branch: parseBranch(refNames ?? ''),
    });
  }
  let branch: string | null = null;
  let clean = true;
  try {
    const status = await runGit(['-C', repoPath, 'status', '--porcelain=v1', '--branch'], repoPath, 15000, 1024 * 1024);
    const lines = status.split('\n').filter(Boolean);
    const headLine = lines.find((l) => l.startsWith('## '));
    if (headLine) {
      const m = headLine.replace('## ', '').split('...')[0];
      branch = m && m !== 'No commits yet on ' ? m : null;
    }
    clean = lines.filter((l) => !l.startsWith('## ')).length === 0;
  } catch {
    // Status is best-effort; commit data is what matters.
  }
  const languages = scanLanguages(repoPath);
  return { commits, branch, clean, languages };
}

/** Count source files by language, excluding build/dependency directories. */
export function scanLanguages(repoPath: string, maxFiles = 20000): { language: string; files: number }[] {
  const counts = new Map<string, number>();
  let seen = 0;
  const walk = (dir: string): void => {
    if (seen >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= maxFiles) return;
      if (entry.isDirectory()) {
        if (LANGUAGE_EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        seen += 1;
        const lang = LANGUAGE_EXTENSIONS[path.extname(entry.name).toLowerCase()];
        if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  };
  walk(repoPath);
  return [...counts.entries()]
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files);
}
