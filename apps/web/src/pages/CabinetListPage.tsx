/**
 * P3 展示柜选择页（路由 /palaces/:id/cabinets）
 * 组件：PeriodTabs · CabinetCard · NewCabinetActions · EmptyState
 * 接口：P3 宫殿详情、C1 柜子列表、C2 创建柜子
 * 边界：扫描页与 3D 主视图分别属于板块④（丁）与板块③（丙），本页只负责跳转与空态引导。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { periodTypeLabel, type CabinetVO, type PeriodType, type PalaceVO } from '@shared/index';
import { cabinetApi } from '../api/cabinets';
import { palaceApi } from '../api/palaces';
import { useToast } from '../app/ToastContext';
import { CabinetCard } from '../features/cabinets/CabinetCard';
import { Button } from '../components/ui/Button';
import { PageHeader, PageLoading, Tabs, EmptyState } from '../components/ui/Misc';
import { IconUsers } from '../components/ui/Icons';
import { USE_MOCK } from '../api/http';
import { buildPeriodKey } from '@shared/index';

type PeriodTab = PeriodType;

const TABS = [
  { key: 'monthly' as PeriodTab, label: '月度' },
  { key: 'quarterly' as PeriodTab, label: '季度' },
  { key: 'yearly' as PeriodTab, label: '年度' },
];

export function CabinetListPage() {
  const { palaceId = '' } = useParams();
  const navigate = useNavigate();
  const { reportError, success } = useToast();

  const [palace, setPalace] = useState<PalaceVO | null>(null);
  const [cabinets, setCabinets] = useState<CabinetVO[] | null>(null);
  const [tab, setTab] = useState<PeriodTab>('monthly');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, list] = await Promise.all([
        palaceApi.detail(palaceId),
        cabinetApi.list(palaceId),
      ]);
      setPalace(detail);
      setCabinets(list.cabinets);
    } catch (e) {
      reportError(e, '没能读到这座宫殿');
      setCabinets([]);
    }
  }, [palaceId, reportError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (cabinets ?? []).filter((c) => c.period_type === tab),
    [cabinets, tab],
  );

  const periodKey = buildPeriodKey(tab);

  /** Mock 环境下的临时直通：不等板块④管线也能验证 P3 → P4 的流转 */
  const createMockCabinet = async () => {
    setCreating(true);
    try {
      const created = await cabinetApi.create(palaceId, {
        period_type: tab,
        period_key: periodKey,
        model_asset_id: `mock_asset_${Date.now()}`,
      });
      success('柜子建好了');
      navigate(`/cabinets/${created.id}/view`);
    } catch (e) {
      reportError(e, '柜子没能建成功');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page fade-in">
      <PageHeader
        title={palace?.name ?? '展示柜'}
        onBack={() => navigate('/palaces')}
        right={
          palace?.type === 'public' ? (
            <button
              className="icon-btn"
              aria-label="成员管理"
              onClick={() => navigate(`/palaces/${palaceId}/members`)}
            >
              <IconUsers />
            </button>
          ) : null
        }
      />

      <div className="shell cabinet-list">
        <Tabs<PeriodTab> items={TABS} value={tab} onChange={setTab} full />

        {/* 3D 房间体验入口（板块③④：四季光影房间 / 照片墙 / 摆放物件） */}
        <button
          className="paper-card"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, width: '100%', padding: '12px 16px', marginTop: 14,
            cursor: 'pointer', textAlign: 'left', border: 'none', font: 'inherit',
          }}
          onClick={() => navigate('/memory-room3d')}
        >
          <span>
            <span style={{ fontWeight: 500, fontSize: 15 }}>🏠 走进 3D 房间</span>
            <span className="hint" style={{ display: 'block', marginTop: 2 }}>
              四季光影 · 照片墙 · 摆放回忆物件
            </span>
          </span>
          <span style={{ fontSize: 18, color: 'var(--color-primary-deep)' }}>→</span>
        </button>

        {cabinets === null ? (
          <PageLoading />
        ) : visible.length === 0 ? (
          <EmptyState
            title={`这个${periodTypeLabel(tab)}还空着`}
            desc="扫描添加物品的功能在 3D 房间的物品栏里，点下方按钮进去看看。"
            action={
              <div className="cabinet-list__actions">
                <Button onClick={() => navigate('/memory-room3d')}>
                  🏠 走进 3D 房间
                </Button>
                {USE_MOCK ? (
                  <Button variant="ghost" loading={creating} onClick={createMockCabinet}>
                    （Mock）先建一个空柜子
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : (
          <>
            <div className="cabinet-grid">
              {visible.map((c) => (
                <CabinetCard
                  key={c.id}
                  cabinet={c}
                  onOpen={(cc) => navigate(`/cabinets/${cc.id}/view`)}
                />
              ))}
            </div>

            {USE_MOCK ? (
              <div className="cabinet-list__actions cabinet-list__actions--bottom">
                <Button variant="ghost" loading={creating} onClick={createMockCabinet}>
                  （Mock）先建一个空柜子
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
