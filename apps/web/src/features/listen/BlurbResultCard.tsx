/** P7 BlurbResultCard —— 简介正文（LXGW 文楷手写体）+ 字数（80~250） */
import type { BlurbVO } from '@shared/index';
import { LIMITS } from '@shared/index';
import { Badge } from '../../components/ui/Misc';
import { formatDateTime } from '../../utils/time';

const SOURCE_LABEL: Record<BlurbVO['source'], string> = {
  agent_ai: 'AI 聆听',
  manual: '我自己写的',
  agent_ai_edited: 'AI 聆听 · 改过',
};

export function BlurbResultCard({ blurb }: { blurb: BlurbVO }) {
  const len = blurb.content.length;
  const inRange = len >= LIMITS.BLURB_MIN && len <= LIMITS.BLURB_MAX;

  return (
    <div className="blurb-card slide-up">
      <div className="blurb-card__head">
        <Badge tone={blurb.source === 'manual' ? 'sage' : 'clay'}>{SOURCE_LABEL[blurb.source]}</Badge>
        <span className="blurb-card__len faint">
          第 {blurb.version} 版 · {len} 字{inRange ? '' : `（需 ${LIMITS.BLURB_MIN}~${LIMITS.BLURB_MAX} 字）`}
        </span>
      </div>
      <p className="blurb-card__body hand">{blurb.content}</p>
      <div className="blurb-card__foot faint">{formatDateTime(blurb.updated_at)}</div>
    </div>
  );
}
