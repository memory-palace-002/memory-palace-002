import type { SdkConfig } from '@shared/index';
import {
  VoiceAgentError,
  type ListenResult,
  type VoiceAgentAdapter,
  type VoiceAgentEvents,
} from '../VoiceAgentAdapter';

/**
 * 主选 SDK：火山引擎「豆包」端到端实时语音（流式 ASR）+ 豆包 LLM 总结。
 *
 * 接入步骤（负责人：乙 / 需先完成 R3 账号开通）：
 * 1. npm i @volcengine/rtc 或在 index.html 引入厂商提供的 LiveAudio SDK；
 * 2. 服务端 B1 返回 sdk_config（app_id / token / ws_url / expires_at）；
 * 3. 在 start() 内建立会话并把 SDK 的 ASR 增量回调桥接到 events.onTranscript；
 * 4. stop() 时关闭会话，仅把「原始转写」作为 ListenResult 返回（summary 留空）；
 *    转写经用户在客户端校订偏差后，由前端 listenApi.summarize 触发服务端 B2.5 调方舟生成简介；
 * 5. 失败统一抛 VoiceAgentError（code=50002），页面会降级到手动输入简介。
 *
 * ⚠️ 当前为接入位骨架，未填入厂商私有协议细节；切换到本适配器只需修改 factory 的 case。
 *
 * 总结口径契约：本适配器只负责把「原始转写 + 服务端返回的 summary」桥接为 ListenResult，
 * 真正的简介生成在服务端 B2。B2 调用方舟时必须使用 packages/shared/src/blurbPrompt.ts
 * 导出的 BLURB_SYSTEM_PROMPT（用户本人第一人称「我」、80~250 字），禁止在前端或请求里传 prompt，
 * 并用 isBlurbValid() 校验落库前字数，超限触发「再压一次」或返回 42204。
 */
export function createVolcanoAdapter(): VoiceAgentAdapter {
  let events: VoiceAgentEvents = {};
  let startedAt = 0;
  let transcript = '';
  let session: { close: () => void } | null = null;

  return {
    provider: 'volcano_doubao',
    async start(config: SdkConfig, evts: VoiceAgentEvents) {
      events = evts;
      transcript = '';
      startedAt = Date.now();

      if (!config.app_id || !config.token) {
        throw new VoiceAgentError('缺少 SDK 凭据，请检查 B1 返回的 sdk_config');
      }
      if (config.expires_at && new Date(config.expires_at) < new Date()) {
        throw new VoiceAgentError('SDK 凭据已过期，请重新创建聆听会话');
      }

      // TODO SDKv2：建立实时语音会话
      // session = await LiveAudio.start({
      //   appId: config.app_id,
      //   token: config.token,
      //   url: config.ws_url,
      //   onAsrDelta: (text, isFinal) => {
      //     transcript += text;
      //     events.onTranscript?.(text, isFinal);
      //   },
      //   onError: (e) => events.onError?.(new VoiceAgentError(e.message)),
      // });

      // 未接入真实 SDK 时立即失败，页面会走「手动输入简介」降级路径
      throw new VoiceAgentError('尚未接入火山引擎 SDK（请完成 R3 开通后实现 start/stop）');
    },

    async stop(): Promise<ListenResult | null> {
      session?.close();
      session = null;
      const duration_ms = startedAt ? Date.now() - startedAt : 0;
      if (!transcript.trim()) return null;

      // TODO SDKv2：调用服务端总结（或直接取 SDK 返回的 summary）
      const summary = '';
      const result: ListenResult = { transcript, summary, duration_ms };
      events.onResult?.(result);
      return result;
    },
  };
}
