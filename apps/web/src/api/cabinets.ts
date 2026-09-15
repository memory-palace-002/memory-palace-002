/**
 * §3.3 展示柜 C1~C6 与 §3.5 物品 I1~I5
 * 注：C3/I 系列的读写壳在本模块定义类型与路径，3D 渲染与摆放由板块③（丙）实现，
 *     本模块只提供乙负责页面所需的数据读取。
 */
import { http } from './http';
import type {
  CabinetDetailVO,
  CabinetListResponse,
  CabinetVO,
  CreateCabinetPayload,
  DeleteItemResponse,
  ItemDetailVO,
  PeriodType,
  UpdateCabinetPayload,
  UpdateCabinetStatusPayload,
  UpdateItemPayload,
} from '@shared/index';

export const cabinetApi = {
  /** C1 柜子列表 */
  list: (palaceId: string, periodType?: PeriodType) =>
    http.get<CabinetListResponse>(
      `/palaces/${palaceId}/cabinets${periodType ? `?period_type=${periodType}` : ''}`,
    ),

  /** C2 创建柜子 */
  create: (palaceId: string, payload: CreateCabinetPayload) =>
    http.post<CabinetVO>(`/palaces/${palaceId}/cabinets`, payload),

  /** C3 柜子详情（含全部物品与简介） */
  detail: (cabinetId: string) => http.get<CabinetDetailVO>(`/cabinets/${cabinetId}`),

  /** C4 修改柜子 */
  update: (cabinetId: string, payload: UpdateCabinetPayload) =>
    http.patch<CabinetVO>(`/cabinets/${cabinetId}`, payload),

  /** C5 删除柜子 */
  remove: (cabinetId: string) => http.del<{ id: string }>(`/cabinets/${cabinetId}`),

  /** C6 标记柜子状态（用户主动「我想换下一个柜子了」） */
  updateStatus: (cabinetId: string, payload: UpdateCabinetStatusPayload) =>
    http.patch<CabinetVO>(`/cabinets/${cabinetId}/status`, payload),
};

export const itemApi = {
  /** I5 单物品详情 */
  detail: (itemId: string) => http.get<ItemDetailVO>(`/items/${itemId}`),

  /** I2 更新摆放变换（由板块③调用） */
  update: (itemId: string, payload: UpdateItemPayload) =>
    http.patch<ItemDetailVO>(`/items/${itemId}`, payload),

  /** I3 删除物品（软删 15 天） */
  remove: (itemId: string) => http.del<DeleteItemResponse>(`/items/${itemId}`),

  /** I4 恢复物品 */
  restore: (itemId: string) => http.post<ItemDetailVO>(`/items/${itemId}/restore`),
};
