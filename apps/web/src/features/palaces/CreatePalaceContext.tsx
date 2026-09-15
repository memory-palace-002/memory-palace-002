/**
 * 「+」全局入口 —— 新建公共宫殿 / 用邀请码加入
 * 由 NavBar(桌面) 与 TabBar(移动) 共用同一份实现，避免两处各写一遍。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { palaceApi } from '../../api/palaces';
import { useToast } from '../../app/ToastContext';

type Mode = 'create' | 'join';

interface Ctx {
  openCreate: (mode?: Mode) => void;
}

const CreatePalaceCtx = createContext<Ctx>({ openCreate: () => {} });

export function useCreatePalace(): Ctx {
  return useContext(CreatePalaceCtx);
}

export function CreatePalaceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { success, reportError } = useToast();

  const close = useCallback(() => {
    setMode(null);
    setName('');
    setCode('');
    setError(null);
    setSaving(false);
  }, []);

  const openCreate = useCallback((next: Mode = 'create') => {
    setMode(next);
    setError(null);
  }, []);

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('给这座宫殿起个名字吧');
      return;
    }
    setSaving(true);
    try {
      const palace = await palaceApi.create({ name: trimmed });
      success('宫殿建好了，开始放东西吧');
      close();
      navigate(`/palaces/${palace.id}/cabinets`);
    } catch (e) {
      setError((e as Error)?.message ?? '没能创建成功，再试一次');
      reportError(e);
    } finally {
      setSaving(false);
    }
  };

  const submitJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      setError('邀请码是 8 位字母数字');
      return;
    }
    setSaving(true);
    try {
      const { palace } = await palaceApi.join({ code: trimmed });
      success(`已加入《${palace.name}》`);
      close();
      navigate(`/palaces/${palace.id}/cabinets`);
    } catch (e) {
      reportError(e);
      setError(null);
    } finally {
      setSaving(false);
    }
  };

  const value = useMemo(() => ({ openCreate }), [openCreate]);

  return (
    <CreatePalaceCtx.Provider value={value}>
      {children}
      <Sheet
        open={mode !== null}
        onClose={close}
        title={mode === 'join' ? '用邀请码加入宫殿' : '新建一座公共宫殿'}
        width={440}
      >
        {mode === 'join' ? (
          <Field
            label="邀请码"
            hint="向宫殿成员要 8 位邀请码，输入后即可加入"
            error={error ?? undefined}
          >
            <Input
              className="input--center"
              value={code}
              maxLength={8}
              placeholder="XXXXXXXX"
              autoCapitalize="characters"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
            />
          </Field>
        ) : (
          <Field
            label="宫殿名字"
            hint="可以是一个地方、一段日子，或一群人"
            error={error ?? undefined}
          >
            <Input
              value={name}
              maxLength={30}
              placeholder="比如：老屋的记忆"
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </Field>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <Button block loading={saving} onClick={mode === 'join' ? submitJoin : submitCreate}>
            {mode === 'join' ? '加入宫殿' : '创建宫殿'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setMode(mode === 'join' ? 'create' : 'join');
            }}
          >
            {mode === 'join' ? '我要新建一座宫殿' : '我用邀请码加入别人的宫殿'}
          </Button>
        </div>
      </Sheet>
    </CreatePalaceCtx.Provider>
  );
}
