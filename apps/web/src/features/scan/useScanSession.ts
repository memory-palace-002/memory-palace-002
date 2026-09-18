/**
 * useScanSession —— 跨设备扫描模块与 3D 房间之间的唯一桥接层
 *
 * 职责边界（刻意收在这里，宿主和 scan 模块互不渗透）：
 *   - 宿主只认识本 Hook 的返回值，不碰 supabaseClient / assetProcessor / ScanPage
 *   - scan 模块对外只暴露 api/scanAssetService.js，不认识房间、贴片、hp 接口
 *
 * 一次扫码会话的完整链路：
 *   start() 建会话 → 弹二维码 → 手机端拍摄上传 Supabase →
 *   Realtime 推回电脑端 → 拉图裁留白 → 回调 onAsset() → 宿主落成贴片
 *
 * 关于「补拉」：订阅是在 render 之后的 effect 里挂上的，手机若在二维码刚出现时
 * 就上传，这条 INSERT 可能早于订阅建立。所以 start 时额外用 getAssetsBySession
 * 拉一次全量兜底；两条路都可能拿到同一个 id，用 seen 集合去重。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildScanUrl,
  classifyScanOrigin,
  createScanSession,
  getAssetsBySession,
  onAssetReady,
  resolveScanOrigin,
  type ScanUrlScope,
} from './api/scanAssetService'
import { isScanConfigured } from './service/supabaseClient'
import { trimAssetPadding, type StickerImage } from './trimAsset'

/** 资产落地回调：src 为云端原图（回忆卡片展示用），img 为裁好留白的贴片纹理 */
export type ScanAssetSink = (src: string, img: StickerImage) => void

export interface ScanSessionApi {
  /** 云端是否已配置（缺 .env.local 时为 false，按钮应给出提示而不是弹死二维码） */
  configured: boolean
  sessionId: string
  scanUrl: string
  /**
   * scanUrl 的可达范围。loopback 时二维码是无效的（手机上 localhost 指手机自己），
   * UI 必须明确提示，否则用户只会看到「扫了打不开」。
   */
  scanUrlScope: ScanUrlScope
  qrOpen: boolean
  /** 一行状态文案，直接显示在物品面板里 */
  status: string
  error: string
  /** 本次会话已收到的资产数 */
  received: number
  start: () => void
  closeQr: () => void
}

export function useScanSession(onAsset: ScanAssetSink): ScanSessionApi {
  const [sessionId, setSessionId] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [received, setReceived] = useState(0)

  /** 已处理过的资产 id，防「补拉 + Realtime」重复入房 */
  const seenRef = useRef<Set<string>>(new Set())
  /** 回调放进 ref：避免调用方每次渲染换函数导致重新订阅 */
  const sinkRef = useRef(onAsset)
  useEffect(() => {
    sinkRef.current = onAsset
  }, [onAsset])

  const ingest = useCallback(async (asset: { id: string; asset_url: string; label?: string }) => {
    if (!asset?.asset_url || seenRef.current.has(asset.id)) return
    seenRef.current.add(asset.id)
    try {
      const img = await trimAssetPadding(asset.asset_url)
      sinkRef.current(asset.asset_url, img)
      setReceived((n) => n + 1)
      setStatus(`已把「${asset.label || '新物品'}」放进房间`)
      setError('')
    } catch (e) {
      /* 去重集合要放行，否则用户重试也没机会成功 */
      seenRef.current.delete(asset.id)
      setError(e instanceof Error ? e.message : '资产入房失败')
    }
  }, [])

  /* 会话建立后：补拉一次已有资产 + 订阅后续新资产 */
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    getAssetsBySession(sessionId)
      .then((list) => {
        if (cancelled) return
        list.forEach((a) => void ingest(a))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '资产读取失败')
      })

    const unsubscribe = onAssetReady(sessionId, (asset) => {
      if (!cancelled) void ingest(asset)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [sessionId, ingest])

  const start = useCallback(() => {
    setError('')
    if (!isScanConfigured) {
      setStatus('')
      setError('还没配置云端：请在 apps/web/.env.local 填入 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY 后重启')
      return
    }
    const id = createScanSession()
    seenRef.current = new Set()
    setReceived(0)
    setSessionId(id)
    setStatus('等待手机上传…')
    setQrOpen(true)
  }, [])

  const closeQr = useCallback(() => setQrOpen(false), [])

  return {
    configured: isScanConfigured,
    sessionId,
    scanUrl: sessionId ? buildScanUrl(sessionId) : '',
    scanUrlScope: classifyScanOrigin(resolveScanOrigin()),
    qrOpen,
    status,
    error,
    received,
    start,
    closeQr,
  }
}
