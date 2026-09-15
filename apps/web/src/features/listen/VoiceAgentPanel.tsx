/**
 * P7 VoiceAgentPanel —— 嵌入式聆听组件容器
 * 三态：待开始 / 聆听中 / 生成中（完成后展示 BlurbResultCard）
 * 交互硬约束（PRD）：AI 不引导、不追问，只聆听记录与总结；录完即生成。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlurbVO, ItemDetailVO } from '@shared/index';
import { listenApi } from '../../api/listen';
import { useToast } from '../../app/ToastContext';
import { createVoiceAgent, type VoiceAgentAdapter } from '../../voice';
import { VoiceRecordButton } from './VoiceRecordButton';
import { LiveTranscript } from './LiveTranscript';
import { TranscriptEditor } from './TranscriptEditor';
import { BlurbResultCard } from './BlurbResultCard';
import { BlurbEditSheet } from './BlurbEditSheet';
import { Button } from '../../components/ui/Button';
import { IconEdit, IconRefresh } from '../../components/ui/Icons';

type Phase = 'idle' | 'listening' | 'review' | 'generating' | 'done';

export function VoiceAgentPanel({
  item,
  blurb,
  onBlurbChange,
  onFinish,
}: {
  item: ItemDetailVO;
  blurb: BlurbVO | null;
  onBlurbChange: (blurb: BlurbVO | null) => void;
  onFinish: () => void;
}) {
  const { reportError, success } = useToast();
  const [phase, setPhase] = useState<Phase>(blurb ? 'done' : 'idle');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const adapterRef = useRef<VoiceAgentAdapter | null>(null);
  const sessionRef = useRef<string | null>(null);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    setPhase(blurb ? 'done' : 'idle');
  }, [blurb?.id]);

  const start = useCallback(async () => {
    setBusy(true);
    setFallback(false);
    try {
      const { session_id, sdk_config } = await listenApi.createSession(item.id);
      sessionRef.current = session_id;
      const adapter = createVoiceAgent(sdk_config);
      adapterRef.current = adapter;
      setTranscript('');
      setDraft('');
      await adapter.start(sdk_config, {
        onTranscript: (text) => setTranscript((prev) => prev + text),
      });
      setPhase('listening');
    } catch (e) {
      reportError(e, '没能开始聆听');
      setFallback(true);
    } finally {
      setBusy(false);
    }
  }, [item.id, reportError]);

  const stop = useCallback(async () => {
    const adapter = adapterRef.current;
    const sessionId = sessionRef.current;
    if (!adapter || !sessionId) return;
    try {
      const result = await adapter.stop();
      if (!result || !result.transcript.trim()) {
        setFallback(true);
        setPhase('idle');
        return;
      }
      // 进入校订态：把转写稿交给用户修正识别偏差
      setTranscript(result.transcript);
      setDraft(result.transcript);
      durationRef.current = result.duration_ms;
      setPhase('review');
    } catch (e) {
      reportError(e, '没听清，可以直接把故事写下来');
      setFallback(true);
      setPhase('idle');
    }
  }, [reportError]);

  /** 校订完成 → 用校订后的转写生成简介（B2.5）并落库（B2） */
  const confirmReview = useCallback(async () => {
    const sessionId = sessionRef.current;
    const edited = draft.trim();
    if (!sessionId || !edited) {
      reportError(new Error('转写为空'), '好像没听到内容，再试一次？');
      return;
    }
    setPhase('generating');
    try {
      const { summary } = await listenApi.summarize(sessionId, { transcript: edited });
      const { blurb: saved } = await listenApi.reportResult(sessionId, {
        transcript: edited,
        summary,
        duration_ms: durationRef.current,
      });
      onBlurbChange(saved);
      setPhase('done');
    } catch (e) {
      reportError(e, '整理失败了，可以直接把故事写下来');
      setFallback(true);
      setPhase('idle');
    }
  }, [draft, onBlurbChange, reportError]);

  /** 回到录音态，重新说一遍 */
  const rerecord = useCallback(() => {
    setTranscript('');
    setDraft('');
    setFallback(false);
    setPhase('idle');
  }, []);

  /** B5 重新聆听 */
  const regenerate = async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) {
      success('先说一次，才能重新整理哦');
      return;
    }
    setPhase('generating');
    try {
      const { blurb: saved } = await listenApi.regenerate(item.id, sessionId);
      onBlurbChange(saved);
      setPhase('done');
    } catch (e) {
      reportError(e, '重新整理失败');
      setPhase('done');
    }
  };

  /** B4 编辑简介 */
  const saveEdit = async (content: string) => {
    setSaving(true);
    try {
      const { blurb: saved } = await listenApi.updateBlurb(item.id, { content });
      onBlurbChange(saved);
      setEditOpen(false);
      setPhase('done');
      success('简介已更新');
    } catch (e) {
      reportError(e, '保存失败，请检查字数');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="listen-panel">
      {phase === 'done' && blurb ? (
        <>
          <BlurbResultCard blurb={blurb} />
          <div className="listen-actions">
            <Button variant="secondary" size="sm" onClick={() => void regenerate()}>
              <IconRefresh size={16} /> 重新聆听
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <IconEdit size={16} /> 编辑
            </Button>
            <Button size="sm" onClick={onFinish}>
              放回柜子
            </Button>
          </div>
        </>
      ) : null}

      {phase !== 'done' ? (
        <>
          {phase !== 'review' ? (
            <div className="listen-stage">
              <VoiceRecordButton
                state={phase === 'generating' ? 'generating' : phase}
                disabled={busy}
                onStart={() => void start()}
                onStop={() => void stop()}
              />

              <div className="listen-hint">
                {phase === 'idle' ? (
                  <>
                    <div className="listen-hint__title hand">说说它是怎么来的</div>
                    <div className="listen-hint__sub muted">
                      点一下开始，想到什么说什么，说完再点一下结束。
                    </div>
                  </>
                ) : null}
                {phase === 'listening' ? (
                  <div className="listen-hint__sub muted">我在听，说慢一点也没关系。</div>
                ) : null}
                {phase === 'generating' ? (
                  <div className="listen-hint__sub muted">正在把你说的整理成一段话…</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === 'listening' || phase === 'generating' ? (
            <LiveTranscript text={transcript} />
          ) : null}

          {phase === 'review' ? (
            <div className="listen-review">
              <TranscriptEditor value={draft} onChange={setDraft} />
              <div className="listen-review__actions">
                <Button variant="secondary" size="sm" onClick={rerecord}>
                  重新说
                </Button>
                <Button size="sm" onClick={() => void confirmReview()} disabled={!draft.trim()}>
                  确认并生成简介
                </Button>
              </div>
            </div>
          ) : null}

          {fallback ? (
            <div className="listen-fallback">
              <p className="muted">没听清也没关系，你可以自己把它写下来。</p>
              <Button size="sm" onClick={() => setEditOpen(true)}>
                我来写
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="listen-note faint">
        录音与转写内容仅用于生成这段简介，服务器会保留原文以便你重新整理。
      </p>

      <BlurbEditSheet
        open={editOpen}
        initial={blurb?.content ?? ''}
        loading={saving}
        onClose={() => setEditOpen(false)}
        onSubmit={saveEdit}
      />
    </section>
  );
}
