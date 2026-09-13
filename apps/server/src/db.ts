// 数据层：使用 Node 22 内置 SQLite（开发环境兜底，后续可切 PostgreSQL，见根目录 docker-compose.yml）
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'data/memory-palace.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  wechat_openid TEXT UNIQUE,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'login',
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  sent_ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS palaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal','public')),
  name TEXT NOT NULL,
  cover_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

export function nowISO() {
  return new Date().toISOString();
}

export function uuid() {
  return crypto.randomUUID();
}
