/**
 * matting.js —— 浏览器端 AI 抠图（U²-Netp）
 * feature-scan-cross-device · Level 1
 *
 * 来源：队友提供的 AI-kit（src-reference/matting.ts + matting.js），本次集成做了适配：
 * - 推理库改用 npm 包 @huggingface/transformers（Vercel 云端安装，不走本地 libs/）
 * - 模型固定同源路径 /models/（Vite public 目录），仍强制本地模型、不请求 Hugging Face Hub
 * - 失败语义：所有异常向上抛出，由 assetProcessor.processToAsset 统一降级到 Level 0
 *
 *   模型    BritishWerewolf/U-2-Netp（U²-Net 轻量版，Apache-2.0，onnx 仅 4.4MB）
 *   推理    Transformers.js（WASM 后端），全程本地运行，图片不出设备
 */

import { AutoModel, env, RawImage, Tensor } from '@huggingface/transformers'

const MODEL_ID = 'BritishWerewolf/U-2-Netp'
const MODEL_BASE = '/models/' // Vite public/models 目录

/* 遮罩黑/白点：压缩 U²-Net 软遮罩的低置信度尾部，去掉残留背景色造成的灰边 */
const MATTE_BLACK_POINT = 0.12
const MATTE_WHITE_POINT = 0.78

let removerPromise = null

env.allowLocalModels = true
env.allowRemoteModels = false // 强制本地模型，避免联网请求 Hugging Face Hub
env.localModelPath = MODEL_BASE

function cleanMatteAlpha(value) {
  const n = Math.max(0, Math.min(1, value / 255))
  const c = Math.max(0, Math.min(1, (n - MATTE_BLACK_POINT) / (MATTE_WHITE_POINT - MATTE_BLACK_POINT)))
  return c * c * (3 - 2 * c) // smoothstep：压缩尾部但保留毛发羽化
}

async function createRemover(onProgress) {
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: (e) => {
      if (e.status === 'ready') return onProgress?.({ phase: 'loading', progress: 100 })
      const p = Number(e.progress)
      if (Number.isFinite(p)) onProgress?.({ phase: 'loading', progress: Math.max(0, Math.min(100, p)) })
    },
  })

  /* 返回：输入 Blob → 输出带透明通道的 RawImage */
  return async (blob) => {
    const image = await RawImage.fromBlob(blob)
    /* 预处理：等比缩放到长边 320 → 居中 padding 到 320×320 → ImageNet 归一化 */
    const size = 320
    const scale = Math.min(size / image.width, size / image.height)
    const rw = Math.max(1, Math.round(image.width * scale))
    const rh = Math.max(1, Math.round(image.height * scale))
    const left = Math.floor((size - rw) / 2)
    const top = Math.floor((size - rh) / 2)
    const right = size - rw - left
    const bottom = size - rh - top
    const prepared = await (await image.clone().rgb().resize(rw, rh)).pad([left, right, top, bottom])

    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]
    const plane = size * size
    const data = new Float32Array(plane * 3)
    for (let i = 0; i < plane; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        data[c * plane + i] = (prepared.data[i * 3 + c] / 255 - mean[c]) / std[c]
      }
    }
    const prediction = await model({ 'input.1': new Tensor('float32', data, [1, 3, size, size]) })
    /* U²-Net 有多路侧输出，只用 1959（composite） */
    const composite = prediction['1959'] ?? Object.values(prediction)[0]
    if (!composite) throw new Error('模型没有返回前景遮罩')

    let min = Infinity
    let max = -Infinity
    for (const v of composite.data) {
      min = Math.min(min, Number(v))
      max = Math.max(max, Number(v))
    }
    const range = Math.max(max - min, 0.00001)
    const px = new Uint8Array(plane)
    for (let i = 0; i < plane; i += 1) {
      px[i] = Math.round(((Number(composite.data[i]) - min) / range) * 255)
    }
    /* 遮罩裁掉 padding → 放大回原图尺寸 */
    const cropped = await new RawImage(px, size, size, 1).crop([left, top, left + rw - 1, top + rh - 1])
    const mask = await cropped.resize(image.width, image.height)

    image.rgba()
    for (let i = 0; i < mask.data.length; i += 1) {
      const cleaned = cleanMatteAlpha(mask.data[i])
      const sourceAlpha = image.data[i * 4 + 3] / 255
      mask.data[i] = Math.round(cleaned * sourceAlpha * 255) // 乘法合成，别覆盖
    }
    return image.putAlpha(mask)
  }
}

/* 统一预处理：解码 → 长边限制 4096 → Blob（避免大图把内存撑爆） */
async function toBlob(source) {
  if (source instanceof Blob || source instanceof File) {
    const bitmap = await createImageBitmap(source)
    if (Math.max(bitmap.width, bitmap.height) <= 4096) return source
    return downscale(bitmap)
  }
  const res = await fetch(source)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  if (Math.max(bitmap.width, bitmap.height) <= 4096) return blob
  return downscale(bitmap)
}

function downscale(bitmap) {
  const scale = 4096 / Math.max(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片预处理失败'))), 'image/png')
  })
}

/**
 * 沿物体边缘抠出主体（透明底）
 * @param {File|Blob} source 图片文件 / Blob
 * @param {(p:{phase:'loading'|'processing', progress?:number})=>void} [onProgress]
 * @returns {Promise<{dataUrl:string, width:number, height:number}>} 透明底 PNG dataURL
 */
export async function removeImageBackground(source, onProgress) {
  const blob = await toBlob(source)
  onProgress?.({ phase: 'loading', progress: 0 })
  if (!removerPromise) removerPromise = createRemover(onProgress)
  let remover
  try {
    remover = await removerPromise
  } catch (e) {
    removerPromise = null // 失败要能重试
    throw e
  }
  onProgress?.({ phase: 'processing' })
  let output
  try {
    output = await remover(blob)
  } catch (e) {
    removerPromise = null
    throw e
  }
  const canvas = document.createElement('canvas')
  canvas.width = output.width
  canvas.height = output.height
  const ctx = canvas.getContext('2d')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(output.data), output.width, output.height), 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  return { dataUrl, width: output.width, height: output.height }
}
