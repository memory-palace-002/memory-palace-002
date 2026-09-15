/**
 * P7 AI 聆听者页（路由 /items/:id/listen）
 * 接口：B1 创建会话、B2 上报结果、B3 查询简介、B4 编辑简介、B5 重新聆听；I5 物品详情
 * 绑定顺序（§3.6）：先扫描物品 → 再聆听 → 简介挂到该物品；聆听入口只存在于已存在的物品上。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BlurbVO, ItemDetailVO } from '@shared/index';
import { itemApi } from '../api/cabinets';
import { listenApi } from '../api/listen';
import { useToast } from '../app/ToastContext';
import { PageHeader, PageLoading } from '../components/ui/Misc';
import { VoiceAgentPanel } from '../features/listen/VoiceAgentPanel';
import { Avatar } from '../components/ui/Misc';

export function ListenPage() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { reportError } = useToast();
  const [item, setItem] = useState<ItemDetailVO | null>(null);
  const [blurb, setBlurb] = useState<BlurbVO | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, b] = await Promise.all([
        itemApi.detail(itemId),
        listenApi.getBlurb(itemId),
      ]);
      setItem(detail);
      setBlurb(b.blurb);
    } catch (e) {
      reportError(e, '没能读到这件物品');
    }
  }, [itemId, reportError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="listen-page fade-in">
      <PageHeader title="听它说话" onBack={() => navigate(-1)} />

      <div className="shell listen-page__inner">
        {item === null ? (
          <PageLoading />
        ) : (
          <>
            <div className="listen-item">
              <div className="listen-item__thumb">
                {item.model.thumbnail_url ? (
                  <img src={item.model.thumbnail_url} alt={item.name} />
                ) : (
                  <span className="hand">{item.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="row__main">
                <div className="listen-item__name serif truncate">{item.name}</div>
                <div className="listen-item__meta faint">
                  <Avatar name={item.owner.nickname} size={20} /> {item.owner.nickname} 放进去的
                </div>
              </div>
            </div>

            <VoiceAgentPanel
              item={item}
              blurb={blurb}
              onBlurbChange={setBlurb}
              onFinish={() => navigate(`/cabinets/${item.cabinet_id}/view`)}
            />
          </>
        )}
      </div>
    </div>
  );
}
