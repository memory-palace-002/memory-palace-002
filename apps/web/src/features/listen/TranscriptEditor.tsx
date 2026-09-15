/** P7 TranscriptEditor —— 转写稿校订区，用户可点哪改哪，修正识别偏差 */
import { useEffect, useRef } from 'react';

export function TranscriptEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // 进入校订态时自动聚焦，方便直接打字修正
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="transcript-editor">
      <div className="transcript-editor__head">
        <span className="transcript-editor__title hand">听听转得对不对</span>
        <span className="transcript-editor__hint muted">点哪里改哪里，把听错的地方顺手改好</span>
      </div>
      <textarea
        ref={ref}
        className="transcript-editor__area"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="这里会显示识别出的文字，可以直接修改…"
        spellCheck={false}
      />
    </div>
  );
}
