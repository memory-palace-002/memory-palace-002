/**
 * 小角落（原「回忆宫殿」）共享类型 / DTO
 * 依据《开发规格说明书 2.0》§2 数据模型 与 §3 接口清单
 * 本文件由 packages/shared 导出；后端 NestJS 与前端 web 共用同一份定义。
 */

/* ------------------------------ 基础枚举 ------------------------------ */

export type PalaceType = 'personal' | 'public';
export type PalaceRole = 'owner' | 'member';
export type PeriodType = 'monthly' | 'quarterly' | 'yearly';
export type CabinetStatus = 'active' | 'full' | 'archived';
export type DisplayMode = 'glb' | 'photo_360';
export type AssetStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type BlurbSource = 'agent_ai' | 'manual' | 'agent_ai_edited';

/* ------------------------------ 通用出参 ------------------------------ */

/** 统一出参信封：code=0 成功 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/* ------------------------------- User -------------------------------- */

/** A5 当前用户信息 */
export interface UserVO {
  id: string;
  phone: string | null;
  nickname: string;
  avatar_url: string | null;
  wechat_bound: boolean;
  created_at: string;
}

/* ------------------------------ Palace ------------------------------- */

/** P1 宫殿列表项 */
export interface PalaceVO {
  id: string;
  type: PalaceType;
  name: string;
  cabinet_count: number;
  item_count: number;
  cover_thumbnail_url: string | null;
  updated_at: string;
  /** 前端派生字段（可选）：当前用户在宫殿中的角色 */
  role?: PalaceRole;
  member_count?: number;
}

export interface PalaceListResponse {
  palaces: PalaceVO[];
}

/** P3 宫殿详情 */
export interface PalaceDetailVO extends PalaceVO {
  owner_id: string;
  created_at: string;
}

/** P2 创建公共宫殿入参 */
export interface CreatePalacePayload {
  name: string;
}

/** P4 修改宫殿入参 */
export interface UpdatePalacePayload {
  name?: string;
  cover_thumbnail_url?: string | null;
}

/* ------------------------------ Member ------------------------------- */

/** P6 成员列表项 */
export interface MemberVO {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  role: PalaceRole;
  joined_at: string;
}

export interface MemberListResponse {
  members: MemberVO[];
}

/* ---------------------------- Invite Code ---------------------------- */

/** P7 生成邀请码入参 */
export interface CreateInviteCodePayload {
  max_uses?: number | null;
  expires_at?: string | null;
}

/** P7 出参 */
export interface InviteCodeVO {
  code: string;
  share_text: string;
  expires_at?: string | null;
  max_uses?: number | null;
}

/** P8 凭邀请码加入入参 */
export interface JoinPalacePayload {
  code: string;
}

export interface JoinPalaceResponse {
  palace: PalaceVO;
}

/* ------------------------------ Cabinet ------------------------------ */

