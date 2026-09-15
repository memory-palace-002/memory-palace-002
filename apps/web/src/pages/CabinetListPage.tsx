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
import { useIsDesktop } from '../hooks/useResponsive';
import { CabinetCard } from '../features/cabinets/CabinetCard';
import { Button } from '../components/ui/Button';
import { PageHeader, PageLoading, Tabs, EmptyState } from '../components/ui/Misc';
import { Sheet } from '../components/ui/Sheet';
import { IconCamera, IconQr, IconScan, IconUsers } from '../components/ui/Icons';
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
  const isDesktop = useIsDesktop();
  const { reportError, success } = useToast();

  const [palace, setPalace] = useState<PalaceVO | null>(null);
  const [cabinets, setCabinets] = useState<CabinetVO[] | null>(null);
  const [tab, setTab] = useState<PeriodTab>('monthly');
  const [qrOpen, setQrOpen] = useState(false);
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

  /** 桌面端隐藏扫描入口，提示「请在手机端扫描」（§4.1 双端差异） */
  const goScan = () => {
    if (isDesktop) {
      setQrOpen(true);
      return;
    }
    navigate(
      `/scan?type=cabinet&palace_id=${palaceId}&period_type=${tab}&period_key=${periodKey}`,
    );
  };

  const goImport = () => {
    if (isDesktop) {
      setQrOpen(true);
      return;
    }
    navigate(
      `/scan?type=cabinet&mode=import&palace_id=${palaceId}&period_type=${tab}&period_key=${periodKey}`,
    );
  };

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
        <Tabs items={TABS} value={tab} onChange={setTab} full />

        {cabinets === null ? (
          <PageLoading />
        ) : visible.length === 0 ? (
          <EmptyState
            title={`这个${periodTypeLabel(tab)}还空着`}
            desc="拿出手机绕着柜子拍一圈，它会变成你宫殿里的一个角落。"
            action={
              <div className="cabinet-list__actions">
                <Button onClick={goScan}>
                  <IconScan size={18} /> 拍照扫描新展示柜
                </Button>
                <Button variant="secondary" onClick={goImport}>
                  导入已有模型
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

            <div className="cabinet-list__actions cabinet-list__actions--bottom">
              <Button variant="secondary" onClick={goScan}>
                <IconCamera size={18} /> 拍照扫描新展示柜
              </Button>
              <Button variant="ghost" onClick={goImport}>
                导入已有模型
              </Button>
              {USE_MOCK ? (
                <Button variant="ghost" loading={creating} onClick={createMockCabinet}>
                  （Mock）先建一个空柜子
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="扫描需要在手机上完成" width={420}>
        <div className="scan-guide">
          <div className="scan-guide__qr">
            <IconQr size={64} />
          </div>
          <p className="muted" style={{ textAlign: 'center' }}>
            用手机打开小角落，扫码进入这座宫殿，
            <br />
            就能把眼前的柜子拍成一整个 3D 角落。
          </p>
          <p className="faint" style={{ textAlign: 'center', fontSize: 'var(--fs-tiny)' }}>
            电脑端可以摆放、查看、编辑简介，只有扫描拍照需要手机。
          </p>
        </div>
      </Sheet>
    </div>
  );
}
