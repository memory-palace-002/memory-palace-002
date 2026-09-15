/**
 * Mock 服务端路由表 —— 路径与 §3 接口清单一一对应
 * 仅实现乙负责页面（P2/P3/P9/P7）所需 + 板块③⑤联调要读的数据，避免越界实现别人的板块。
 */
import {
  LIMITS,
  buildPeriodKey,
  isValidPeriodKey,
  type BlurbSource,
  type ItemVO,
  type Transform,
} from '@shared/index';
import {
  currentUser,
  currentUserId,
  genInviteCode,
  isMember,
  latestBlurb,
  loadDb,
  nextBlurbVersion,
  now,
  persist,
  roleOf,
  toMemberVO,
  toPalaceVO,
  touchPalace,
  uid,
} from './db';

export interface MockFailure {
  code: number;
  message: string;
}

function fail(code: number): never {
  throw { code, message: '' } as MockFailure;
}

/**
 * 演示用简介生成。真实后端会调用方舟（BLURB_SYSTEM_PROMPT）产出第一人称记录，
 * 此处无法调用方舟，故直接以「用户校订后的原话」作为记录，并兜底保证 80~250 字。
 */
function mockSummarize(transcript: string): string {
  const t = (transcript || '').replace(/\s+/g, '').trim();
  if (!t) return '';
  // 以用户口吻记录：把校订后的原话接在「我口述的这段，原话是：」之后
  let s = `我口述的这段，原话是：${t}`;
  if (s.length > LIMITS.BLURB_MAX) s = s.slice(0, LIMITS.BLURB_MAX);
  while (s.length < LIMITS.BLURB_MIN) s += '。'; // 演示兜底：真实服务端由方舟生成，不会出现
  return s;
}

type Handler = (params: Record<string, string>, body: any) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:(\w+)/g, (_m, key: string) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$',
  );
  return { method, pattern, keys, handler };
}

/* ------------------------------ 路由定义 ------------------------------ */

