// 板块②：宫殿（角落）与成员 P1~P9（规格书 §3.2）
// 命名口径：接口路径保持 /palaces，界面文字统一显示「角落」
import { Router, Request, Response } from 'express';
import { randomInt } from 'node:crypto';
import { db, nowISO, uuid } from './db';
import { requireAuth } from './auth';

export const palacesRouter = Router();

/* ---------- 工具 ---------- */

// 是否有访问权：owner 或 已加入成员
function accessRole(palace: any, userId: string): 'owner' | 'member' | null {
  if (palace.owner_id === userId) return 'owner';
  const m = db
    .prepare(`SELECT id FROM palace_member WHERE palace_id = ? AND user_id = ?`)
    .get(palace.id, userId);
  return m ? 'member' : null;
}

// PalaceVO（柜数/物品数待板块③接入后替换为真实统计）
function palaceVO(p: any, role?: string, memberCount?: number) {
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    cabinet_count: 0,
    item_count: 0,
    cover_thumbnail_url: null,
    member_count: memberCount ?? 1,
    updated_at: p.updated_at,
    ...(role ? { my_role: role } : {}),
  };
}

function bad(res: Response, code: number, message: string, status = 400) {
  return res.status(status).json({ code, message, data: null });
}

/* ---------- P1 我的角落列表 ---------- */
palacesRouter.get('/', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const rows = db
    .prepare(
      `SELECT p.* FROM palaces p
       WHERE p.owner_id = ?
          OR p.id IN (SELECT palace_id FROM palace_member WHERE user_id = ?)
       ORDER BY CASE WHEN p.type = 'personal' THEN 0 ELSE 1 END, p.updated_at DESC`
    )
    .all(userId, userId) as any[];
  const data = rows.map((p) => {
    const role = accessRole(p, userId);
    const memberCount =
      1 +
      (db.prepare(`SELECT COUNT(*) AS c FROM palace_member WHERE palace_id = ?`).get(p.id) as any).c;
    return palaceVO(p, role, memberCount);
  });
  res.json({ code: 0, message: 'ok', data: { palaces: data } });
});

