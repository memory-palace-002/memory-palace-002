/**
 * scanAssetService.js 的类型声明
 * （JS 文件不参与 tsc 编译，仅提供导入类型）
 */

export interface ScanAsset {
  id: string
  asset_url: string
  label: string
  created_at?: string
}

export interface ScanProgress {
  phase: "loading" | "processing" | "level0" | "uploading"
  progress?: number
}

export declare function createScanSession(): string

/** 地址可达范围：loopback=只有电脑自己可达 / lan=仅同 WiFi 可达 / public=公网可达 */
export type ScanUrlScope = "loopback" | "lan" | "public"

/** 手机端拍摄页所在的 origin（优先 VITE_SCAN_PUBLIC_ORIGIN，否则当前页面 origin） */
export declare function resolveScanOrigin(): string

/** 判断某个 origin 的可达范围，用于弹窗提示 */
export declare function classifyScanOrigin(origin: string): ScanUrlScope

export declare function buildScanUrl(sessionId: string): string

export declare function uploadScanAsset(
  sessionId: string,
  photo: File | Blob,
  label?: string,
  onProgress?: (p: ScanProgress) => void
): Promise<{ id: string; assetUrl: string }>

export declare function getAssetsBySession(sessionId: string): Promise<ScanAsset[]>

export declare function onAssetReady(
  sessionId: string,
  onAsset: (asset: { id: string; asset_url: string; label: string }) => void
): () => void
