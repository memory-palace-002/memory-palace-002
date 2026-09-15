/** P7 VoiceRecordButton —— 中央大圆按钮，录音呼吸动画（无发光） */
import { IconMic, IconStop } from '../../components/ui/Icons';
import './listen.css';

export function VoiceRecordButton({
  state,
  onStart,
  onStop,
  disabled,
}: {
  state: 'idle' | 'listening' | 'generating' | 'review' | 'done';
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  if (state === 'generating') {
    return (
      <div className="record-btn record-btn--generating" aria-busy="true">
        <span className="spinner" />
      </div>
    );
  }

  const listening = state === 'listening';
  return (
    <button
      className={`record-btn ${listening ? 'record-btn--active' : ''}`}
      onClick={listening ? onStop : onStart}
      disabled={disabled}
      aria-label={listening ? '说完啦' : '开始说话'}
    >
      <span className="record-btn__pulse" aria-hidden="true" />
      <span className="record-btn__icon">
        {listening ? <IconStop size={30} /> : <IconMic size={30} />}
      </span>
    </button>
  );
}
