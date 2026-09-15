/** Adapter 工厂 —— 换 SDK 只改这里 */
import type { SdkConfig } from '@shared/index';
import type { VoiceAgentAdapter } from './VoiceAgentAdapter';
import { createMockAdapter } from './adapters/mockAdapter';
import { createVolcanoAdapter } from './adapters/volcanoAdapter';

export function createVoiceAgent(config?: SdkConfig | null): VoiceAgentAdapter {
  const provider = config?.provider ?? 'mock';
  switch (provider) {
    case 'volcano_doubao':
      return createVolcanoAdapter();
    case 'aliyun_bailian':
    case 'xfyun_spark':
      // 备选 SDK：实现对应 adapter 后在此返回即可
      return createMockAdapter();
    case 'mock':
    default:
      return createMockAdapter();
  }
}

export type { VoiceAgentAdapter, VoiceAgentEvents, ListenResult } from './VoiceAgentAdapter';
