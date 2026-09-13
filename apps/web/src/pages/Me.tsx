// P10 个人中心：用户信息卡 + 菜单（手机号脱敏、宫殿占位、退出登录）
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { Shell, useToast } from '../components/ui';

export default function MePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, personalPalace, fetchMe, logout } = useAuthStore();

  useEffect(() => {
    fetchMe();
  }, []);

  async function handleLogout() {
    if (!window.confirm('确定要退出登录吗？')) return;
    await logout();
    toast('已退出登录');
    navigate('/login', { replace: true });
  }

  return (
    <Shell title="个人中心">
      <div className="page-title" style={{ marginBottom: 20 }}>我的</div>

      {/* 用户信息卡 */}
      <div className="paper-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: 'var(--color-primary)', color: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
          }}
        >
          {(user?.nickname || '记').slice(0, 1)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{user?.nickname || '加载中…'}</div>
          <div className="hint" style={{ marginTop: 4 }}>
            📱 {user?.phone_masked || '—'} · 手机号登录
          </div>
        </div>
      </div>

      <div className="section-title" style={{ margin: '24px 0 12px' }}>我的回忆宫殿</div>
      <div
        className="paper-card"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => toast('「宫殿列表」将在板块②开放', 'info')}
      >
        <div>
          <div style={{ fontWeight: 500 }}>{personalPalace?.name || '我的回忆宫殿'}</div>
          <div className="hint" style={{ marginTop: 4 }}>个人宫殿 · 展示柜功能建设中</div>
        </div>
        <span style={{ color: 'var(--color-text-secondary)' }}>›</span>
      </div>

      <div className="section-title" style={{ margin: '24px 0 12px' }}>更多</div>
      <div className="paper-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toast('微信绑定将在后续版本开放', 'info')}
        >
          <span>绑定微信</span>
          <span className="hint">未绑定 ›</span>
        </div>
        <div
          style={{ padding: '14px 16px', color: 'var(--color-accent)', cursor: 'pointer' }}
          onClick={handleLogout}
        >
          退出登录
        </div>
      </div>

      <div style={{ height: 80 }} />
    </Shell>
  );
}
