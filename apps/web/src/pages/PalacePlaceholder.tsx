// P3 展示柜选择页 · 占位页（板块③接入柜子接口后替换为完整实现）
import { useNavigate, useParams } from 'react-router-dom';
import { Shell } from '../components/ui';

export default function PalacePlaceholderPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  return (
    <Shell title="展示柜">
      <div className="page-title" style={{ marginBottom: 20 }}>展示柜</div>
      <div className="paper-card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔨</div>
        <div className="hand-font" style={{ fontSize: 17, marginBottom: 8 }}>这个角落的展示柜正在施工中</div>
        <div className="hint" style={{ marginBottom: 24 }}>展示柜与 3D 摆放将在板块③开放，敬请期待</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-secondary" style={{ height: 44, width: 'auto' }} onClick={() => navigate('/palaces')}>
            返回角落列表
          </button>
          <button className="btn btn-primary" style={{ height: 44, width: 'auto' }} onClick={() => navigate(`/palaces/${id}/members`)}>
            查看成员
          </button>
        </div>
      </div>
      <div style={{ height: 80 }} />
    </Shell>
  );
}
