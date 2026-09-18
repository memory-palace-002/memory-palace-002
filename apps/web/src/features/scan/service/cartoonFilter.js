/**
 * cartoonFilter.js —— 柔和插画滤镜 v2（纯 Canvas 像素处理，零依赖）
 * feature-integrate-scan
 *
 * 相比 v1（重漫画滤镜）的调整（对齐参考图的柔和 2.5D 插画感）：
 * - 移除亮度 Sobel 黑边（v1 黑边生硬的元凶）
 * - alpha 轮廓只保留一层 1px 暖棕细线（55% 透明度），柔和不抢眼
 * - 量化从 8 级放宽到 24 级，且量化结果与原图 50/50 混合 → 保留平滑过渡
 * - 提亮 + 偏暖 + 轻提饱和 → 温暖可爱的质感
 * - 新增超时保护：处理超过 SOFT_FILTER_TIMEOUT_MS 抛错，由调用方回退纯抠图
 *
 * 性能：640x640 单遍处理，手机端 <100ms，无模型无网络。
 */

const QUANT_LEVELS = 24 // 轻度量化（只压照片噪点，不毁渐变）
const QUANT_BLEND = 0.5 // 量化结果与原图的混合比（越大越"扁平"）
const OUTLINE_THRESHOLD = 48 // alpha 轮廓边缘阈值（只勾物体外轮廓）
const OUTLINE_BLEND = 0.55 // 轮廓线混合强度（<1 保留柔和感）
const OUTLINE_RGB = [138, 109, 92] // 暖棕描边（替代 v1 的深墨蓝黑边）
const SATURATION_BOOST = 1.1
const BRIGHTNESS = 1.08
const WARM_R = 6 // 色温偏暖
const WARM_B = -4
const SOFT_FILTER_TIMEOUT_MS = 3000 // 超时兜底：超时抛错回退纯抠图

/** 可分离盒式模糊（压噪，防止量化后出现噪点斑块） */
function boxBlur(src, width, height, radius) {
  const tmp = new Float32Array(src.length)
  const dst = new Float32Array(src.length)
  const win = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        sum += src[y * width + xx]
      }
      tmp[y * width + x] = sum / win
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        sum += tmp[yy * width + x]
      }
      dst[y * width + x] = sum / win
    }
  }
  return dst
}

/** Sobel 边缘强度图 */
function sobel(src, width, height) {
  const out = new Float32Array(src.length)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const tl = src[i - width - 1], t = src[i - width], tr = src[i - width + 1]
      const l = src[i - 1], r = src[i + 1]
      const bl = src[i + width - 1], b = src[i + width], br = src[i + width + 1]
      const gx = tl + 2 * l + bl - tr - 2 * r - br
      const gy = tl + 2 * t + tr - bl - 2 * b - br
      out[i] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return out
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/**
 * 对含透明通道的画布应用柔和插画滤镜
 * @param {HTMLCanvasElement} canvas 输入画布（只读，不改原画布）
 * @returns {HTMLCanvasElement} 柔化后的新画布
 * @throws {Error} 处理超时（调用方应回退纯抠图）
 */
export function applyCartoonEffect(canvas) {
  const start = performance.now()
  const width = canvas.width
  const height = canvas.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const n = width * height

  // alpha 轮廓边缘（用于柔和勾边；不再做亮度黑边）
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3]
  const alphaEdge = sobel(alpha, width, height)

  const step = 255 / (QUANT_LEVELS - 1)
  const out = new ImageData(width, height)
  const od = out.data

  for (let i = 0; i < n; i++) {
    // 超时保护：每 65536 像素检查一次，超时抛错回退
    if ((i & 0xffff) === 0 && i > 0 && performance.now() - start > SOFT_FILTER_TIMEOUT_MS) {
      throw new Error('soft-filter-timeout')
    }

    const o = i * 4
    const a = data[o + 3]
    if (a === 0) continue

    // 1. 轻度量化 + 与原图 50/50 混合（保留平滑过渡，只压噪点细节）
    let r = data[o] * (1 - QUANT_BLEND) + Math.round(Math.round(data[o] / step) * step) * QUANT_BLEND
    let g = data[o + 1] * (1 - QUANT_BLEND) + Math.round(Math.round(data[o + 1] / step) * step) * QUANT_BLEND
    let b = data[o + 2] * (1 - QUANT_BLEND) + Math.round(Math.round(data[o + 2] / step) * step) * QUANT_BLEND

    // 2. 提亮 + 偏暖（温暖可爱质感）
    r = r * BRIGHTNESS + WARM_R
    g = g * BRIGHTNESS
    b = b * BRIGHTNESS + WARM_B

    // 3. 轻提饱和
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    r = y + (r - y) * SATURATION_BOOST
    g = y + (g - y) * SATURATION_BOOST
    b = y + (b - y) * SATURATION_BOOST

    // 4. alpha 外轮廓暖棕细线（柔和不抢眼；无亮度黑边）
    if (alphaEdge[i] > OUTLINE_THRESHOLD) {
      const k = OUTLINE_BLEND
      r = r * (1 - k) + OUTLINE_RGB[0] * k
      g = g * (1 - k) + OUTLINE_RGB[1] * k
      b = b * (1 - k) + OUTLINE_RGB[2] * k
    }

    od[o] = clamp255(r)
    od[o + 1] = clamp255(g)
    od[o + 2] = clamp255(b)
    od[o + 3] = a
  }

  const outCanvas = document.createElement('canvas')
  outCanvas.width = width
  outCanvas.height = height
  outCanvas.getContext('2d').putImageData(out, 0, 0)
  return outCanvas
}
