/**
 * P9 公共宫殿页（路由 /palaces/:id/members）
 * 组件：PalaceInfoHeader · MemberList · InviteCodeSheet · JoinByCodeInput · RemoveMemberButton · SharedRuleNote
 * 接口：P3 宫殿详情、P6 成员列表、P7 生成邀请码、P9 移除成员
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { InviteCodeVO, MemberVO, PalaceVO } from '@shared/index';
import { palaceApi } from '../api/palaces';
import { useToast } from '../app/ToastContext';
import { useAuth } from '../app/AuthContext';
import { PaperCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar, Badge, PageHeader, PageLoading } from '../components/ui/Misc';
import { Sheet, ConfirmSheet } from '../components/ui/Sheet';
import { IconCopy, IconCopyDone, IconLink, IconUsers } from '../components/ui/Icons';
import { useCreatePalace } from '../features/palaces/CreatePalaceContext';
import { copyText } from '../utils/clipboard';
import { formatDate } from '../utils/time';

export function PalaceMembersPage() {
  const { palaceId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reportError, success, show } = useToast();
  const { openCreate } = useCreatePalace();

  const [palace, setPalace] = useState<PalaceVO | null>(null);
  const [members, setMembers] = useState<MemberVO[] | null>(null);
  const [invite, setInvite] = useState<InviteCodeVO | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [copied, setCopied] = useState<'code' | 'text' | null>(null);
  const [target, setTarget] = useState<MemberVO | null>(null);
  const [removing, setRemoving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const isOwner = palace?.role === 'owner';

  const load = useCallback(async () => {
    try {
      const [detail, list] = await Promise.all([
        palaceApi.detail(palaceId),
        palaceApi.members(palaceId),
      ]);
      setPalace(detail);
      setMembers(list.members);
    } catch (e) {
      reportError(e, '没能读到成员列表');
      setMembers([]);
    }
  }, [palaceId, reportError]);

  useEffect(() => {
    void load();
  }, [load]);

  const genInvite = async () => {
    setGenLoading(true);
    try {
      const code = await palaceApi.createInviteCode(palaceId);
      setInvite(code);
      setInviteOpen(true);
    } catch (e) {
      reportError(e, '邀请码没能生成');
    } finally {
      setGenLoading(false);
    }
  };

  const doCopy = async (kind: 'code' | 'text') => {
    const text = kind === 'code' ? (invite?.code ?? '') : (invite?.share_text ?? '');
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      success(kind === 'code' ? '邀请码已复制' : '邀请文案已复制');
      window.setTimeout(() => setCopied(null), 2000);
    } else {
      show('复制失败了，长按选中手动复制吧', 'error');
    }
  };

  const removeMember = async () => {
    if (!target) return;
    setRemoving(true);
    try {
      await palaceApi.removeMember(palaceId, target.user_id);
      success(`已把 ${target.nickname} 移出宫殿`);
      setTarget(null);
      await load();
    } catch (e) {
      reportError(e, '没能移除成员');
    } finally {
      setRemoving(false);
    }
  };

  const leave = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      await palaceApi.removeMember(palaceId, user.id);
      success('已退出宫殿');
      setLeaveOpen(false);
      navigate('/palaces');
    } catch (e) {
      reportError(e, '没能退出宫殿');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="page fade-in">
      <PageHeader title={palace?.name ?? '宫殿成员'} onBack={() => navigate(-1)} />

      <div className="shell members-page">
        {members === null ? (
          <PageLoading />
        ) : (
          <>
            {/* PalaceInfoHeader */}
            <PaperCard className="palace-info" tape>
              <div className="palace-info__row">
                <div className="row__main">
                  <div className="palace-info__name serif">{palace?.name}</div>
                  <div className="palace-info__meta muted">
                    {palace?.type === 'public' ? '公共宫殿' : '私人角落'} ·{' '}
                    {members.length} 位成员 · {palace?.item_count ?? 0} 件物品
                  </div>
                </div>
                <Badge tone={palace?.type === 'public' ? 'clay' : 'default'}>
                  {isOwner ? '我建的' : '受邀加入'}
                </Badge>
              </div>
              {palace?.created_at ? (
                <div className="palace-info__created faint">建于 {formatDate(palace.created_at)}</div>
              ) : null}
            </PaperCard>

            {/* MemberList */}
            <div className="section-title">
              <span>成员</span>
              <span className="faint" style={{ fontSize: 'var(--fs-note)' }}>
                {members.length} 人
              </span>
            </div>

            <PaperCard>
              <ul className="member-list">
                {members.map((m, i) => (
                  <li key={m.user_id} className="member-item">
                    <Avatar name={m.nickname} src={m.avatar_url} size={42} />
                    <div className="row__main">
                      <div className="member-item__name">
                        {m.nickname}
                        {m.user_id === user?.id ? <span className="faint">（我）</span> : null}
                      </div>
                      <div className="member-item__meta faint">
                        {formatDate(m.joined_at)} 加入
                      </div>
                    </div>
                    {m.role === 'owner' ? (
                      <Badge tone="gold">创建者</Badge>
                    ) : isOwner ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setTarget(m)}
                        aria-label={`移除 ${m.nickname}`}
                      >
                        移除
                      </Button>
                    ) : null}
                    {i < members.length - 1 ? <span className="member-item__line" /> : null}
                  </li>
                ))}
              </ul>
            </PaperCard>

            {/* InviteCodeSheet 入口 */}
            {isOwner ? (
              <>
                <Button block loading={genLoading} onClick={genInvite} style={{ marginTop: 20 }}>
                  <IconLink size={18} /> 生成邀请码
                </Button>
                <div className="members-page__join">
                  <Button variant="ghost" onClick={() => openCreate('join')}>
                    <IconUsers size={18} /> 我也要加入别人的宫殿
                  </Button>
                </div>
              </>
            ) : (
              <div className="members-page__join">
                <Button variant="secondary" block onClick={() => setLeaveOpen(true)}>
                  退出这座宫殿
                </Button>
              </div>
            )}

            {/* SharedRuleNote */}
            <div className="rule-note">
              <div className="rule-note__title hand">这里的规矩</div>
              <ul className="rule-note__list">
                <li>成员都可以往宫殿里添加物品，也可以删除任何一件。</li>
                <li>删除的物品会保留 15 天，期间随时可以从「最近删除」找回。</li>
                <li>邀请码 8 位，可以设定使用次数和有效期，过期作废。</li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* InviteCodeSheet */}
      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="邀请朋友进来"
        width={440}
        footer={
          <Button
            block
            onClick={() => {
              void doCopy('text');
            }}
          >
            {copied === 'text' ? <IconCopyDone size={18} /> : <IconCopy size={18} />}
            复制邀请文案
          </Button>
        }
      >
        <div className="invite-code">
          <div className="invite-code__box">
            <span className="invite-code__value">{invite?.code ?? '--------'}</span>
            <button className="invite-code__copy" onClick={() => void doCopy('code')}>
              {copied === 'code' ? <IconCopyDone size={18} /> : <IconCopy size={18} />}
            </button>
          </div>
          <p className="invite-code__text">{invite?.share_text}</p>
          <p className="faint" style={{ fontSize: 'var(--fs-tiny)' }}>
            把这段文案发给朋友，他们输入邀请码就能进来。
          </p>
        </div>
      </Sheet>

      {/* RemoveMemberButton —— 危险二次确认 */}
      <ConfirmSheet
        open={target !== null}
        title={`把 ${target?.nickname ?? ''} 移出宫殿？`}
        desc="他会立刻看不到这座宫殿里的东西。移出后可以再邀请一次。"
        confirmText="确认移除"
        loading={removing}
        onConfirm={removeMember}
        onClose={() => setTarget(null)}
      />

      <ConfirmSheet
        open={leaveOpen}
        title="退出这座宫殿？"
        desc="你将看不到这里的物品，但别人放进来的东西不会受影响。"
        confirmText="退出宫殿"
        loading={leaving}
        onConfirm={leave}
        onClose={() => setLeaveOpen(false)}
      />
    </div>
  );
}
