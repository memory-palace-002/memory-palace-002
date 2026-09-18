/**
 * 手机端专属拍摄页 · scan 模块内部页面
 * feature-scan-cross-device
 *
 * 路由：/scan?session=<sessionId>
 * 流程：getUserMedia 调起后置摄像头 -> 抓拍 -> AI 抠图 + 插画滤镜 -> 直传 Supabase
 * 注意：getUserMedia 需要 HTTPS 或 localhost，请通过二维码里的公网/HTTPS 地址访问。
 *
 * 集成改动：
 * - 类名作用域化（scan- 前缀）+ 显式引入 ../scan.css
 * - 外层加 .scan-inner 容器（主项目 #root 有限宽/居中样式，页面需自己收窄）
 * - 缺少 Supabase 环境变量时给出明确提示，而不是等上传时才报难懂的错
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadScanAsset } from '../api/scanAssetService.js'
import { captureFrame } from '../service/assetProcessor.js'
import '../scan.css'

/* 环境变量缺失时，连拍摄都不必开始——直接指引去配置，避免白跑一趟 */
const CONFIGURED = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
)

export default function ScanPage() {
  const sessionId = new URLSearchParams(window.location.search).get('session')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraError, setCameraError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [statusText, setStatusText] = useState('') // 处理阶段提示（AI 模型加载/推理/上传）
  const [uploaded, setUploaded] = useState([]) // { id, assetUrl }
  const [error, setError] = useState('')

  // 启动摄像头
  useEffect(() => {
    if (!sessionId) {
      setCameraError('链接无效：缺少扫描会话标识，请重新用电脑端生成的二维码扫码。')
      return
    }
    if (!CONFIGURED) return
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1440 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCameraError(
            `摄像头无法启动（${err.name}）。请确认：1) 页面为 HTTPS；2) 已授权摄像头权限。`
          )
        }
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [sessionId])

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || uploading) return
    setUploading(true)
    setStatusText('准备处理…')
    setError('')
    try {
      const photo = await captureFrame(videoRef.current)
      const { id, assetUrl } = await uploadScanAsset(sessionId, photo, '手机拍摄', (p) => {
        if (p.phase === 'loading') {
          setStatusText(`AI 模型加载中 ${Math.round(p.progress ?? 0)}%（首次较慢，之后秒抠）`)
        } else if (p.phase === 'processing') {
          setStatusText('AI 抠图处理中…')
        } else if (p.phase === 'level0') {
          setStatusText('AI 模型不可用，已降级为基础模式…')
        } else if (p.phase === 'uploading') {
          setStatusText('上传中…')
        }
      })
      setUploaded((prev) => [...prev, { id, assetUrl }])
      setStatusText('')
    } catch (err) {
      setError(err.message || '上传失败，请重试')
      setStatusText('')
    } finally {
      setUploading(false)
    }
  }, [sessionId, uploading])

  if (!CONFIGURED) {
    return (
      <div className="scan-page">
        <div className="scan-inner">
          <div className="scan-card">
            <h2>还没配置云端</h2>
            <p>
              这个拍摄页需要 Supabase 才能把照片送回电脑端。请在
              <code>apps/web/.env.local</code> 里填好：
            </p>
            <p>
              VITE_SUPABASE_URL=…
              <br />
              VITE_SUPABASE_ANON_KEY=…
            </p>
            <p>填完重启 dev server 即可。电脑端的二维码仍可正常生成。</p>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="scan-page">
        <div className="scan-inner">
          <div className="scan-card">
            <h2>链接无效</h2>
            <p>{cameraError || '请重新扫码'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scan-page">
      <div className="scan-inner">
        <header className="scan-header">
          <h2>物品拍摄</h2>
          <p>可从多个角度各拍一张，拍完会自动上传</p>
        </header>

        {cameraError ? (
          <div className="scan-card">
            <p>{cameraError}</p>
          </div>
        ) : (
          <>
            <div className="camera-box">
              <video ref={videoRef} autoPlay playsInline muted />
            </div>

            <button
              className="scan-btn scan-btn-primary scan-btn-capture"
              onClick={handleCapture}
              disabled={uploading}
            >
              {uploading ? '处理上传中…' : '拍摄并上传'}
            </button>

            {uploading && statusText && <p className="scan-status">{statusText}</p>}

            {error && <p className="scan-error">{error}</p>}

            {uploaded.length > 0 && (
              <section className="scan-result">
                <h3>已上传 {uploaded.length} 张</h3>
                <div className="result-grid">
                  {uploaded.map((item) => (
                    <img key={item.id} src={item.assetUrl} alt="2.5D 资产" />
                  ))}
                </div>
                <p className="scan-done">电脑端房间已同步，可以回去摆放了 ✔</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
