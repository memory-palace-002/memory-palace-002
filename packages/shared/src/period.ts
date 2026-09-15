import type { PeriodType } from './types';

/** period_key 生成：monthly -> 2026-09 / quarterly -> 2026-Q3 / yearly -> 2026 */
export function buildPeriodKey(type: PeriodType, d: Date = new Date()): string {
  const y = d.getFullYear();
  if (type === 'monthly') {
    return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (type === 'quarterly') {
    return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  }
  return String(y);
}

export function isValidPeriodKey(type: PeriodType, key: string): boolean {
  if (type === 'monthly') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (type === 'quarterly') return /^\d{4}-Q[1-4]$/.test(key);
  return /^\d{4}$/.test(key);
}

const LABELS: Record<PeriodType, string> = {
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
};

export function periodTypeLabel(type: PeriodType): string {
  return LABELS[type];
}

/** 把 period_key 显示成人话：2026-09 -> 2026 年 9 月 */
export function periodKeyLabel(type: PeriodType, key: string): string {
  if (type === 'monthly') {
    const [y, m] = key.split('-');
    return `${y} 年 ${Number(m)} 月`;
  }
  if (type === 'quarterly') {
    const [y, q] = key.split('-');
    return `${y} 年 ${q}`;
  }
  return `${key} 年`;
}
