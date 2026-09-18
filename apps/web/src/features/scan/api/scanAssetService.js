/**
 * scanAssetService —— scan 模块对外唯一 API
 * feature-scan-cross-device
 *
 * 模块隔离约定：
 * - 已有模块（房间背景 / 物品摆放）只允许 import 本文件，
 *   不得接触本模块内部的 supabaseClient / assetProcessor / 页面组件。
 * - 数据契约见 docs/supabase-setup.sql 的 scan_assets 表。
 */
import { supabase, STORAGE_BUCKET, ASSETS_TABLE } from '../service/supabaseClient.js'
import { processToAsset } from '../service/assetProcessor.js'

/** 生成一次扫码会话的唯一标识（电脑端调用） */
export function createScanSession() {
  return crypto.randomUUID()
}

/**
 * 手机端拍摄页所在的 origin
 *
 * 为什么单独抽出来：二维码是给「手机」扫的，而手机上的 localhost 指手机自己，
 * 必然 ERR_CONNECTION_REFUSED。所以本地开发时要把二维码指向已发布的公网站点
 * （VITE_SCAN_PUBLIC_ORIGIN）；部署到公网后它本身就是公网地址，无需配置。
 *
 * 效果：电脑端照样跑 localhost，手机走 4G/5G 也能打开拍摄页——两端连的是
 * 同一个 Supabase，靠 Realtime 同步，因此不要求手机和电脑在同一局域网。
 */
export function resolveScanOrigin() {
  const configured = (import.meta.env.VITE_SCAN_PUBLIC_ORIGIN || '').trim()
  if (configured) return configured.replace(/\/+$/, '')
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
}

/**
 * 地址的可达范围，用于在弹窗里给出准确提示，而不是生成一个必然打不开的二维码
 *   loopback —— 只有电脑自己打得开（localhost / 127.x / ::1），手机一定失败
 *   lan      —— 只在同一 WiFi 下打得开（192.168.x / 10.x / 172.16-31.x）
 *   public   —— 公网可达，手机用流量也能打开
 */
export function classifyScanOrigin(origin) {
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, '')
    if (!host || host.endsWith('.localhost')) return 'loopback'
    if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return 'loopback'
    if (/^127\./.test(host)) return 'loopback'
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return 'lan'
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'lan'
    return 'public'
  } catch {
    return 'loopback'
  }
}

/**
 * 构建手机端拍摄页地址（二维码内容）
 *
 * 集成改动：
 * - origin 走 resolveScanOrigin()，不再无条件用 window.location.origin
 * - 路径跟随 Vite 的 base 配置（import.meta.env.BASE_URL），
 *   不再硬编码 '/scan' —— 否则在 vite.standalone.config.ts（base: './'）
 *   或部署到子路径时，二维码会指向一个不存在的地址。
 */
export function buildScanUrl(sessionId) {
  const origin = resolveScanOrigin()
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  try {
    return new URL(`${path}scan?session=${encodeURIComponent(sessionId)}`, origin).href
  } catch {
    return `/scan?session=${encodeURIComponent(sessionId)}`
  }
}

/**
 * 手机端：处理照片并上传为 2.5D 资产（状态直接置 ready，触发电脑端 Realtime）
 * @param {string} sessionId 电脑端生成的会话 ID
 * @param {File|Blob} photo 拍摄的照片
 * @param {string} [label] 可选备注，如"正面"/"侧面"
 * @param {(p:{phase:'loading'|'processing'|'level0'|'uploading', progress?:number})=>void} [onProgress]
 *        可选进度回调（Level 1 新增，向后兼容，不传则行为与旧版完全一致）
 * @returns {Promise<{id: string, assetUrl: string}>}
 */
export async function uploadScanAsset(sessionId, photo, label = '', onProgress) {
  onProgress?.({ phase: 'processing', progress: 0 })
  const assetBlob = await processToAsset(photo, onProgress)
  onProgress?.({ phase: 'uploading' })
  const ext = assetBlob.type === 'image/webp' ? 'webp' : 'png'

  // 上传失败自动重试一次（国内网络偶发传输被重置）
  let uploadedPath = null
  let lastErr = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const path = `${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, assetBlob, { contentType: assetBlob.type, upsert: false })
    if (!upErr) {
      uploadedPath = path
      break
    }
    lastErr = upErr
    await new Promise((r) => setTimeout(r, 800 * attempt))
  }
  if (!uploadedPath) throw new Error(`图片上传失败: ${lastErr?.message || '未知错误'}`)

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadedPath)

  const { data, error } = await supabase
    .from(ASSETS_TABLE)
    .insert({
      session_id: sessionId,
      status: 'ready',
      asset_url: urlData.publicUrl,
      label,
    })
    .select('id, asset_url')
    .single()
  if (error) throw new Error(`资产记录写入失败: ${error.message}`)

  return { id: data.id, assetUrl: data.asset_url }
}

/**
 * 电脑端：拉取某个会话下所有已就绪的 2.5D 资产（页面刷新后恢复用）
 * @returns {Promise<Array<{id: string, asset_url: string, label: string, created_at: string}>>}
 */
export async function getAssetsBySession(sessionId) {
  const { data, error } = await supabase
    .from(ASSETS_TABLE)
    .select('id, asset_url, label, created_at')
    .eq('session_id', sessionId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`资产读取失败: ${error.message}`)
  return data || []
}

/**
 * 电脑端：实时订阅本会话的新资产（无需轮询，Supabase Realtime 推送）
 * @param {string} sessionId
 * @param {(asset: {id: string, asset_url: string, label: string}) => void} onAsset
 * @returns {() => void} 取消订阅函数
 */
export function onAssetReady(sessionId, onAsset) {
  const channel = supabase
    .channel(`scan-assets-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: ASSETS_TABLE,
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload.new?.status === 'ready' && payload.new.asset_url) {
          onAsset({
            id: payload.new.id,
            asset_url: payload.new.asset_url,
            label: payload.new.label || '',
          })
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
