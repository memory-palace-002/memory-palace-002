/**
 * §4.4 BottomSheet / Modal —— 双端两形态
 * 手机（<768px）：底部抽屉；桌面（≥768px）：居中模态（保留纸感样式）
 */
import { useEffect, type ReactNode } from 'react';
import './Sheet.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 点击遮罩是否关闭 */
  dismissible?: boolean;
  /** 桌面端宽度 */
  width?: number;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  width = 480,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true">
      <div
        className="sheet-mask"
        onClick={() => {
          if (dismissible) onClose();
        }}
      />
      <div className="sheet-panel" style={{ ['--sheet-w' as string]: `${width}px` }}>
        <div className="sheet-grip" aria-hidden="true" />
        {title ? <div className="sheet-title">{title}</div> : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/** 危险操作二次确认（删除成员 / 删除宫殿 / 退出的统一交互） */
export function ConfirmSheet({
  open,
  title,
  desc,
  confirmText = '确认删除',
  danger = true,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn--secondary btn--block" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button
            className={`btn btn--block ${danger ? 'btn--danger-solid' : 'btn--primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {confirmText}
          </button>
        </div>
      }
    >
      {desc ? <div className="muted">{desc}</div> : null}
    </Sheet>
  );
}
