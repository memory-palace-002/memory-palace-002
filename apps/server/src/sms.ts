// 短信验证码服务：mock 模式（默认）+ 限流，预留真实短信服务商切换接口
import crypto from 'node:crypto';
import { db, nowISO, uuid } from './db';

const MOCK_CODE = '123456'; // 开发环境固定验证码；短信服务商备案完成后切 SMS_MODE=provider
export const SMS_MODE = process.env.SMS_MODE || 'mock';

const PHONE_RE = /^1\d{10}$/;

type SendResult =
  | { ok: true; cooldown_seconds: number; mock_code?: string }
  | { ok: false; code: number; message: string };

export function sendSmsCode(phone: string, ip: string): SendResult {
  if (!PHONE_RE.test(phone)) {
    return { ok: false, code: 40001, message: '手机号格式不正确' };
  }
  const now = Date.now();

  // 限流：同号 60s 内 1 条；同号 24h ≤10 条；同 IP 24h ≤30 条
  const last = db
    .prepare(`SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1`)
    .get(phone) as { created_at: string } | undefined;
  if (last && now - new Date(last.created_at).getTime() < 60_000) {
    return { ok: false, code: 42901, message: '发送太频繁，请稍后再试' };
  }
  const dayAgo = new Date(now - 24 * 3600_000).toISOString();
  const phoneCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM sms_codes WHERE phone = ? AND created_at > ?`).get(phone, dayAgo) as any
  ).c;
  if (phoneCount >= 10) {
    return { ok: false, code: 42901, message: '今日发送次数已达上限' };
  }
  const ipCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM sms_codes WHERE sent_ip = ? AND created_at > ?`).get(ip, dayAgo) as any
  ).c;
  if (ipCount >= 30) {
    return { ok: false, code: 42901, message: '当前网络发送次数已达上限' };
  }

  const code = SMS_MODE === 'mock' ? MOCK_CODE : String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash('sha256').update(`mp:${phone}:${code}`).digest('hex');
  const expiresAt = new Date(now + 5 * 60_000).toISOString();

  db.prepare(
    `INSERT INTO sms_codes (id, phone, code_hash, purpose, expires_at, sent_ip, created_at)
     VALUES (?, ?, ?, 'login', ?, ?, ?)`
  ).run(uuid(), phone, codeHash, expiresAt, ip, nowISO());

  // TODO: 接入真实短信服务商（腾讯云 SMS / 阿里云短信），在此处调用其 SDK 发送 code
  return { ok: true, cooldown_seconds: 60, mock_code: SMS_MODE === 'mock' ? MOCK_CODE : undefined };
}

export function verifySmsCode(phone: string, code: string): boolean {
  const codeHash = crypto.createHash('sha256').update(`mp:${phone}:${code}`).digest('hex');
  const nowISOStr = nowISO();
  const row = db
    .prepare(
      `SELECT id FROM sms_codes
       WHERE phone = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(phone, codeHash, nowISOStr) as { id: string } | undefined;
  if (!row) return false;
  db.prepare(`UPDATE sms_codes SET consumed_at = ? WHERE id = ?`).run(nowISOStr, row.id);
  return true;
}
