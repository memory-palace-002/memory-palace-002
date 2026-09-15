/** §4.4 其它通用原子组件：Tabs / Avatar / Badge / EmptyState / PageLoading / SectionTitle / PageHeader */
import type { ReactNode } from 'react';
import { IconBack } from './Icons';

/* ------------------------------- Tabs ------------------------------- */

export interface TabItem<T extends string> {
  key: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  full,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  full?: boolean;
}) {
  return (
    <div className={['tabs', full ? 'tabs--full' : ''].filter(Boolean).join(' ')} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          className="tabs__item"
          aria-selected={it.key === value}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Avatar ------------------------------ */

export function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={name} /> : (name || '?').slice(0, 1)}
    </span>
  );
}

/* ------------------------------- Badge ------------------------------ */

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'clay' | 'sage' | 'gold' | 'ghost';
}) {
  return (
    <span className={['badge', tone !== 'default' ? `badge--${tone}` : ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

/* ---------------------------- EmptyState ---------------------------- */

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {desc ? <div className="empty__desc">{desc}</div> : null}
      {action}
    </div>
  );
}

/* ---------------------------- PageLoading --------------------------- */

export function PageLoading({ text = '正在整理…' }: { text?: string }) {
  return (
    <div className="page-loading">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}

/* --------------------------- SectionTitle --------------------------- */

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="section-title">
      <span>{children}</span>
      {extra}
    </div>
  );
}

/* ----------------------------- Divider ------------------------------ */

export function Divider() {
  return <div className="divider" />;
}

/* ---------------------------- PageHeader ---------------------------- */

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="page-header">
      <span className="page-header__slot">
        {onBack ? (
          <button className="icon-btn" onClick={onBack} aria-label="返回">
            <IconBack />
          </button>
        ) : null}
      </span>
      <span className="page-header__title truncate">{title}</span>
      <span className="page-header__slot page-header__slot--right">{right}</span>
    </header>
  );
}
