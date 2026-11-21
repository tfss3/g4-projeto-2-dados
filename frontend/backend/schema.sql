PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('gestao','laboratorio','campo','diretoria')),
  password_hash TEXT, demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS traps (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('ovt','edl')),
  code TEXT NOT NULL COLLATE NOCASE, source TEXT NOT NULL,
  payload TEXT NOT NULL, UNIQUE(kind,code)
);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY, ovt_id TEXT NOT NULL REFERENCES traps(id),
  sample_code TEXT NOT NULL UNIQUE COLLATE NOCASE, cycle INTEGER NOT NULL CHECK(cycle>0),
  year INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL,
  UNIQUE(ovt_id,cycle,year)
);
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY, collection_id TEXT NOT NULL UNIQUE REFERENCES collections(id),
  created_by TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS maintenance (
  trap_id TEXT PRIMARY KEY REFERENCES traps(id), next_on TEXT NOT NULL,
  note TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, record_id TEXT NOT NULL, at TEXT NOT NULL
);
