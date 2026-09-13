// P1 登录页：手机号 + 短信验证码（开发环境 mock 验证码 123456）；微信登录预留
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const loginWithSms = useAuthStore((s) => s.loginWithSms);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [mockCode, setMockCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, []);

  async function handleSendCode() {
    if (countdown > 0) return;
    if (!/^1\d{10}$/.test(phone)) {
      toast('请输入正确的 11 位手机号', 'error');
      return;
    }
    try {
      const data = await api.post('/auth/sms/send', { phone, scene: 'login' });
      setCountdown(data.cooldown_seconds || 60);
      if (data.mock_code) setMockCode(data.mock_code);
      timerRef.current = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1 && timerRef.current) window.clearInterval(timerRef.current);
          return c - 1;
        });
      }, 1000);
      toast('验证码已发送');
    } catch (e: any) {
      toast(e.message || '发送失败', 'error');
    }
  }

  async function handleLogin() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { isNewUser } = await loginWithSms(phone, code);
      toast(isNewUser ? '注册成功，欢迎来到回忆宫殿' : '登录成功');
      navigate('/me', { replace: true });
    } catch (e: any) {
      toast(e.message || '登录失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px', maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-corner.png"
            alt="小角落"
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 20, mixBlendMode: 'multiply', marginBottom: 8 }}
          />
          <div className="page-title">小角落</div>
          <div className="hand-font hint" style={{ marginTop: 8, fontSize: 15 }}>
            留一个角落，装下属于我们的时间
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="input"
            type="tel"
            maxLength={11}
            placeholder="手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              type="tel"
              maxLength={6}
              placeholder="验证码"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              className="btn btn-secondary"
              style={{ width: 118, flexShrink: 0, fontSize: 14, color: countdown > 0 ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}
              onClick={handleSendCode}
              disabled={countdown > 0}
            >
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </button>
          </div>
          {mockCode && (
            <div className="hint" style={{ textAlign: 'center' }}>
              🔧 开发环境 mock 验证码：<b>{mockCode}</b>（短信服务备案完成后自动切换为真实短信）
            </div>
          )}
          <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={submitting} onClick={handleLogin}>
            登录 / 注册
          </button>
          <button className="btn btn-secondary" onClick={() => toast('微信登录为可选项，待开放平台资质就绪后开放', 'info')}>
            用微信登录（即将开放）
          </button>
          <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
            新手机号将自动注册，并为你创建一座默认个人宫殿
          </div>
        </div>
      </div>
    </div>
  );
}
