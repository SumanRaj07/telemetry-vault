import type { AppCategory, Classification, Settings } from './types';

// Default application categories with their display color and default
// productivity classification. Colors come from the light-green design system.
export const CATEGORIES: Record<
  AppCategory,
  { label: string; color: string; classification: Classification }
> = {
  development: { label: 'Development', color: '#286844', classification: 'productive' },
  browser: { label: 'Browser', color: '#65A878', classification: 'neutral' },
  communication: { label: 'Communication', color: '#4A90A4', classification: 'neutral' },
  productivity: { label: 'Productivity', color: '#2E8B57', classification: 'productive' },
  entertainment: { label: 'Entertainment', color: '#C28A35', classification: 'distracting' },
  utilities: { label: 'Utilities', color: '#718074', classification: 'neutral' },
  other: { label: 'Other', color: '#718074', classification: 'neutral' },
  uncategorized: { label: 'Uncategorized', color: '#9AA89F', classification: 'neutral' },
};

// Process-name match rules (matched case-insensitively against the process
// basename without .exe). Order matters: first match wins.
export const APP_RULES: { match: string; category: AppCategory; classification: Classification }[] = [
  // Development tools
  { match: 'code', category: 'development', classification: 'productive' },
  { match: 'devenv', category: 'development', classification: 'productive' },
  { match: 'idea64', category: 'development', classification: 'productive' },
  { match: 'idea', category: 'development', classification: 'productive' },
  { match: 'pycharm64', category: 'development', classification: 'productive' },
  { match: 'webstorm64', category: 'development', classification: 'productive' },
  { match: 'android studio', category: 'development', classification: 'productive' },
  { match: 'studio64', category: 'development', classification: 'productive' },
  { match: 'eclipse', category: 'development', classification: 'productive' },
  { match: 'netbeans64', category: 'development', classification: 'productive' },
  { match: 'sublime_text', category: 'development', classification: 'productive' },
  { match: 'notepad++', category: 'development', classification: 'productive' },
  { match: 'nvim', category: 'development', classification: 'productive' },
  { match: 'vim', category: 'development', classification: 'productive' },
  { match: 'windowsterminal', category: 'development', classification: 'productive' },
  { match: 'wt', category: 'development', classification: 'productive' },
  { match: 'powershell', category: 'development', classification: 'productive' },
  { match: 'pwsh', category: 'development', classification: 'productive' },
  { match: 'cmd', category: 'development', classification: 'productive' },
  { match: 'git-bash', category: 'development', classification: 'productive' },
  { match: 'bash', category: 'development', classification: 'productive' },
  { match: 'cursor', category: 'development', classification: 'productive' },
  { match: 'windsurf', category: 'development', classification: 'productive' },
  { match: 'zed', category: 'development', classification: 'productive' },
  // Browsers
  { match: 'chrome', category: 'browser', classification: 'neutral' },
  { match: 'msedge', category: 'browser', classification: 'neutral' },
  { match: 'firefox', category: 'browser', classification: 'neutral' },
  { match: 'brave', category: 'browser', classification: 'neutral' },
  { match: 'opera', category: 'browser', classification: 'neutral' },
  { match: 'vivaldi', category: 'browser', classification: 'neutral' },
  // Communication
  { match: 'slack', category: 'communication', classification: 'neutral' },
  { match: 'teams', category: 'communication', classification: 'neutral' },
  { match: 'discord', category: 'communication', classification: 'neutral' },
  { match: 'telegram', category: 'communication', classification: 'neutral' },
  { match: 'whatsapp', category: 'communication', classification: 'neutral' },
  { match: 'outlook', category: 'communication', classification: 'neutral' },
  { match: 'thunderbird', category: 'communication', classification: 'neutral' },
  // Productivity
  { match: 'winword', category: 'productivity', classification: 'productive' },
  { match: 'excel', category: 'productivity', classification: 'productive' },
  { match: 'powerpnt', category: 'productivity', classification: 'productive' },
  { match: 'onenote', category: 'productivity', classification: 'productive' },
  { match: 'notion', category: 'productivity', classification: 'productive' },
  { match: 'obsidian', category: 'productivity', classification: 'productive' },
  // Entertainment
  { match: 'spotify', category: 'entertainment', classification: 'distracting' },
  { match: 'steam', category: 'entertainment', classification: 'distracting' },
  { match: 'vlc', category: 'entertainment', classification: 'distracting' },
  { match: 'netflix', category: 'entertainment', classification: 'distracting' },
  // Utilities
  { match: 'explorer', category: 'utilities', classification: 'neutral' },
  { match: 'systemsettings', category: 'utilities', classification: 'neutral' },
  { match: 'taskmgr', category: 'utilities', classification: 'neutral' },
];

// File extension -> programming language (used for repository composition).
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.py': 'Python', '.pyw': 'Python',
  '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++',
  '.cs': 'C#', '.dart': 'Dart', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby',
  '.php': 'PHP', '.swift': 'Swift', '.scala': 'Scala', '.pl': 'Perl',
  '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'CSS', '.less': 'CSS',
  '.sql': 'SQL', '.sh': 'Shell', '.bash': 'Shell', '.ps1': 'PowerShell', '.psm1': 'PowerShell',
  '.vue': 'Vue', '.svelte': 'Svelte', '.lua': 'Lua', '.r': 'R', '.jl': 'Julia',
  '.md': 'Markdown', '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
};

// Directories never scanned for language statistics.
export const LANGUAGE_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage', '.next',
  'vendor', 'Pods', '.gradle', '.terraform',
]);

export const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  idleThresholdSec: 300,
  pollIntervalMs: 5000,
  collectWindowTitles: false,
  collectExecutablePaths: true,
  scheduleEnabled: false,
  scheduleStartHour: 8,
  scheduleEndHour: 20,
  scheduleDays: [1, 2, 3, 4, 5],
  lockBehavior: 'stop_session',
  gitEnabled: true,
  gitScanIntervalMin: 60,
  gitFoldersJson: '[]',
  browserIntegrationEnabled: false,
  localApiEnabled: false,
  localApiToken: '',
  localAiEnabled: false,
  notificationsEnabled: true,
  quietHoursEnabled: false,
  quietStartHour: 22,
  quietEndHour: 7,
  breakReminderMin: 0,
  retentionDays: 0,
  startOnLogin: false,
  startMinimized: false,
  timeFormat: '24h',
  firstDayOfWeek: 1,
  theme: 'light',
};

export const PROJECT_COLORS = [
  '#286844', '#65A878', '#2E8B57', '#4A90A4', '#C28A35',
  '#8E6BBF', '#C74646', '#718074', '#D97B29', '#3A7CA5',
];