export interface CabinetVO {
  id: string;
  palace_id: string;
  period_type: PeriodType;
  period_key: string;
  name: string | null;
  status: CabinetStatus;
  item_count: number;
  /** 用户已标记装满 或 物品数达 20 */
  is_full: boolean;
  cover_thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CabinetListResponse {
  cabinets: CabinetVO[];
}

/** C2 创建柜子入参 */
export interface CreateCabinetPayload {
  period_type: PeriodType;
  period_key: string;
  name?: string;
  model_asset_id: string;
}

/** C4 修改柜子入参 */
export interface UpdateCabinetPayload {
  name?: string;
  period_key?: string;
}

/** C6 标记柜子状态入参 */
export interface UpdateCabinetStatusPayload {
  status: CabinetStatus;
}

/* -------------------------------- Item ------------------------------- */

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export interface ItemModelRef {
  display_mode: DisplayMode;
  url?: string | null;
  photo_keys?: string[] | null;
  thumbnail_url?: string | null;
}

export interface ItemBlurbRef {
  content: string;
  source: BlurbSource;
  updated_at: string;
}

export interface ItemOwnerRef {
  id: string;
  nickname: string;
}

export interface ItemVO {
  id: string;
  cabinet_id: string;
  name: string;
  owner: ItemOwnerRef;
  display_mode: DisplayMode;
  model: ItemModelRef;
  transform: Transform;
  blurb: ItemBlurbRef | null;
}

/** C3 柜子详情（含全部物品与简介） */
export interface CabinetDetailVO {
  cabinet: {
    id: string;
    period_type: PeriodType;
    period_key: string;
    name: string | null;
    status: CabinetStatus;
    item_count: number;
    model: ItemModelRef;
    is_full: boolean;
  };
  items: ItemVO[];
}

/** I5 单物品详情 */
export interface ItemDetailVO extends ItemVO {
  palace_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** I1 添加物品入参 */
export interface CreateItemPayload {
  model_asset_id: string;
  name?: string;
  transform?: Partial<Transform>;
}

/** I2 更新摆放变换入参 */
export interface UpdateItemPayload {
  transform: Transform;
  name?: string;
}

export interface DeleteItemResponse {
  deleted_at: string;
  restorable_until: string;
}

/* ----------------------------- Blurb 简介 ----------------------------- */

export interface BlurbVO {
  id: string;
  item_id: string;
  content: string;
  source: BlurbSource;
  version: number;
  updated_at: string;
}

export interface BlurbResponse {
  blurb: BlurbVO | null;
}

/** B1 创建聆听会话出参 */
export interface ListenSessionVO {
  session_id: string;
  sdk_config: SdkConfig;
}

/**
 * SDK 临时凭据 / 会话参数（5.3 ListeningProvider 签发）
 * 具体字段以选定 SDK 为准，这里定义抽象形状。
 */
export interface SdkConfig {
  provider: 'mock' | 'volcano_doubao' | 'aliyun_bailian' | 'xfyun_spark';
  app_id?: string;
  token?: string;
  ws_url?: string;
  /** ISO 8601，过期时间 */
  expires_at: string;
  /** 总结约束（服务端下发，前端仅传给 adapter） */
  summary_prompt?: string;
  /** 字数校验范围 */
  summary_length?: { min: number; max: number };
  [key: string]: unknown;
}

/** B2 上报会话结果入参 */
export interface ReportListenResultPayload {
  transcript: string;
  summary: string;
  audio_key?: string | null;
  duration_ms: number;
}

/**
 * B2.5 生成简介入参。
 * 用户语音转文字（stop）后，可以在客户端校订转写稿（修正识别偏差），
 * 再把校订后的 transcript 发给服务端，由服务端调方舟（BLURB_SYSTEM_PROMPT）生成简介。
 */
export interface SummarizePayload {
  transcript: string;
}

/** B2.5 出参 */
export interface SummarizeResponse {
  summary: string;
}

/** B4 编辑简介入参 */
export interface UpdateBlurbPayload {
  content: string;
}

/* ------------------------------- Share ------------------------------- */

export interface ShareLinkVO {
  share_url: string;
  share_token: string;
}

/* ------------------------------ 错误码 ------------------------------- */

export const ErrorCode = {
  UNAUTHORIZED: 40101,
  FORBIDDEN: 40301,
  NOT_FOUND: 40401,
  SMS_CODE_INVALID: 40901,
  CABINET_FULL: 41001,
  INVITE_CODE_EXHAUSTED: 41002,
  RESTORE_EXPIRED: 41003,
  ASSET_NOT_READY: 42201,
  PHOTO_COUNT_INVALID: 42202,
  MODEL_TOO_LARGE: 42203,
  BLURB_LENGTH_INVALID: 42204,
  RATE_LIMITED: 42901,
  REBUILD_FAILED: 50001,
  LISTEN_SDK_FAILED: 50002,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** §3.8 错误码 → 用户可读文案 */
export const ErrorMessage: Record<number, string> = {
  40101: '登录状态已失效，请重新登录',
  40301: '你没有权限进行这个操作',
  40401: '找不到这个内容了',
  40901: '验证码错误或已过期',
  41001: '这个柜子已经满了，换下一个吧',
  41002: '邀请码已过期或用尽',
  41003: '已过 15 天恢复期，无法找回',
  42201: '模型还在生成中，请稍候',
  42202: '照片数量不符，需要 8~16 张',
  42203: '模型文件超过 5MB',
  42204: '简介字数不符，需要 80~250 字',
  42901: '操作太频繁了，稍后再试',
  50001: '3D 生成失败了，换个方式试试',
  50002: '聆听服务出了点问题，可以直接手写简介',
};

/* ---------------------------- 常量约束（§0） --------------------------- */

export const LIMITS = {
  /** 单柜硬上限物品数 */
  MAX_ITEMS_PER_CABINET: 20,
  /** 软删恢复期（天） */
  RESTORE_DAYS: 15,
  /** 简介字数区间 */
  BLURB_MIN: 80,
  BLURB_MAX: 250,
  /** 单模型大小上限 */
  MODEL_MAX_BYTES: 5 * 1024 * 1024,
} as const;
