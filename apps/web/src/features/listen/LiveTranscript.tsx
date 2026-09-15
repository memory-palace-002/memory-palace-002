/** P7 LiveTranscript —— 聆听中的实时转写预览（SDK 具备该能力时展示） */
export function LiveTranscript({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="live-transcript" aria-live="polite">
      <span className="live-transcript__caret" aria-hidden="true" />
      <p className="live-transcript__text">{text}</p>
    </div>
  );
}
