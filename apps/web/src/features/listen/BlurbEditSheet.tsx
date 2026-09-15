/** P7 BlurbEditSheet —— 编辑抽屉，实时字数校验（80~250） */
import { useEffect, useState } from 'react';
import { LIMITS } from '@shared/index';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Field, Textarea } from '../../components/ui/Form';

export function BlurbEditSheet({
  open,
  initial = '',
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (content: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const len = value.trim().length;
  const tooShort = len > 0 && len < LIMITS.BLURB_MIN;
  const tooLong = len > LIMITS.BLURB_MAX;
  const valid = len >= LIMITS.BLURB_MIN && len <= LIMITS.BLURB_MAX;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="写下它的故事"
      width={560}
      footer={
        <Button block disabled={!valid} loading={loading} onClick={() => void onSubmit(value.trim())}>
          保存简介
        </Button>
      }
    >
      <Field
        label="简介"
        hint={`${LIMITS.BLURB_MIN}~${LIMITS.BLURB_MAX} 字，用第一人称「我」来讲`}
        error={tooShort ? `还差 ${LIMITS.BLURB_MIN - len} 字` : tooLong ? `超出 ${len - LIMITS.BLURB_MAX} 字` : undefined}
      >
        <Textarea
          value={value}
          autoFocus
          placeholder="它是怎么来的？你记得最清楚的是哪一刻？"
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <div className={`edit-counter ${tooLong || tooShort ? 'is-error' : ''}`}>
        {len} / {LIMITS.BLURB_MAX}
      </div>
    </Sheet>
  );
}
