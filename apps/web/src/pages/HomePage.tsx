/**
 * P2 首页 / 我的回忆宫殿列表（路由 /palaces）
 * 组件：HomePageHeader · PalaceCard · CreatePalaceSheet（全局 + 号入口）· EmptyState
 * 接口：P1 宫殿列表
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { palaceApi } from '../api/palaces';
import { useAuth } from '../app/AuthContext';
import { useToast } from '../app/ToastContext';
import { PalaceCard } from '../features/palaces/PalaceCard';
import { useCreatePalace } from '../features/palaces/CreatePalaceContext';
import { Button } from '../components/ui/Button';
import { EmptyState, PageLoading } from '../components/ui/Misc';
import type { PalaceVO } from '@shared/index';
import { greeting } from '../utils/time';

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reportError } = useToast();
  const { openCreate } = useCreatePalace();
  const [list, setList] = useState<PalaceVO[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { palaces } = await palaceApi.list();
      setList(palaces);
    } catch (e) {
      reportError(e, '没能读到宫殿列表');
      setList([]);
    }
  }, [reportError]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalCabinets = list?.reduce((n, p) => n + p.cabinet_count, 0) ?? 0;
  const totalItems = list?.reduce((n, p) => n + p.item_count, 0) ?? 0;

  return (
    <div className="home fade-in">
      <header className="home__header">
        <div className="shell">
          <h1 className="home__title serif">
            {greeting()}，{user?.nickname ?? '你'}
          </h1>
          {list && list.length > 0 ? (
            <p className="home__sub muted">
              你有 {list.length} 座宫殿，{totalCabinets} 个展示柜，里面放着 {totalItems} 件老物件。
            </p>
          ) : (
            <p className="home__sub muted">把你舍不得丢的东西，收进一个只属于你的角落。</p>
          )}
        </div>
      </header>

      <div className="shell home__content">
        {list === null ? (
          <PageLoading />
        ) : list.length === 0 ? (
          <EmptyState
            title="这里还空着"
            desc="建一座宫殿，放进第一个展示柜，然后用手机把身边的旧物拍下来。"
            action={
              <Button style={{ marginTop: 6 }} onClick={() => openCreate('create')}>
                建一座宫殿
              </Button>
            }
          />
        ) : (
          <div className="palace-grid">
            {list.map((p) => (
              <PalaceCard
                key={p.id}
                palace={p}
                onOpen={() => navigate(`/palaces/${p.id}/cabinets`)}
                onMembers={
                  p.type === 'public' ? () => navigate(`/palaces/${p.id}/members`) : undefined
                }
              />
            ))}
          </div>
        )}

        {list && list.length > 0 ? (
          <div className="home__actions">
            <Button variant="secondary" onClick={() => openCreate('create')}>
              新建公共宫殿
            </Button>
            <Button variant="ghost" onClick={() => openCreate('join')}>
              用邀请码加入
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
