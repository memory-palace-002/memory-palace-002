/** P2 首页 —— PalaceCard：纸亮白卡片（胶带装饰条）+ 柜/物品数 + 更新时间 */
import type { PalaceVO } from '@shared/index';
import { PaperCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Misc';
import { IconCabinet, IconUsers } from '../../components/ui/Icons';
import { timeAgo } from '../../utils/time';

export function PalaceCard({
  palace,
  onOpen,
  onMembers,
}: {
  palace: PalaceVO;
  onOpen: () => void;
  onMembers?: () => void;
}) {
  const isPublic = palace.type === 'public';
  const hasTape = Boolean(palace.cover_thumbnail_url) || isPublic;

  return (
    <PaperCard className="palace-card" interactive tape={hasTape ? 'clay' : false} onClick={onOpen}>
      <div className={`palace-card__cover ${isPublic ? 'is-public' : ''}`}>
        {palace.cover_thumbnail_url ? (
          <img src={palace.cover_thumbnail_url} alt={palace.name} />
        ) : (
          <div className="palace-card__pattern" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
      </div>

      <div className="palace-card__body">
        <div className="palace-card__title serif truncate">{palace.name}</div>

        <div className="palace-card__meta">
          <span>
            <IconCabinet size={15} /> {palace.cabinet_count} 个柜子
          </span>
          <span>·</span>
          <span>{palace.item_count} 件物品</span>
        </div>

        <div className="palace-card__foot">
          <Badge tone={isPublic ? 'clay' : 'default'}>
            {isPublic ? '公共宫殿' : '私人角落'}
          </Badge>

          {isPublic && typeof palace.member_count === 'number' ? (
            <button
              className="palace-card__members"
              onClick={(e) => {
                e.stopPropagation();
                onMembers?.();
              }}
            >
              <IconUsers size={15} /> {palace.member_count} 人
            </button>
          ) : null}

          <span className="palace-card__time faint">{timeAgo(palace.updated_at)}</span>
        </div>
      </div>
    </PaperCard>
  );
}
