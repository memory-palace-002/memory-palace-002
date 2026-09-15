/** Field / Input / Textarea —— 44 高、圆角 12（§4.3 P1 登录页同规格，全站复用） */
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="field">
      {label ? <span className="field__label">{label}</span> : null}
      {children}
      {error ? (
        <span className="field__hint field__hint--error">{error}</span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['input', className ?? ''].filter(Boolean).join(' ')} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={['textarea', className ?? ''].filter(Boolean).join(' ')} {...rest} />
  );
}
