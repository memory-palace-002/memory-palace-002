/** §4.4 PaperCard —— 纸亮白卡片，可配胶带装饰条 */
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  tape?: boolean | 'clay';
  tapeRight?: boolean;
  children?: ReactNode;
}

export function PaperCard({
  interactive,
  tape,
  tapeRight,
  className,
  children,
  ...rest
}: CardProps) {
  const cls = ['paper', interactive ? 'paper--interactive' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} {...rest}>
      {tape ? (
        <span
          className={[
            'tape',
            tape === 'clay' ? 'tape--clay' : '',
            tapeRight ? 'tape--right' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
      {children}
    </div>
  );
}
