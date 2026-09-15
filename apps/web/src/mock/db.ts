/**
 * Mock 数据源 —— 仅在 VITE_USE_MOCK=true 时生效
 * 目的：后端（甲 / 板块①）未就绪时，乙负责的页面可以独立跑通并演示。
 * 所有结构与 packages/shared 的 DTO 完全一致，切到真实后端无需改动页面代码。
 */
import type {
  BlurbSource,
  BlurbVO,
  CabinetStatus,
  CabinetVO,
  DisplayMode,
  ItemVO,
  MemberVO,
  PalaceType,
  PalaceVO,
  PeriodType,
  UserVO,
} from '@shared/index';

const STORAGE_KEY = 'xjl.mock.db.v2';

/* ------------------------------ 内部实体 ------------------------------ */

export interface MockUser extends UserVO {
  passwordless: true;
}

export interface MockPalace {
  id: string;
  owner_id: string;
  type: PalaceType;
  name: string;
  cover_thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockMember {
  palace_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface MockInviteCode {
  code: string;
  palace_id: string;
  created_by: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface MockCabinet extends CabinetVO {
  model_asset_id: string;
}

export interface MockItem extends ItemVO {
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockBlurb extends BlurbVO {
  transcript: string | null;
}

export interface MockSession {
  session_id: string;
  item_id: string;
  created_at: string;
  transcript: string | null;
}

export interface MockDb {
  current_user_id: string;
  users: MockUser[];
  palaces: MockPalace[];
  members: MockMember[];
  invite_codes: MockInviteCode[];
  cabinets: MockCabinet[];
  items: MockItem[];
  blurbs: MockBlurb[];
  sessions: MockSession[];
}

/* ------------------------------- 工具 -------------------------------- */

const now = () => new Date().toISOString();

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 8 位大写字母数字，去掉易混淆字符 0/O/1/I（§2.2 invite_code） */
export function genInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/* -------------------------------- 种子 ------------------------------- */

function seed(): MockDb {
  const me: MockUser = {
    id: 'u_me',
    phone: '138****8888',
    nickname: '我',
    avatar_url: null,
    wechat_bound: false,
    passwordless: true,
    created_at: daysAgo(120),
  };
  const mom: MockUser = {
    id: 'u_mom',
    phone: '139****6666',
    nickname: '妈妈',
    avatar_url: null,
    wechat_bound: true,
    passwordless: true,
    created_at: daysAgo(200),
  };
  const lin: MockUser = {
    id: 'u_lin',
    phone: '137****1234',
    nickname: '小林',
    avatar_url: null,
    wechat_bound: false,
    passwordless: true,
    created_at: daysAgo(90),
  };

  const personal: MockPalace = {
    id: 'p_personal',
    owner_id: me.id,
    type: 'personal',
    name: '我的小角落',
    cover_thumbnail_url: null,
    created_at: daysAgo(120),
    updated_at: daysAgo(2),
  };

  const family: MockPalace = {
    id: 'p_family',
    owner_id: me.id,
    type: 'public',
    name: '老屋的记忆',
    cover_thumbnail_url: null,
    created_at: daysAgo(60),
    updated_at: daysAgo(1),
  };

  const members: MockMember[] = [
    { palace_id: personal.id, user_id: me.id, role: 'owner', joined_at: daysAgo(120) },
    { palace_id: family.id, user_id: me.id, role: 'owner', joined_at: daysAgo(60) },
    { palace_id: family.id, user_id: mom.id, role: 'member', joined_at: daysAgo(58) },
    { palace_id: family.id, user_id: lin.id, role: 'member', joined_at: daysAgo(12) },
  ];

  const mkCabinet = (
    id: string,
    palace_id: string,
    period_type: PeriodType,
    period_key: string,
    status: CabinetStatus,
    item_count: number,
    updatedDaysAgo: number,
  ): MockCabinet => ({
    id,
    palace_id,
    period_type,
    period_key,
    name: null,
    status,
    item_count,
    is_full: status !== 'active' || item_count >= 20,
    cover_thumbnail_url: null,
    model_asset_id: `ma_${id}`,
    created_at: daysAgo(updatedDaysAgo + 20),
    updated_at: daysAgo(updatedDaysAgo),
  });

  const cabinets: MockCabinet[] = [
    mkCabinet('c_2026_08', personal.id, 'monthly', '2026-08', 'archived', 6, 40),
    mkCabinet('c_2026_09', personal.id, 'monthly', '2026-09', 'active', 3, 2),
    mkCabinet('c_2026_q3', personal.id, 'quarterly', '2026-Q3', 'active', 2, 5),
    mkCabinet('c_family_q3', family.id, 'quarterly', '2026-Q3', 'active', 4, 1),
  ];

  const mkItem = (
    id: string,
    cabinet_id: string,
    name: string,
    ownerId: string,
    display_mode: DisplayMode,
    pos: [number, number, number],
    updatedDaysAgo: number,
  ): MockItem => ({
    id,
    cabinet_id,
    name,
    owner: { id: ownerId, nickname: ownerId === mom.id ? '妈妈' : ownerId === lin.id ? '小林' : '我' },
    display_mode,
    model: {
      display_mode,
      url: display_mode === 'glb' ? `/mock/models/${id}.glb` : null,
      photo_keys: display_mode === 'photo_360' ? [`/mock/photos/${id}-1.jpg`] : null,
      thumbnail_url: null,
    },
    transform: { position: pos, rotation: [0, 0, 0], scale: 1 },
    blurb: null,
    deleted_at: null,
    created_at: daysAgo(updatedDaysAgo + 3),
    updated_at: daysAgo(updatedDaysAgo),
  });

  const items: MockItem[] = [
    mkItem('i_cup', 'c_2026_09', '搪瓷杯', me.id, 'glb', [-0.6, 0.9, 0], 2),
    mkItem('i_bear', 'c_2026_09', '布熊', me.id, 'photo_360', [0, 0.9, 0.1], 3),
    mkItem('i_ticket', 'c_2026_09', '旧车票', me.id, 'photo_360', [0.6, 0.9, -0.1], 6),
    mkItem('i_radio', 'c_family_q3', '老收音机', mom.id, 'glb', [-0.5, 0.9, 0], 1),
    mkItem('i_fan', 'c_family_q3', '蒲扇', mom.id, 'photo_360', [0.2, 0.9, 0], 4),
    mkItem('i_stone', 'c_family_q3', '河边的石头', lin.id, 'photo_360', [0.7, 0.9, 0.2], 9),
  ];

  const mkBlurb = (
    item_id: string,
    content: string,
    source: BlurbSource,
    version: number,
    days: number,
  ): MockBlurb => ({
    id: `b_${item_id}_${version}`,
    item_id,
    content,
    source,
    version,
    transcript: source === 'manual' ? null : '（用户讲述的口述原文，Mock 数据）',
    updated_at: daysAgo(days),
  });

  const blurbs: MockBlurb[] = [
    mkBlurb(
      'i_cup',
      '这只搪瓷杯是我上班第一年买的，杯口磕掉了一小块瓷。每天早上我都会用它喝水，冬天烫手，夏天冰凉。后来搬了三次家，很多东西都丢了，它一直留着，因为那一刻我记得很清楚——刚发工资的那个下午，我在百货大楼挑了很久。',
      'agent_ai',
      1,
      2,
    ),
    mkBlurb(
      'i_fan',
      '这把蒲扇是外婆留下的。夏天的晚上，她坐在院子里的竹椅上给我扇风，一边扇一边讲以前的事。扇骨早就散了边，我用布条缠了两圈。现在家里有空调了，我还是会把它放在床头，看到它就像闻到夏天的味道。',
      'agent_ai',
      1,
      4,
    ),
    mkBlurb(
      'i_stone',
      '这块石头是小学放学路上捡的，那天我在河边站了很久，觉得它长得像一只趴着的猫。我把它带回家放在书桌上，写作业的时候就看着它。后来才知道那是块普通的鹅卵石，但那时候我真的很想要所有人都知道它是猫。',
      'manual',
      1,
      9,
    ),
  ];

  const db: MockDb = {
    current_user_id: me.id,
    users: [me, mom, lin],
    palaces: [personal, family],
    members,
    invite_codes: [],
    cabinets,
    items,
    blurbs,
    sessions: [],
  };
  return db;
}

/* ------------------------------ 持久化 ------------------------------- */

let db: MockDb | null = null;

export function loadDb(): MockDb {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      db = JSON.parse(raw) as MockDb;
      return db;
    }
  } catch {
    /* 解析失败则重建 */
  }
  db = seed();
  persist();
  return db;
}

export function persist(): void {
  if (!db) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* 忽略写失败 */
  }
}

export function resetDb(): void {
  localStorage.removeItem(STORAGE_KEY);
  db = seed();
  persist();
}

/* ------------------------------ 派生视图 ------------------------------ */

export function currentUserId(): string {
  return loadDb().current_user_id;
}

export function currentUser(): MockUser {
  const d = loadDb();
  const u = d.users.find((x) => x.id === d.current_user_id);
  if (!u) throw new Error('mock: current user missing');
  return u;
}

export function isMember(palaceId: string, userId: string): boolean {
  return loadDb().members.some((m) => m.palace_id === palaceId && m.user_id === userId);
}

export function roleOf(palaceId: string, userId: string): 'owner' | 'member' | null {
  const m = loadDb().members.find((x) => x.palace_id === palaceId && x.user_id === userId);
  return m ? m.role : null;
}

export function toPalaceVO(p: MockPalace): PalaceVO {
  const d = loadDb();
  const cabinets = d.cabinets.filter((c) => c.palace_id === p.id);
  const cabinetIds = new Set(cabinets.map((c) => c.id));
  const item_count = d.items.filter(
    (i) => cabinetIds.has(i.cabinet_id) && !i.deleted_at,
  ).length;
  const member_count = d.members.filter((m) => m.palace_id === p.id).length;
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    cabinet_count: cabinets.length,
    item_count,
    cover_thumbnail_url: p.cover_thumbnail_url,
    updated_at: p.updated_at,
    role: roleOf(p.id, d.current_user_id) ?? undefined,
    member_count,
  };
}

export function toMemberVO(m: MockMember): MemberVO {
  const d = loadDb();
  const u = d.users.find((x) => x.id === m.user_id);
  return {
    user_id: m.user_id,
    nickname: u?.nickname ?? '未知成员',
    avatar_url: u?.avatar_url ?? null,
    role: m.role,
    joined_at: m.joined_at,
  };
}

export function touchPalace(palaceId: string): void {
  const d = loadDb();
  const p = d.palaces.find((x) => x.id === palaceId);
  if (p) p.updated_at = now();
}

export function latestBlurb(itemId: string): MockBlurb | null {
  const list = loadDb()
    .blurbs.filter((b) => b.item_id === itemId)
    .sort((a, b) => b.version - a.version);
  return list[0] ?? null;
}

export function nextBlurbVersion(itemId: string): number {
  return (latestBlurb(itemId)?.version ?? 0) + 1;
}

export { now };
