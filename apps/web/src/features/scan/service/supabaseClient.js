/**
 * Supabase 客户端 · scan 模块内部使用
 * feature-scan-cross-device
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 是否已配置云端。集成改动：对外暴露，供宿主 UI 判断是否提示"未配置"，
 * 避免用户点了扫码却只在上传时收到一句难懂的报错。
 */
export const isScanConfigured = Boolean(url && anonKey)

if (!isScanConfigured) {
  // 提供清晰的配置指引，避免运行时才报难以定位的错误
  console.warn(
    '[scan-module] 缺少 Supabase 环境变量。请复制 apps/web/.env.example 为 .env.local，' +
      '填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重启 dev server。'
  )
}

export const supabase = createClient(
  url || 'http://placeholder.invalid',
  anonKey || 'placeholder-key'
)

// Storage 桶名与数据表名（与 docs/supabase-setup.sql 保持一致）
export const STORAGE_BUCKET = 'scan-assets'
export const ASSETS_TABLE = 'scan_assets'
