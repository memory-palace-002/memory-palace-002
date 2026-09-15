/** P3 展示柜选择页 —— CabinetCard：柜缩略图 + period_key + 物品数 + 状态徽标 */
import type { CabinetVO } from '@shared/index';
import { periodKeyLabel } from '@shared/index';
import { PaperCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Misc';
import { IconLock } from '../../components/ui/Icons';

const STATUS_META: Record<
  CabinetVO['status'],
  { label: string; tone: 'default' | 'clay' | 'sage' | 'gold' | 'ghost' }
> = {
  active: { label: '摆放中', tone: 'sage' },
  full: { label: '已装满', tone: 'gold' },
  archived: { label: '已收起', tone: 'ghost' },
};

export function CabinetCard({
  cabinet,
  onOpen,
}: {
  cabinet: CabinetVO;
  onOpen: (cabinet: CabinetVO) => void;
}) {
  const status = STATUS_META[cabinet.status];

  return (
    <PaperCard className="cabinet-card" interactive onClick={() => onOpen(cabinet)}>
      <div className={`cabinet-card__cover ${cabinet.status === 'archived' ? 'is-dim' : ''}`}>
        {cabinet.cover_thumbnail_url ? (
          <img src={cabinet.cover_thumbnail_url} alt={cabinet.name ?? cabinet.period_key} />
        ) : (
          <div className="cabinet-card__grid" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        <span className="cabinet-card__count">
          {cabinet.item_count}
          <em>件</em>
        </span>
      </div>

      <div className="cabinet-card__body">
        <div className="cabinet-card__title truncate">
          {cabinet.name || periodKeyLabel(cabinet.period_type, cabinet.period_key)}
        </div>
        <div className="cabinet-card__foot">
          <Badge tone={status.tone}>{status.label}</Badge>
          {cabinet.is_full ? (
            <span className="cabinet-card__full">
              <IconLock size={13} /> 满柜
            </span>
          ) : null}
        </div>
      </div>
    </PaperCard>
  );
}
