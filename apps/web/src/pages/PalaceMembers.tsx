// P9 公共角落页：角落信息 + 成员列表 + 邀请码生成/凭码加入 + 移除成员/退出（§4.3 P9）
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell, Sheet, useToast } from '../components/ui';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../store/auth';

type MemberVO = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  role: 'owner' | 'member';
  joined_at: string;
};

type PalaceDetail = {
  id: string;
  type: 'personal' | 'public';
  name: string;
  member_count: number;
  my_role: 'owner' | 'member';
};

function fmtJoined(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 加入`;
}

export default function PalaceMembersPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const [palace, setPalace] = useState<PalaceDetail | null>(null);
  const [members, setMembers] = useState<MemberVO[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ code: string; share_text: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberVO | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([api.get(`/palaces/${id}`), api.get(`/palaces/${id}/members`)]);
      setPalace(d.palace);
      setMembers(m.members || []);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '加载失败', 'error');
      if (e instanceof ApiError && (e.code === 40401 || e.code === 40301)) navigate('/palaces', { replace: true });
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenInvite() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.post(`/palaces/${id}/invite-codes`, {});
      setInviteResult(data);
      setInviteOpen(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '生成失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.share_text);
      toast('邀请文案已复制，去粘贴给朋友吧');
    } catch {
      toast('复制失败，请手动选择文字复制', 'error');
    }
  }

  async function handleRemove() {
    if (!removeTarget || busy) return;
    setBusy(true);
    try {
      await api.del(`/palaces/${id}/members/${removeTarget.user_id}`);
      toast(`已移除「${removeTarget.nickname}」`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm('确定要退出这个角落吗？退出后需要新的邀请码才能再加入。')) return;
    try {
      await api.del(`/palaces/${id}/members/${me?.id}`);
      toast('已退出角落');
      navigate('/palaces', { replace: true });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '操作失败', 'error');
    }
  }

  if (!palace) {
    return (
      <Shell title="我们的角落">
        <div className="hint">加载中…</div>
      </Shell>
    );
  }

  const isOwner = palace.my_role === 'owner';

  return (
    <Shell title="我们的角落">
      {/* 角落信息头 */}
      <div className="paper-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 500, fontSize: 19 }}>{palace.name}</div>
          <span className={`tag ${palace.type === 'personal' ? 'tag-personal' : 'tag-public'}`}>
            {palace.type === 'personal' ? '个人' : '公共'}
          </span>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          👥 {palace.member_count} 位成员 · 我的身份：{isOwner ? '创建者' : '成员'}
        </div>
      </div>

      {/* 共建规则说明 */}
      <div className="hint" style={{ margin: '16px 4px' }}>
        共建规则：成员可以一起往角落里添加物品与简介；删除的物品 15 天内可以恢复。
      </div>

      {/* owner 操作 */}
      {isOwner && palace.type === 'public' && (
        <button className="btn btn-primary" style={{ height: 44, marginBottom: 20 }} disabled={busy} onClick={handleGenInvite}>
          ✉ 生成邀请码
        </button>
      )}

      {/* 成员列表 */}
      <div className="section-title" style={{ margin: '8px 0 12px' }}>
        成员（{members.length}）
      </div>
      <div className="paper-card" style={{ padding: '4px 16px' }}>
        {members.map((m) => (
          <div key={m.user_id} className="member-row">
            <div className="avatar-mini">{(m.nickname || '记').slice(0, 1)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>
                  {m.nickname}
                  {m.user_id === me?.id && <span className="hint">（我）</span>}
                </span>
                <span className={`badge ${m.role === 'owner' ? 'badge-owner' : 'badge-member'}`}>
                  {m.role === 'owner' ? '创建者' : '成员'}
                </span>
              </div>
              <div className="hint" style={{ marginTop: 2 }}>{fmtJoined(m.joined_at)}</div>
            </div>
            {isOwner && m.role !== 'owner' && (
              <button className="btn btn-danger" style={{ height: 32, padding: '0 14px', fontSize: 13 }} onClick={() => setRemoveTarget(m)}>
                移除
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 成员退出入口 */}
      {!isOwner && (
        <button className="btn btn-danger" style={{ height: 44, marginTop: 24, width: '100%' }} onClick={handleLeave}>
          退出这个角落
        </button>
      )}

      <div style={{ height: 80 }} />

      {/* 邀请码结果抽屉 */}
      {inviteOpen && inviteResult && (
        <Sheet onClose={() => setInviteOpen(false)}>
          <div className="section-title" style={{ marginBottom: 8, textAlign: 'center' }}>邀请码已生成</div>
          <div className="code-display">{inviteResult.code}</div>
          <div className="hint" style={{ margin: '12px 0 16px', whiteSpace: 'pre-wrap', textAlign: 'center' }}>
            {inviteResult.share_text}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" style={{ height: 44 }} onClick={handleCopy}>
              复制邀请文案
            </button>
            <button className="btn btn-primary" style={{ height: 44 }} onClick={() => setInviteOpen(false)}>
              完成
            </button>
          </div>
        </Sheet>
      )}

      {/* 移除成员确认抽屉 */}
      {removeTarget && (
        <Sheet onClose={() => setRemoveTarget(null)}>
          <div className="section-title" style={{ marginBottom: 8 }}>移除成员</div>
          <div className="hint" style={{ marginBottom: 16 }}>
            确定把「{removeTarget.nickname}」移出这个角落吗？他需要新的邀请码才能再次加入。
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" style={{ height: 44 }} onClick={() => setRemoveTarget(null)}>
              取消
            </button>
            <button className="btn btn-primary" style={{ height: 44, background: 'var(--color-accent)' }} disabled={busy} onClick={handleRemove}>
              确认移除
            </button>
          </div>
        </Sheet>
      )}
    </Shell>
  );
}
