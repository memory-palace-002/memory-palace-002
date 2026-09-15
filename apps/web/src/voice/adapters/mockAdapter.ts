import type { ListenResult, VoiceAgentAdapter, VoiceAgentEvents } from '../VoiceAgentAdapter';
import type { SdkConfig } from '@shared/index';

/**
 * 本地 Mock —— 在真实 SDK 账号（R3：火山引擎豆包）开通前用于打通链路与演示。
 * 行为对齐一站式语音 Agent：录音中持续吐出转写 → 结束（stop 仅返回转写）。
 *
 * 简介生成不在适配器里做：stop() 返回 transcript 后，由 VoiceAgentPanel 展示可编辑
 * 转写稿，用户校订偏差，再经 listenApi.summarize（服务端 B2.5）用 BLURB_SYSTEM_PROMPT
 * 生成简介。mock 模式下由 mock 后端的 /summarize 路由产出演示用简介。
 *
 * 真正的简介口径（用户本人第一人称「我」、80~250 字等）定义在
 * packages/shared/src/blurbPrompt.ts，服务端 B2.5 与 e2e 脚本都引用同一份。
 */
const CHUNKS = [
  '这只杯子是我第一年上班的时候买的……',
  '杯口磕掉了一小块瓷，摸起来有点糙。',
  '每天早上我都用它喝水，冬天烫手，夏天冰凉。',
  '后来搬了三次家，很多东西都丢了，它一直留着。',
  '因为那一刻我记得很清楚——刚发工资的那个下午，',
  '我在百货大楼挑了很久，最后选了印着红双喜的这只。',
];

export function createMockAdapter(): VoiceAgentAdapter {
  let timer: number | null = null;
  let startedAt = 0;
  let transcript = '';
  let events: VoiceAgentEvents = {};
  let index = 0;

  const clear = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  return {
    provider: 'mock',
    async start(_config: SdkConfig, evts: VoiceAgentEvents) {
      events = evts;
      transcript = '';
      index = 0;
      startedAt = Date.now();
      clear();
      timer = window.setInterval(() => {
        if (index >= CHUNKS.length) {
          clear();
          return;
        }
        const piece = CHUNKS[index++];
        transcript += piece;
        events.onTranscript?.(piece, index === CHUNKS.length);
      }, 900);
    },
    async stop(): Promise<ListenResult | null> {
      clear();
      const duration_ms = startedAt ? Date.now() - startedAt : 0;
      // stop 仅返回转写原文；summary 留空，交由服务端 B2.5 生成
      if (!transcript.trim()) return null;
      const result: ListenResult = { transcript, summary: '', duration_ms };
      events.onResult?.(result);
      return result;
    },
  };
}
