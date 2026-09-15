/**
 * Toast + GlobalErrorHandler（§4.4）
 * GlobalErrorHandler 职责：错误码 → Toast 文案映射，页面只需 throw/catch 后调用 reportError。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, toUserMessage } from '../api/http';
import '../components/ui/Toast.css';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
}

interface ToastContextValue {
  show: (message: string, tone?: ToastItem['tone']) => void;
  success: (message: string) => void;
  /** GlobalErrorHandler 入口：统一把异常翻译成用户可读 Toast */
  reportError: (err: unknown, fallback?: string) => ApiError | null;
}

const ToastContext = createContext<ToastContextValue>({
  show: () => {},
  success: () => {},
  reportError: () => null,
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, tone: ToastItem['tone'] = 'default') => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      const timer = window.setTimeout(() => dismiss(id), 2600);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback((message: string) => show(message, 'success'), [show]);

  const reportError = useCallback(
    (err: unknown, fallback?: string) => {
      const apiErr = err instanceof ApiError ? err : null;
      show(apiErr || fallback ? toUserMessage(apiErr ?? new Error(fallback ?? '')) : toUserMessage(err), 'error');
      return apiErr;
    },
    [show],
  );

  const value = useMemo(() => ({ show, success, reportError }), [show, success, reportError]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-layer" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
