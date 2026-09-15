/**
 * §3.2 宫殿与成员 P1~P9
 */
import { http } from './http';
import type {
  CreateInviteCodePayload,
  CreatePalacePayload,
  InviteCodeVO,
  JoinPalacePayload,
  JoinPalaceResponse,
  MemberListResponse,
  PalaceDetailVO,
  PalaceListResponse,
  PalaceVO,
  UpdatePalacePayload,
} from '@shared/index';

export const palaceApi = {
  /** P1 我的宫殿列表 */
  list: () => http.get<PalaceListResponse>('/palaces'),

  /** P2 创建公共宫殿 */
  create: (payload: CreatePalacePayload) => http.post<PalaceVO>('/palaces', payload),

  /** P3 宫殿详情 */
  detail: (palaceId: string) => http.get<PalaceDetailVO>(`/palaces/${palaceId}`),

  /** P4 修改宫殿 */
  update: (palaceId: string, payload: UpdatePalacePayload) =>
    http.patch<PalaceVO>(`/palaces/${palaceId}`, payload),

  /** P5 删除宫殿（仅 owner） */
  remove: (palaceId: string) => http.del<{ id: string }>(`/palaces/${palaceId}`),

  /** P6 成员列表 */
  members: (palaceId: string) => http.get<MemberListResponse>(`/palaces/${palaceId}/members`),

  /** P7 生成邀请码 */
  createInviteCode: (palaceId: string, payload: CreateInviteCodePayload = {}) =>
    http.post<InviteCodeVO>(`/palaces/${palaceId}/invite-codes`, payload),

  /** P8 凭邀请码加入 */
  join: (payload: JoinPalacePayload) => http.post<JoinPalaceResponse>('/palaces/join', payload),

  /** P9 移除成员 / 退出宫殿（user_id 为自己即退出） */
  removeMember: (palaceId: string, userId: string) =>
    http.del<{ user_id: string }>(`/palaces/${palaceId}/members/${userId}`),
};