/* ---------- P2 创建角落（个人/公共均可，产品决议：个人角落可多个） ---------- */
palacesRouter.post('/', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const name = String((req.body || {}).name || '').trim();
  const type = (req.body || {}).type === 'personal' ? 'personal' : 'public';
  if (!name || name.length > 20) return bad(res, 40001, '角落名称需为 1~20 个字');
  const now = nowISO();
  const id = uuid();
  db.prepare(`INSERT INTO palaces (id, owner_id, type, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, userId, type, name, now, now);
  const p = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(id);
  res.json({ code: 0, message: 'ok', data: { palace: palaceVO(p, 'owner', 1) } });
});

/* ---------- P8 凭邀请码加入（须先于 /:palace_id 注册，避免歧义） ---------- */
palacesRouter.post('/join', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!code) return bad(res, 40001, '请输入邀请码');
  const inv = db.prepare(`SELECT * FROM invite_code WHERE code = ?`).get(code) as any;
  if (!inv) return bad(res, 40401, '邀请码无效', 404);
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    return bad(res, 41002, '邀请码已过期');
  }
  if (inv.max_uses && inv.used_count >= inv.max_uses) {
    return bad(res, 41002, '邀请码次数已用尽');
  }
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(inv.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在或已被删除', 404);
  if (accessRole(palace, userId)) {
    return res.json({ code: 0, message: '你已在角落里', data: { palace: palaceVO(palace, accessRole(palace, userId)!) } });
  }
  db.prepare(`INSERT INTO palace_member (id, palace_id, user_id, role, joined_at) VALUES (?, ?, ?, 'member', ?)`)
    .run(uuid(), palace.id, userId, nowISO());
  db.prepare(`UPDATE invite_code SET used_count = used_count + 1 WHERE id = ?`).run(inv.id);
  res.json({ code: 0, message: 'ok', data: { palace: palaceVO(palace, 'member') } });
});

/* ---------- P3 角落详情 ---------- */
palacesRouter.get('/:palace_id', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(req.params.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  const role = accessRole(palace, userId);
  if (!role) return bad(res, 40301, '你还不是这个角落的成员', 403);
  const memberCount =
    1 + (db.prepare(`SELECT COUNT(*) AS c FROM palace_member WHERE palace_id = ?`).get(palace.id) as any).c;
  res.json({ code: 0, message: 'ok', data: { palace: palaceVO(palace, role, memberCount) } });
});

/* ---------- P4 修改角落（仅 owner） ---------- */
palacesRouter.patch('/:palace_id', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(req.params.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  if (palace.owner_id !== userId) return bad(res, 40301, '只有创建者可以修改', 403);
  const name = String((req.body || {}).name || '').trim();
  if (!name || name.length > 20) return bad(res, 40001, '角落名称需为 1~20 个字');
  db.prepare(`UPDATE palaces SET name = ?, updated_at = ? WHERE id = ?`).run(name, nowISO(), palace.id);
  const updated = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(palace.id);
  res.json({ code: 0, message: 'ok', data: { palace: palaceVO(updated, 'owner') } });
});

/* ---------- P5 删除角落（仅 owner；默认个人角落不可删） ---------- */
palacesRouter.delete('/:palace_id', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(req.params.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  if (palace.owner_id !== userId) return bad(res, 40301, '只有创建者可以删除', 403);
  if (palace.type === 'personal') {
    // 默认个人角落（最早创建的那个）不可删；后续新建的个人角落可删
    const oldest = db
      .prepare(`SELECT id FROM palaces WHERE owner_id = ? AND type = 'personal' ORDER BY created_at ASC LIMIT 1`)
      .get(userId) as any;
    if (oldest && oldest.id === palace.id) return bad(res, 40001, '默认个人角落不能删除');
  }
  db.prepare(`DELETE FROM palaces WHERE id = ?`).run(palace.id);
  db.prepare(`DELETE FROM palace_member WHERE palace_id = ?`).run(palace.id);
  db.prepare(`DELETE FROM invite_code WHERE palace_id = ?`).run(palace.id);
  res.json({ code: 0, message: 'ok', data: { success: true } });
});

/* ---------- P6 成员列表 ---------- */
palacesRouter.get('/:palace_id/members', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(req.params.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  if (!accessRole(palace, userId)) return bad(res, 40301, '你还不是这个角落的成员', 403);
  const owner = db.prepare(`SELECT * FROM users WHERE id = ?`).get(palace.owner_id) as any;
  const joined = db
    .prepare(
      `SELECT u.id AS user_id, u.nickname, u.avatar_url, m.joined_at
       FROM palace_member m JOIN users u ON u.id = m.user_id
       WHERE m.palace_id = ? ORDER BY m.joined_at ASC`
    )
    .all(palace.id) as any[];
  const members = [
    { user_id: owner.id, nickname: owner.nickname, avatar_url: owner.avatar_url, role: 'owner', joined_at: palace.created_at },
    ...joined.map((j) => ({ ...j, role: 'member' })),
  ];
  res.json({ code: 0, message: 'ok', data: { members } });
});

/* ---------- P7 生成邀请码（仅 owner，公共角落） ---------- */
palacesRouter.post('/:palace_id/invite-codes', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(req.params.palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  if (palace.owner_id !== userId) return bad(res, 40301, '只有创建者可以生成邀请码', 403);
  if (palace.type !== 'public') return bad(res, 40001, '个人角落不需要邀请码');
  const { max_uses, expires_at } = req.body || {};
  // 8 位大写字母数字，去掉 0/O/1/I 等易混淆字符
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 8 }, () => alphabet[cryptoRandom(alphabet.length)]).join('');
  } while (db.prepare(`SELECT id FROM invite_code WHERE code = ?`).get(code));
  db.prepare(
    `INSERT INTO invite_code (id, palace_id, code, created_by, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), palace.id, code, userId, max_uses ?? null, expires_at ?? null, nowISO());
  const share_text = `【小角落】邀请你加入公共角落「${palace.name}」！\n邀请码：${code}\n打开小角落 → 首页 → 输入邀请码，即可加入我们一起记录时光。`;
  res.json({ code: 0, message: 'ok', data: { code, share_text } });
});

function cryptoRandom(max: number) {
  return randomInt(0, max);
}

/* ---------- P9 移除成员 / 退出 ---------- */
palacesRouter.delete('/:palace_id/members/:user_id', requireAuth, (req, res) => {
  const userId = (req as any).userId as string;
  const { palace_id, user_id } = req.params as any;
  const palace = db.prepare(`SELECT * FROM palaces WHERE id = ?`).get(palace_id) as any;
  if (!palace) return bad(res, 40401, '角落不存在', 404);
  const isSelf = user_id === userId;

  if (isSelf) {
    if (palace.owner_id === userId) return bad(res, 40001, '创建者不能退出自己创建的角落，可选择删除角落');
  } else if (palace.owner_id !== userId) {
    return bad(res, 40301, '只有创建者可以移除成员', 403);
  }
  const m = db.prepare(`SELECT id FROM palace_member WHERE palace_id = ? AND user_id = ?`).get(palace_id, user_id);
  if (!m) return bad(res, 40401, '该用户不是此角落成员', 404);
  db.prepare(`DELETE FROM palace_member WHERE palace_id = ? AND user_id = ?`).run(palace_id, user_id);
  res.json({ code: 0, message: 'ok', data: { success: true } });
});