const routes: Route[] = [
  /* ---- Auth（板块①正式实现，此处仅为让乙页面跑通的最小桩） ---- */
  route('GET', '/auth/me', () => {
    const u = currentUser();
    return {
      id: u.id,
      phone: u.phone,
      nickname: u.nickname,
      avatar_url: u.avatar_url,
      wechat_bound: u.wechat_bound,
      created_at: u.created_at,
    };
  }),
  route('POST', '/auth/logout', () => ({ ok: true })),

  /* ---- P1 我的宫殿列表 ---- */
  route('GET', '/palaces', () => {
    const d = loadDb();
    const mine = d.palaces.filter((p) => isMember(p.id, d.current_user_id));
    const list = mine
      .map(toPalaceVO)
      .sort((a, b) => (a.type === b.type ? 0 : a.type === 'personal' ? -1 : 1));
    return { palaces: list };
  }),

  /* ---- P2 创建公共宫殿 ---- */
  route('POST', '/palaces', (_p, body: { name?: string }) => {
    const d = loadDb();
    const name = (body?.name ?? '').trim();
    if (!name) fail(42204);
    const palace = {
      id: uid('p'),
      owner_id: d.current_user_id,
      type: 'public' as const,
      name: name.slice(0, 30),
      cover_thumbnail_url: null,
      created_at: now(),
      updated_at: now(),
    };
    d.palaces.push(palace);
    d.members.push({
      palace_id: palace.id,
      user_id: d.current_user_id,
      role: 'owner' as const,
      joined_at: now(),
    });
    persist();
    return { palace: toPalaceVO(palace) };
  }),

  /* ---- P3 宫殿详情 ---- */
  route('GET', '/palaces/:id', (p) => {
    const d = loadDb();
    const palace = d.palaces.find((x) => x.id === p.id);
    if (!palace || !isMember(palace.id, d.current_user_id)) fail(40401);
    return { ...toPalaceVO(palace), owner_id: palace.owner_id, created_at: palace.created_at };
  }),

  /* ---- P4 修改宫殿 ---- */
  route('PATCH', '/palaces/:id', (p, body: { name?: string }) => {
    const d = loadDb();
    const palace = d.palaces.find((x) => x.id === p.id);
    if (!palace) fail(40401);
    if (roleOf(palace.id, d.current_user_id) !== 'owner') fail(40301);
    if (body?.name) palace.name = body.name.trim().slice(0, 30);
    palace.updated_at = now();
    persist();
    return toPalaceVO(palace);
  }),

  /* ---- P5 删除宫殿 ---- */
  route('DELETE', '/palaces/:id', (p) => {
    const d = loadDb();
    const palace = d.palaces.find((x) => x.id === p.id);
    if (!palace) fail(40401);
    if (palace.owner_id !== d.current_user_id) fail(40301);
    d.palaces = d.palaces.filter((x) => x.id !== p.id);
    const cabinetIds = d.cabinets.filter((c) => c.palace_id === p.id).map((c) => c.id);
    d.cabinets = d.cabinets.filter((c) => c.palace_id !== p.id);
    d.items = d.items.filter((i) => !cabinetIds.includes(i.cabinet_id));
    d.members = d.members.filter((m) => m.palace_id !== p.id);
    persist();
    return { id: p.id };
  }),

  /* ---- P6 成员列表 ---- */
  route('GET', '/palaces/:id/members', (p) => {
    const d = loadDb();
    if (!isMember(p.id, d.current_user_id)) fail(40301);
    const members = d.members
      .filter((m) => m.palace_id === p.id)
      .map(toMemberVO)
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1));
    return { members };
  }),

  /* ---- P7 生成邀请码 ---- */
  route(
    'POST',
    '/palaces/:id/invite-codes',
    (p, body: { max_uses?: number | null; expires_at?: string | null }) => {
      const d = loadDb();
      const palace = d.palaces.find((x) => x.id === p.id);
      if (!palace) fail(40401);
      if (roleOf(palace.id, d.current_user_id) !== 'owner') fail(40301);
      const code = genInviteCode();
      d.invite_codes.push({
        code,
        palace_id: palace.id,
        created_by: d.current_user_id,
        max_uses: body?.max_uses ?? null,
        used_count: 0,
        expires_at: body?.expires_at ?? null,
        created_at: now(),
      });
      const share_text = `我在「小角落」建了一座《${palace.name}》，想和你一起往里面放老物件。打开小角落，输入邀请码 ${code} 就能进来。`;
      persist();
      return {
        code,
        expires_at: body?.expires_at ?? null,
        max_uses: body?.max_uses ?? null,
      };
    },
  ),

  /* ---- P8 凭邀请码加入 ---- */
  route('POST', '/palaces/join', (_p, body: { code?: string }) => {
    const d = loadDb();
    const code = (body?.code ?? '').trim().toUpperCase();
    const invite = d.invite_codes.find((x) => x.code === code);
    if (!invite) fail(40401);
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) fail(41002);
    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) fail(41002);
    const palace = d.palaces.find((x) => x.id === invite.palace_id);
    if (!palace) fail(40401);
    if (isMember(palace.id, d.current_user_id)) fail(40901);
    invite.used_count += 1;
    d.members.push({
      palace_id: palace.id,
      user_id: d.current_user_id,
      role: 'member',
      joined_at: now(),
    });
    touchPalace(palace.id);
    persist();
    return { palace: toPalaceVO(palace) };
  }),

  /* ---- P9 移除成员 / 退出 ---- */
  route('DELETE', '/palaces/:id/members/:user_id', (p) => {
    const d = loadDb();
    const target = d.members.find((m) => m.palace_id === p.id && m.user_id === p.user_id);
    if (!target) fail(40401);
    const palace = d.palaces.find((x) => x.id === p.id);
    if (!palace) fail(40401);
    const self = p.user_id === d.current_user_id;
    if (!self && roleOf(p.id, d.current_user_id) !== 'owner') fail(40301);
    if (p.user_id === palace.owner_id) fail(40301);
    d.members = d.members.filter((m) => !(m.palace_id === p.id && m.user_id === p.user_id));
    touchPalace(palace.id);
    persist();
    return { user_id: p.user_id };
  }),

  /* ---- C1 柜子列表 ---- */
  route('GET', '/palaces/:id/cabinets', (p) => {
    const d = loadDb();
    if (!isMember(p.id, d.current_user_id)) fail(40301);
    return { cabinets: d.cabinets.filter((c) => c.palace_id === p.id) };
  }),

  /* ---- C2 创建柜子 ---- */
  route(
    'POST',
    '/palaces/:id/cabinets',
    (p, body: { period_type?: string; period_key?: string; name?: string; model_asset_id?: string }) => {
      const d = loadDb();
      if (!isMember(p.id, d.current_user_id)) fail(40301);
      const period_type = (body?.period_type ?? 'monthly') as 'monthly' | 'quarterly' | 'yearly';
      const period_key = body?.period_key || buildPeriodKey(period_type);
      if (!isValidPeriodKey(period_type, period_key)) fail(42202);
      if (!body?.model_asset_id) fail(42201);
      const id = uid('c');
      d.cabinets.push({
        id,
        palace_id: p.id,
        period_type,
        period_key,
        name: body.name ?? null,
        status: 'active' as const,
        item_count: 0,
        is_full: false,
        cover_thumbnail_url: null,
        model_asset_id: body.model_asset_id,
        created_at: now(),
        updated_at: now(),
      });
      touchPalace(p.id);
      persist();
      const created = d.cabinets.find((c) => c.id === id)!;
      return created;
    },
  ),

  /* ---- C3 柜子详情（含物品与简介） ---- */
  route('GET', '/cabinets/:id', (p) => {
    const d = loadDb();
    const c = d.cabinets.find((x) => x.id === p.id);
    if (!c || !isMember(c.palace_id, d.current_user_id)) fail(40401);
    const items: ItemVO[] = d.items
      .filter((i) => i.cabinet_id === c.id && !i.deleted_at)
      .map((i) => {
        const blurb = latestBlurb(i.id);
        return {
          ...i,
          blurb: blurb
            ? {
                content: blurb.content,
                source: blurb.source,
                updated_at: blurb.updated_at,
              }
            : null,
        };
      });
    return {
      cabinet: {
        id: c.id,
        period_type: c.period_type,
        period_key: c.period_key,
        name: c.name,
        status: c.status,
        item_count: items.length,
        model: { display_mode: 'glb', url: `/mock/models/${c.id}.glb`, thumbnail_url: null },
        is_full: c.is_full || items.length >= LIMITS.MAX_ITEMS_PER_CABINET,
      },
      items,
    };
  }),

  /* ---- C6 标记柜子状态 ---- */
  route('PATCH', '/cabinets/:id/status', (p, body: { status?: string }) => {
    const d = loadDb();
    const c = d.cabinets.find((x) => x.id === p.id);
    if (!c || !isMember(c.palace_id, d.current_user_id)) fail(40401);
    const status = body?.status as 'active' | 'full' | 'archived';
    if (!['active', 'full', 'archived'].includes(status)) fail(42201);
    c.status = status;
    c.is_full = status !== 'active';
    c.updated_at = now();
    touchPalace(c.palace_id);
    persist();
    return c;
  }),

  /* ---- C5 删除柜子 ---- */
  route('DELETE', '/cabinets/:id', (p) => {
    const d = loadDb();
    const c = d.cabinets.find((x) => x.id === p.id);
    if (!c || !isMember(c.palace_id, d.current_user_id)) fail(40401);
    d.cabinets = d.cabinets.filter((x) => x.id !== p.id);
    d.items = d.items.filter((i) => i.cabinet_id !== p.id);
    persist();
    return { id: p.id };
  }),

  /* ---- I5 单物品详情 ---- */
  route('GET', '/items/:id', (p) => {
    const d = loadDb();
    const item = d.items.find((x) => x.id === p.id);
    if (!item) fail(40401);
    const c = d.cabinets.find((x) => x.id === item.cabinet_id);
    if (!c || !isMember(c.palace_id, d.current_user_id)) fail(40301);
    const blurb = latestBlurb(item.id);
    return {
      ...item,
      palace_id: c.palace_id,
      blurb: blurb
        ? { content: blurb.content, source: blurb.source, updated_at: blurb.updated_at }
        : null,
    };
  }),

  /* ---- I2 更新摆放（板块③调用） ---- */
  route('PATCH', '/items/:id', (p, body: { transform?: Transform; name?: string }) => {
    const d = loadDb();
    const item = d.items.find((x) => x.id === p.id);
    if (!item) fail(40401);
    if (body?.transform) item.transform = body.transform;
    if (body?.name) item.name = body.name;
    item.updated_at = now();
    persist();
    return item;
  }),

  /* ---- B1 创建聆听会话 ---- */
  route('POST', '/items/:id/listen-sessions', (p) => {
    const d = loadDb();
    const item = d.items.find((x) => x.id === p.id);
    if (!item) fail(40401);
    const session_id = uid('sess');
    d.sessions.push({
      session_id,
      item_id: item.id,
      created_at: now(),
      transcript: null,
    });
    persist();
    return {
      session_id,
      sdk_config: {
        provider: 'mock' as const,
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        summary_prompt:
          '请把下面这段物品讲述整理成 80~250 字、第一人称「我」的中文简介。保留人名、地点、物件细节，只整理不添加。不要提问，不要回应，结尾不要总结套话。',
        summary_length: { min: LIMITS.BLURB_MIN, max: LIMITS.BLURB_MAX },
      },
    };
  }),

  /* ---- B2 上报会话结果 ---- */
  route(
    'POST',
    '/listen-sessions/:session_id/result',
    (p, body: { transcript?: string; summary?: string; duration_ms?: number }) => {
      const d = loadDb();
      const session = d.sessions.find((s) => s.session_id === p.session_id);
      if (!session) fail(40401);
      const summary = (body?.summary ?? '').trim();
      if (summary.length < LIMITS.BLURB_MIN || summary.length > LIMITS.BLURB_MAX) fail(42204);
      session.transcript = body?.transcript ?? '';
      const item = d.items.find((x) => x.id === session.item_id);
      if (!item) fail(40401);
      const blurb = {
        id: uid('b'),
        item_id: item.id,
        content: summary,
        source: 'agent_ai' as BlurbSource,
        version: nextBlurbVersion(item.id),
        transcript: session.transcript,
        updated_at: now(),
      };
      d.blurbs.push(blurb);
      item.updated_at = now();
      persist();
      return { blurb };
    },
  ),

  /* ---- B2.5 校订后的转写 → 生成简介 ----
   * 真实后端此处调用方舟（BLURB_SYSTEM_PROMPT）生成 80~250 字第一人称记录。
   * Mock 无方舟密钥，用 mockSummarize 产出演示用简介（直接以用户校订后的原话为记录），
   * 并兜底保证字数落在 80~250 区间，便于联调。 */
  route(
    'POST',
    '/listen-sessions/:session_id/summarize',
    (p, body: { transcript?: string }) => {
      const d = loadDb();
      const session = d.sessions.find((s) => s.session_id === p.session_id);
      if (!session) fail(40401);
      const transcript = (body?.transcript ?? '').trim();
      if (!transcript) fail(42204);
      const summary = mockSummarize(transcript);
      // 记下校订后的转写，供 B5 重新聆听复用
      session.transcript = transcript;
      persist();
      return { summary };
    },
  ),

  /* ---- B3 查询简介 ---- */
  route('GET', '/items/:id/blurb', (p) => {
    const blurb = latestBlurb(p.id);
    return { blurb: blurb ?? null };
  }),

  /* ---- B4 编辑简介 ---- */
  route('PATCH', '/items/:id/blurb', (p, body: { content?: string }) => {
    const d = loadDb();
    const item = d.items.find((x) => x.id === p.id);
    if (!item) fail(40401);
    const content = (body?.content ?? '').trim();
    if (content.length < LIMITS.BLURB_MIN || content.length > LIMITS.BLURB_MAX) fail(42204);
    const prev = latestBlurb(item.id);
    const source: BlurbSource =
      !prev || prev.source === 'manual' ? 'manual' : 'agent_ai_edited';
    const blurb = {
      id: uid('b'),
      item_id: item.id,
      content,
      source,
      version: nextBlurbVersion(item.id),
      transcript: prev?.transcript ?? null,
      updated_at: now(),
    };
    d.blurbs.push(blurb);
    item.updated_at = now();
    persist();
    return { blurb };
  }),

  /* ---- B5 重新聆听（同一份转写重生成） ---- */
  route('POST', '/items/:id/listen-sessions/:session_id/regenerate', (p) => {
    const d = loadDb();
    const session = d.sessions.find((s) => s.session_id === p.session_id);
    if (!session) fail(40401);
    const prev = latestBlurb(p.id);
    if (!prev) fail(40401);
    const blurb = {
      id: uid('b'),
      item_id: p.id,
      content: prev.content,
      source: prev.source,
      version: nextBlurbVersion(p.id),
      transcript: prev.transcript,
      updated_at: now(),
    };
    d.blurbs.push(blurb);
    persist();
    return { blurb };
  }),
];

/* ------------------------------ 请求分发 ------------------------------ */

const LATENCY = 180;

export async function handleMock(method: string, path: string, body?: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, LATENCY));
  const cleanPath = path.split('?')[0];
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = cleanPath.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    return r.handler(params, body);
  }
  // 未命中的路由：留给其他板块（① 登录短信 / ③ 3D / ④ 生成管线）自行扩展
  throw { code: 40401, message: `mock 未实现：${method} ${cleanPath}` } as MockFailure;
}

/** 未实现的路由白名单提示，便于技术顾问快速定位 */
export const MOCK_NOT_IMPLEMENTED_HINT =
  '该接口属于其他板块（①账号 / ③3D / ④生成管线），Mock 层未实现；联调后由真实后端提供。';

export { currentUserId };
