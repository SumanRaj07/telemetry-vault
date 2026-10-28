// Versioned schema migrations. Applied in order by database.ts using
// PRAGMA user_version. Never edit an applied migration; add a new one.
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#65A878',
  classification TEXT NOT NULL DEFAULT 'neutral',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  process_name TEXT NOT NULL UNIQUE,
  executable_path TEXT,
  category_id INTEGER NOT NULL DEFAULT 8,
  classification TEXT NOT NULL DEFAULT 'neutral',
  tracking_enabled INTEGER NOT NULL DEFAULT 1,
  excluded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS activity_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  project_id INTEGER,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'foreground',
  confidence REAL NOT NULL DEFAULT 1.0,
  manual INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'closed',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES applications(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_app_start ON activity_sessions(app_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_project_start ON activity_sessions(project_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON activity_sessions(start_ms);
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  app_id INTEGER,
  project_id INTEGER,
  metadata TEXT,
  FOREIGN KEY (app_id) REFERENCES applications(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_events_time ON activity_events(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_events_type ON activity_events(type);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#286844',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project_repositories (
  project_id INTEGER NOT NULL,
  repo_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, repo_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  project_id INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scan_ms INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS git_commits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  hash TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_email TEXT,
  commit_ms INTEGER NOT NULL,
  branch TEXT,
  first_seen_ms INTEGER NOT NULL,
  UNIQUE (repo_id, hash),
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_commits_repo_time ON git_commits(repo_id, commit_ms);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER,
  planned_ms INTEGER NOT NULL,
  actual_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  project_id INTEGER,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target_ms INTEGER NOT NULL,
  period TEXT NOT NULL DEFAULT 'weekly',
  project_id INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  period TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  UNIQUE (type, period)
);
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE IF NOT EXISTS app_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_text TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'neutral'
);
CREATE TABLE IF NOT EXISTS repo_languages (
  repo_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  files INTEGER NOT NULL DEFAULT 0,
  updated_ms INTEGER NOT NULL,
  PRIMARY KEY (repo_id, language),
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual'
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_note TEXT,
  created_ms INTEGER NOT NULL
);
`,
  },
];
