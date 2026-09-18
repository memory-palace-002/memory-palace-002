/**
 * 2.5D 资产处理器 · feature-scan-cross-device
 *
 * Level 1（当前）：浏览器端 AI 抠图（U²-Netp，见 matting.js）→ 透明底主体
 *   → WebP 输出（已按需求去除椭圆投影）
 * Level 0（降级兜底）：模型加载/推理失败时，退回原有的居中裁剪方案，
 *   功能不中断、不白屏。
 *
 * 对外契约不变：processToAsset(file[, onProgress]) → Promise<Blob>
 */

import { removeImageBackground } from './matting.js'
import { applyCartoonEffect } from './cartoonFilter.js'

const OUTPUT_SIZE = 640
const WEBP_QUALITY = 0.85 // 640x640 照片 WebP 约 60-150KB，国内直连上传稳定

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 计算透明图的非透明区域包围盒（用于把主体贴到投影正上方）
 */
function alphaBoundingBox(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // 全透明，视为抠图失败
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * 绘制底部多层椭圆投影（已按需求停用，保留函数以备后续开启）
 */
// function drawGroundShadow(ctx, centerX, groundY, bodyW) {
//   const shadowLayers = [
//     { rx: bodyW * 0.52, ry: bodyW * 0.11, alpha: 0.3, blur: 30 },
//     { rx: bodyW * 0.44, ry: bodyW * 0.085, alpha: 0.35, blur: 18 },
//     { rx: bodyW * 0.36, ry: bodyW * 0.06, alpha: 0.4, blur: 8 },
//   ]
//   for (const layer of shadowLayers) {
//     ctx.save()
//     ctx.filter = `blur(${layer.blur}px)`
//     ctx.globalAlpha = layer.alpha
//     ctx.fillStyle = '#000000'
//     ctx.beginPath()
//     ctx.ellipse(centerX, groundY - bodyW * 0.02, layer.rx, layer.ry, 0, 0, Math.PI * 2)
//     ctx.fill()
//     ctx.restore()
//   }
// }

/**
 * Level 0 降级方案：居中方形裁剪 + 椭圆投影
 */
async function processLevel0(file) {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')

  // 1. 居中方形裁剪
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2

  // 2. 主体略上移收窄（阴影已按需求去除）
  const bodyW = OUTPUT_SIZE * 0.78
  const bodyH = OUTPUT_SIZE * 0.7
  const bodyX = (OUTPUT_SIZE - bodyW) / 2
  const bodyY = OUTPUT_SIZE * 0.08

  // 3. 绘制主体贴图（卡通化 + 失败回退）
  let stage = document.createElement('canvas')
  stage.width = Math.round(bodyW)
  stage.height = Math.round(bodyH)
  stage.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, stage.width, stage.height)
  try {
    stage = applyCartoonEffect(stage)
  } catch (filterErr) {
    console.warn('[scan] 卡通滤镜失败，回退原图：', filterErr?.message || filterErr)
  }
  ctx.drawImage(stage, bodyX, bodyY)

  return await exportCanvas(canvas)
}

/**
 * 画布导出：优先 WebP（体积小、支持透明通道，国内弱网上传成功率高），回退 PNG
 */
function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) return resolve(blob)
        canvas.toBlob(
          (pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error('画布导出失败'))),
          'image/png'
        )
      },
      'image/webp',
      WEBP_QUALITY
    )
  })
}

/**
 * 将拍摄的照片处理为 2.5D 贴图
 * Level 1：AI 抠图（透明底）+ 椭圆投影；任何失败自动降级 Level 0
 *
 * @param {File|Blob} file 手机拍摄的照片
 * @param {(p:{phase:'loading'|'processing'|'level0', progress?:number})=>void} [onProgress]
 *        phase: 'loading' 模型加载(progress 0-100) / 'processing' AI 推理中 / 'level0' 已降级
 * @returns {Promise<Blob>} 透明底贴图（含投影）
 */
export async function processToAsset(file, onProgress) {
  try {
    // ---- Level 1：AI 抠图 ----
    const { dataUrl } = await removeImageBackground(file, onProgress)
    const cutout = await loadImage(dataUrl)
    const bbox = alphaBoundingBox(cutout)
    if (!bbox) throw new Error('抠图结果为空')

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')

    // 主体按包围盒等比缩放：宽度约占 78%，底部贴地
    const bodyW = OUTPUT_SIZE * 0.78
    const scale = Math.min(bodyW / bbox.w, (OUTPUT_SIZE * 0.84) / bbox.h)
    const drawW = bbox.w * scale
    const drawH = bbox.h * scale
    const groundY = OUTPUT_SIZE * 0.9
    const drawX = (OUTPUT_SIZE - drawW) / 2
    const drawY = groundY - drawH

    // 卡通化：先按摆放尺寸渲染到中间画布，再做色块化+描边；失败则回退原图
    let stage = document.createElement('canvas')
    stage.width = Math.max(1, Math.round(drawW))
    stage.height = Math.max(1, Math.round(drawH))
    stage.getContext('2d').drawImage(
      cutout,
      bbox.x, bbox.y, bbox.w, bbox.h,
      0, 0, stage.width, stage.height
    )
    try {
      stage = applyCartoonEffect(stage)
    } catch (filterErr) {
      console.warn('[scan] 卡通滤镜失败，回退原图：', filterErr?.message || filterErr)
    }

    // 绘制主体（阴影已按需求去除）
    ctx.drawImage(stage, drawX, drawY)

    return await exportCanvas(canvas)
  } catch (err) {
    // ---- 死命令：失败兜底，绝不报错白屏 ----
    console.warn('[scan] AI 抠图失败，已降级 Level 0：', err?.message || err)
    onProgress?.({ phase: 'level0' })
    return await processLevel0(file)
  }
}

/**
 * 从 video 帧抓拍一张照片（供手机端拍摄页使用）
 * @param {HTMLVideoElement} video
 * @returns {Promise<Blob>} JPEG 照片
 */
export async function captureFrame(video) {
  // 限制抓拍分辨率上限 1280，够用且降低后续 canvas 处理与上传体积
  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0)
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('抓拍失败'))),
      'image/jpeg',
      0.92
    )
  })
}
