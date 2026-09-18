// P2 首页：我的角落列表（个人 + 公共），新建公共角落，凭邀请码加入（§4.3 P2）
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shell, Sheet, useToast } from '../components/ui';
import { api, ApiError } from '../api/client';

type PalaceVO = {
  id: string;
  type: 'personal' | 'public';
  name: string;
  member_count: number;
  updated_at: string;
  my_role: 'owner' | 'member';
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日更新`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [palaces, setPalaces] = useState<PalaceVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [joinOpen, setJoinOpen] = useState(false);
  const [createType, setCreateType] = useState<'personal' | 'public'>('public');
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/palaces');
      setPalaces(data.palaces || []);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '加载失败，请刷新重试', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // TabBar「+」跳转带 create=1 → 自动打开新建抽屉后清除参数
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/palaces', { name: newName.trim(), type: createType });
      toast(createType === 'personal' ? '个人角落创建成功' : '公共角落创建成功');
      setCreateOpen(false);
      setNewName('');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '创建失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.post('/palaces/join', { code: joinCode.trim() });
      toast('加入成功，欢迎来到这个角落');
      setJoinOpen(false);
      setJoinCode('');
      navigate(`/palaces/${data.palace.id}/members`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '加入失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="首页">
      <div className="page-title">我们的角落</div>
      <div className="hand-font hint" style={{ marginTop: 6, marginBottom: 24 }}>
        每个角落，都装着一段时间的故事
      </div>

      {/* 操作入口 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          style={{ height: 44, flex: '1 1 160px' }}
          onClick={() => { setCreateType('personal'); setCreateOpen(true); }}
        >
          ＋ 新建个人角落
        </button>
        <button
          className="btn btn-primary"
          style={{ height: 44, flex: '1 1 160px', background: 'var(--color-primary-deep)' }}
          onClick={() => { setCreateType('public'); setCreateOpen(true); }}
        >
          ＋ 新建公共角落
        </button>
        <button className="btn btn-secondary" style={{ height: 44, flex: '1 1 160px' }} onClick={() => setJoinOpen(true)}>
          输入邀请码
        </button>
      </div>

      {/* 角落卡片列表 */}
      {loading ? (
        <div className="hint">加载中…</div>
      ) : (
        <div className="palace-grid">
          {palaces.map((p) => (
            <div
              key={p.id}
              className="paper-card palace-card"
              onClick={() => navigate(`/palaces/${p.id}/cabinets`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 17 }}>{p.name}</div>
                <span className={`tag ${p.type === 'personal' ? 'tag-personal' : 'tag-public'}`}>
                  {p.type === 'personal' ? '个人' : '公共'}
                </span>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                👥 {p.member_count} 人 · 点按进入展示柜
              </div>
              <div className="hint" style={{ marginTop: 2 }}>{fmtTime(p.updated_at)}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && palaces.length === 0 && (
        <div className="paper-card hand-font" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
          还没有角落，点击上方按钮，建一个属于你们的角落吧
        </div>
      )}

      <div style={{ height: 80 }} />

      {/* 新建角落抽屉（个人/公共可切换） */}
      {createOpen && (
        <Sheet onClose={() => setCreateOpen(false)}>
          <div className="section-title" style={{ marginBottom: 12 }}>新建角落</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              className={`type-toggle ${createType === 'personal' ? 'active' : ''}`}
              onClick={() => setCreateType('personal')}
            >
              🔒 个人角落<small>只属于我自己</small>
            </button>
            <button
              className={`type-toggle ${createType === 'public' ? 'active' : ''}`}
              onClick={() => setCreateType('public')}
            >
              👥 公共角落<small>可邀请家人朋友</small>
            </button>
          </div>
          <input
            className="input"
            placeholder="给角落起个名字（1~20 个字）"
            value={newName}
            maxLength={20}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="btn btn-primary"
            style={{ height: 44, marginTop: 16 }}
            disabled={!newName.trim() || busy}
            onClick={handleCreate}
          >
            创建{createType === 'personal' ? '个人' : '公共'}角落
          </button>
        </Sheet>
      )}

      {/* 邀请码加入抽屉 */}
      {joinOpen && (
        <Sheet onClose={() => setJoinOpen(false)}>
          <div className="section-title" style={{ marginBottom: 8 }}>输入邀请码</div>
          <div className="hint" style={{ marginBottom: 16 }}>向角落的创建者要一个 8 位邀请码</div>
          <input
            className="input"
            placeholder="例如：A3K7MNPQ"
            value={joinCode}
            maxLength={8}
            style={{ textTransform: 'uppercase', letterSpacing: 4 }}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            className="btn btn-primary"
            style={{ height: 44, marginTop: 16 }}
            disabled={joinCode.trim().length < 8 || busy}
            onClick={handleJoin}
          >
            加入
          </button>
        </Sheet>
      )}
    </Shell>
  );
}
