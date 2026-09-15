/**
 * §5.3 SDK 抽象层 —— VoiceAgentAdapter
 * 目标：换 SDK 只换 adapter，UI 三态组件（VoiceAgentPanel）一行不动。
 *
 * 前端 VoiceAgentAdapter 接口：start(config) / stop() / onTranscript / onError
 * 服务端 ListeningProvider 接口：签发临时凭据（B1 的 sdk_config）、接收结果回调（B2/B2.5）
 *
 * 流程（含「校订转写」环节）：
 *   start()        —— 录音 + 实时转写（onTranscript 增量）
 *   stop()         —— 结束录音，仅返回转写原文 transcript（summary 留空）
 *   [用户校订]     —— VoiceAgentPanel 展示可编辑的转写稿，用户修正识别偏差
 *   summarize()    —— 把校订后的 transcript 发给服务端 B2.5，由方舟生成简介
 *   reportResult() —— 落库（转写 + 简介），见 listenApi
 */
import type { SdkConfig } from '@shared/index';

export interface ListenResult {
  transcript: string;
  /** stop() 阶段仅返回转写，summary 由后续 B2.5 生成后填入，此处为空串 */
  summary: string;
  duration_ms: number;
}

export interface VoiceAgentEvents {
  /** 实时转写增量。final=true 表示该句已定稿 */
  onTranscript?: (text: string, final: boolean) => void;
  /** 会话结果（部分 SDK 会在 stop 之前推送） */
  onResult?: (result: ListenResult) => void;
  onError?: (err: Error) => void;
}

export interface VoiceAgentAdapter {
  readonly provider: string;
  /** 启动一次会话：拿到 B1 下发的 sdk_config 后调用 */
  start(config: SdkConfig, events: VoiceAgentEvents): Promise<void>;
  /**
   * 结束会话，返回本次转写原文（summary 为空）。
   * 真正的「转写 → 简介」由服务端 B2.5 完成，前端通过 listenApi.summarize 触发。
   */
  stop(): Promise<ListenResult | null>;
}

export class VoiceAgentError extends Error {
  readonly code: number;
  constructor(message: string, code = 50002) {
    super(message);
    this.name = 'VoiceAgentError';
    this.code = code;
  }
}
