// 认证接口：A1 发验证码 / A2 验证码登录 / A5 我的信息 / A6 刷新 / A7 退出
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, nowISO, uuid } from './db';
import { sendSmsCode, verifySmsCode } from './sms';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
const ACCESS_TTL_SECONDS = 2 * 3600; // 2 小时
const REFRESH_TTL_DAYS = 30;

function signAccess(userId: string) {
  return jwt.sign({ sub: userId, typ: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

function issueRefresh(userId: string) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600_000).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(uuid(), userId, token, expiresAt, nowISO());
  return token;
}

export function userVO(u: any) {
  return { id: u.id, phone: u.phone, nickname: u.nickname, avatar_url: u.avatar_url };
}

// 鉴权中间件：解析 Bearer token，失败返回 40101
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ code: 40101, message: '未登录', data: null });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.typ !== 'access') throw new Error('bad type');
    (req as any).userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ code: 40101, message: '登录已失效', data: null });
  }
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

// A1 发送短信验证码
authRouter.post('/sms/send', (req, res) => {
  const { phone } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  const result = sendSmsCode(String(phone || ''), ip);
  if (!result.ok) return res.status(result.code === 42901 ? 429 : 400).json({ code: result.code, message: result.message, data: null });
  res.json({ code: 0, message: 'ok', data: { sent: true, cooldown_seconds: result.cooldown_seconds, mock_code: result.mock_code } });
});

// A2 验证码登录/注册（新用户自动注册并创建默认个人宫殿）
authRouter.post('/sms/login', (req, res) => {
  const { phone: rawPhone, code } = req.body || {};
  const phone = String(rawPhone || '');
  if (!/^1\d{10}$/.test(phone) || !String(code || '').trim()) {
    return res.status(400).json({ code: 40001, message: '请填写手机号和验证码', data: null });
  }
  if (!verifySmsCode(phone, String(code).trim())) {
    return res.status(400).json({ code: 40901, message: '验证码错误或已过期', data: null });
  }

  let user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone) as any;
  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    const id = uuid();
    const now = nowISO();
    db.prepare(`INSERT INTO users (id, phone, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, phone, `交交者${phone.slice(-4)}`, now, now);
    db.prepare(`INSERT INTO palaces (id, owner_id, type, name, created_at, updated_at) VALUES (?, ?, 'personal', ?, ?, ?)`)
      .run(uuid(), id, '我的小角落', now, now);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  }

  const refreshToken = issueRefresh(user.id);
  res.json({
    code: 0,
    message: 'ok',
    data: {
      access_token: signAccess(user.id),
      refresh_token: refreshToken,
      expires_in: ACCESS_TTL_SECONDS,
      user: { ...userVO(user), phone_masked: maskPhone(user.phone) },
      is_new_user: isNewUser,
    },
  });
});

// A5 当前用户信息
authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get((req as any).userId) as any;
  if (!user) return res.status(404).json({ code: 40401, message: '用户不存在', data: null });
  const palace = db
    .prepare(`SELECT id, name FROM palaces WHERE owner_id = ? AND type = 'personal' LIMIT 1`)
    .get(user.id) as any;
  res.json({
    code: 0,
    message: 'ok',
    data: { user: { ...userVO(user), phone_masked: maskPhone(user.phone) }, personal_palace: palace || null },
  });
});

// A6 刷新 access_token
authRouter.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  const session = db.prepare(`SELECT * FROM sessions WHERE refresh_token = ?`).get(String(refresh_token || '')) as any;
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ code: 40101, message: '登录已失效，请重新登录', data: null });
  }
  res.json({ code: 0, message: 'ok', data: { access_token: signAccess(session.user_id), expires_in: ACCESS_TTL_SECONDS } });
});

// A7 退出登录（作废 refresh 会话）
authRouter.post('/logout', requireAuth, (req, res) => {
  const { refresh_token } = req.body || {};
  if (refresh_token) db.prepare(`DELETE FROM sessions WHERE refresh_token = ?`).run(String(refresh_token));
  res.json({ code: 0, message: 'ok', data: { success: true } });
});
