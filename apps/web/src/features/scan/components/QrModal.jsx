/**
 * 二维码弹窗 · scan 模块内部组件
 * feature-scan-cross-device
 *
 * 集成改动：
 * - 类名加 scan- 前缀、通用按钮改 .scan-btn-*，避免污染主项目全局样式
 * - 显式引入 ../scan.css，模块样式随组件走，不依赖宿主引入
 * - 显示二维码实际指向的地址；地址手机打不开时（loopback / 局域网）明确提示，
 *   而不是发一个必然失败的二维码出去
 */
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import '../scan.css'

export default function QrModal({ scanUrl, sessionId, scanUrlScope = 'public', onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(scanUrl, {
      width: 260,
      margin: 2,
      color: { dark: '#3d3226', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [scanUrl])

  const notice =
    scanUrlScope === 'loopback' ? (
      <>
        <strong>这个二维码手机一定打不开。</strong>
        里面是电脑的本机地址（localhost），而手机上的 localhost 指手机自己 —— 所以会报
        ERR_CONNECTION_REFUSED，跟 WiFi 无关。
        <br />
        改法：在 <code>apps/web/.env.local</code> 里设置{' '}
        <code>VITE_SCAN_PUBLIC_ORIGIN</code> 为已发布的公网地址，然后重启。
      </>
    ) : scanUrlScope === 'lan' ? (
      <>
        <strong>这是局域网地址。</strong>
        只有手机和电脑连同一个 WiFi 时才能打开。
        <br />
        想用 4G/5G 也能扫，请把 <code>VITE_SCAN_PUBLIC_ORIGIN</code> 设为公网地址。
      </>
    ) : null

  return (
    <div className="scan-qr-overlay" onClick={onClose}>
      <div className="scan-qr-card" onClick={(e) => e.stopPropagation()}>
        <h3>用手机扫码拍摄物品</h3>
        {qrDataUrl ? (
          <img className="scan-qr-img" src={qrDataUrl} alt="拍摄页二维码" />
        ) : (
          <div className="scan-qr-loading">二维码生成中…</div>
        )}
        {notice && <p className={`scan-qr-notice scan-qr-notice-${scanUrlScope}`}>{notice}</p>}
        <p className="scan-qr-url" title={scanUrl}>
          {scanUrl}
        </p>
        <p className="scan-qr-session">会话 ID：{sessionId.slice(0, 8)}…</p>
        <p className="scan-qr-hint">
          手机扫码后会打开专属拍摄页，拍好的照片会自动出现在房间里。
          <br />
          （保持此页面打开即可实时接收）
        </p>
        <button className="scan-btn scan-btn-secondary" onClick={onClose}>
          继续等待上传
        </button>
      </div>
    </div>
  )
}
