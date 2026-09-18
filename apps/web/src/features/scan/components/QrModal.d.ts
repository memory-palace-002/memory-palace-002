import type * as React from "react"
import type { ScanUrlScope } from "../api/scanAssetService"

/** QrModal.jsx 的类型声明（JSX 文件不参与 tsc 编译，仅提供导入类型） */

export interface QrModalProps {
  /** 二维码内容：手机端拍摄页地址 */
  scanUrl: string
  /** 当前扫码会话 ID */
  sessionId: string
  /**
   * scanUrl 的可达范围。loopback 时二维码手机必然打不开，弹窗会给出明确提示；
   * public 时不显示提示。
   */
  scanUrlScope?: ScanUrlScope
  onClose: () => void
}

declare const QrModal: React.FC<QrModalProps>

export default QrModal
