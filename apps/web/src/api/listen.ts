/**
 * §3.6 AI 聆听者与简介 B1~B5
 */
import { http } from './http';
import type {
  BlurbResponse,
  BlurbVO,
  ListenSessionVO,
  ReportListenResultPayload,
  SummarizePayload,
  SummarizeResponse,
  UpdateBlurbPayload,
} from '@shared/index';

export const listenApi = {
  /** B1 创建聆听会话：服务端签发 SDK 凭据 */
  createSession: (itemId: string) =>
    http.post<ListenSessionVO>(`/items/${itemId}/listen-sessions`, {}),

  /** B2 上报会话结果（SDK 回调 / 前端上报） */
  reportResult: (sessionId: string, payload: ReportListenResultPayload) =>
    http.post<{ blurb: BlurbVO }>(`/listen-sessions/${sessionId}/result`, payload),

  /**
   * B2.5 校订后的转写 → 服务端调方舟生成简介。
   * 用户在校订页改完识别偏差后调用；服务端用 BLURB_SYSTEM_PROMPT 生成，
   * 返回 80~250 字的第一人称记录。
   */
  summarize: (sessionId: string, payload: SummarizePayload) =>
    http.post<SummarizeResponse>(`/listen-sessions/${sessionId}/summarize`, payload),

  /** B3 查询简介 */
  getBlurb: (itemId: string) => http.get<BlurbResponse>(`/items/${itemId}/blurb`),

  /** B4 编辑简介（80~250 字校验） */
  updateBlurb: (itemId: string, payload: UpdateBlurbPayload) =>
    http.patch<{ blurb: BlurbVO }>(`/items/${itemId}/blurb`, payload),

  /** B5 重新聆听（同一份转写重生成一次简介） */
  regenerate: (itemId: string, sessionId: string) =>
    http.post<{ blurb: BlurbVO }>(
      `/items/${itemId}/listen-sessions/${sessionId}/regenerate`,
      {},
    ),
};
