/**
 * matting —— 浏览器端 AI 抠图（U²-Netp，沿物体边缘分割主体）
 *
 * 抠图内核复用 Logikinet「Sticker Forge」项目的实现（workers/background-removal.worker.ts）：
 *   模型  BritishWerewolf/U-2-Netp（U²-Net 轻量版，Apache-2.0，onnx 仅 4.4MB，已放 public/models/）
 *   推理  @huggingface/transformers（Transformers.js，WASM 后端），全程在浏览器里跑
 */

let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  {
    resolve: (v: { pixels: Uint8ClampedArray; width: number; height: number; dataUrl: string }) => void
    reject: (e: Error) => void
    onProgress?: (p: { phase: 'loading' | 'processing'; progress?: number }) => void
  }
>()

type MattingResult = { pixels: Uint8ClampedArray; width: number; height: number; dataUrl: string }

/* 把 RGBA 像素画成 PNG（贴纸必须是带透明通道的 PNG） */
function pixelsToDataUrl(pixels: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas，无法生成贴纸')
  const buf = new Uint8ClampedArray(pixels.length)
  buf.set(pixels)
  ctx.putImageData(new ImageData(buf, width, height), 0, 0)
  return canvas.toDataURL('image/png')
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./workers/background-removal.worker.ts', import.meta.url), {
    type: 'module',
    name: 'memory-room3d-background-removal',
  })
  worker.addEventListener('message', (event: MessageEvent) => {
    const res = event.data as {
      id: number
      type: 'progress' | 'done' | 'error'
      phase?: 'loading' | 'processing'
      progress?: number
      message?: string
      pixels?: ArrayBuffer
      width?: number
      height?: number
    }
    const req = pending.get(res.id)
    if (!req) return
    if (res.type === 'progress') {
      req.onProgress?.({ phase: res.phase ?? 'loading', progress: res.progress })
      return
    }
    pending.delete(res.id)
    if (res.type === 'error') {
      req.reject(new Error(res.message || '抠图失败'))
      return
    }
    try {
      const pixels = new Uint8ClampedArray(res.pixels!)
      const width = res.width!
      const height = res.height!
      req.resolve({ pixels, width, height, dataUrl: pixelsToDataUrl(pixels, width, height) })
    } catch (e) {
      req.reject(e instanceof Error ? e : new Error('贴纸生成失败'))
    }
  })
  worker.addEventListener('error', (event) => {
    const err = new Error(event.message || '抠图 Worker 启动失败')
    for (const req of pending.values()) req.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
  })
  return worker
}

/**
 * 一站式抠图：上传图 → 沿物体边缘抠出主体（透明底 PNG）
 * @param source 图片（dataURL / blobURL / http URL 均可）
 * @param onProgress phase='loading' 时 progress 为 0~100（模型加载），'processing' 为推理中
 * @returns { dataUrl, width, height } 透明底抠图（卡片详情与白边生成共用这一份）
 */
export function stickerize(
  source: string,
  onProgress?: (p: { phase: 'loading' | 'processing'; progress?: number }) => void
): Promise<MattingResult> {
  return removeImageBackground(source, onProgress)
}

/* 统一预处理：解码 → 长边限制 4096 → 转 PNG Blob */
async function normalizeImageSource(source: string): Promise<Blob> {
  const image = new Image()
  image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片无法解码（格式可能不受支持）'))
    image.src = source
  })
  const natW = image.naturalWidth || image.width
  const natH = image.naturalHeight || image.height
  if (!natW || !natH) throw new Error('图片尺寸无效')

  const maxSide = 4096
  const scale = Math.min(1, maxSide / Math.max(natW, natH))
  const width = Math.max(1, Math.round(natW * scale))
  const height = Math.max(1, Math.round(natH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('图片预处理失败'))), 'image/png')
  })
}

/**
 * 沿物体边缘抠出主体
 * @param source 图片（dataURL / blobURL / http URL 均可）
 * @param onProgress phase='loading' 时 progress 为 0~100（模型加载），'processing' 为推理中
 */
export async function removeImageBackground(
  source: string,
  onProgress?: (p: { phase: 'loading' | 'processing'; progress?: number }) => void
): Promise<MattingResult> {
  const blob = await normalizeImageSource(source)
  const buffer = await blob.arrayBuffer()
  const id = ++requestId
  return new Promise<MattingResult>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ type: 'remove', id, image: buffer, mimeType: blob.type || 'image/png' }, [buffer])
  })
}

/* 把图片 URL 解码成 <img> 元素（手动截取 / 直接放入共用） */
function loadImageEl(srcUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片无法解码'))
    img.src = srcUrl
  })
}

/**
 * 手动截取：按用户圈选的多边形抠图（圈外变透明，边缘轻微羽化避免生硬锯齿）
 * @param srcUrl 图片（dataURL / blobURL / http URL 均可）
 * @param polygon 圈选多边形顶点（原图自然分辨率坐标）
 * @returns { dataUrl, width, height } 透明底 PNG
 */
export async function cutWithLasso(
  srcUrl: string,
  polygon: Array<{ x: number; y: number }>
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (polygon.length < 3) throw new Error('圈选区域太小，请重新圈选')
  const img = await loadImageEl(srcUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('图片尺寸无效')

  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.drawImage(img, 0, 0, w, h)

  /* 遮罩：白色多边形 + 轻微羽化，再以 destination-in 贴回原图 */
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const mc = mask.getContext('2d')
  if (!mc) throw new Error('浏览器不支持 Canvas')
  mc.filter = 'blur(3px)'
  mc.fillStyle = '#fff'
  mc.beginPath()
  polygon.forEach((p, i) => (i === 0 ? mc.moveTo(p.x, p.y) : mc.lineTo(p.x, p.y)))
  mc.closePath()
  mc.fill()

  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  return { dataUrl: cv.toDataURL('image/png'), width: w, height: h }
}

/**
 * 直接放入：不抠图，仅把原图压成尺寸可控的 PNG（贴图纹理 / 白边流程都需要合理尺寸）
 * @returns { dataUrl, width, height }
 */
export async function flattenImage(
  srcUrl: string,
  max = 1600
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImageEl(srcUrl)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height
  if (!natW || !natH) throw new Error('图片尺寸无效')
  const scale = Math.min(1, max / Math.max(natW, natH))
  const w = Math.max(1, Math.round(natW * scale))
  const h = Math.max(1, Math.round(natH * scale))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.drawImage(img, 0, 0, w, h)
  return { dataUrl: cv.toDataURL('image/png'), width: w, height: h }
}

/* 圆角矩形路径 */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * 物品贴面：把用户图片转成与房间建模风格一致的「制品贴纸」
 * cover 裁剪到目标比例 → 圆角 → 暖米色边框（像印在杯身/封面上的贴片）→ 轻微暖色调和
 * 这样贴到预设模型上不会出现生硬的方图穿帮。
 * @param aspect 贴面区宽高比（w/h）
 * @param opts.full 满幅模式：不要米色边框，图片 cover 裁剪后铺满整个贴面区
 *                  （书本封面用——照片就是封面本身，按书本尺寸自动裁剪）
 */
export function stylizeDecal(
  source: string,
  aspect = 1.3,
  opts?: { full?: boolean }
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const outW = 640
        const full = !!opts?.full
        const pad = full ? 0 : Math.round(outW * 0.045) // 米色边框宽（满幅模式无边框）
        const innerW = outW - pad * 2
        const innerH = Math.round(innerW / aspect)
        const outH = innerH + pad * 2
        const radius = full ? Math.round(outW * 0.012) : Math.round(outW * 0.055)

        const canvas = document.createElement('canvas')
        canvas.width = outW
        canvas.height = outH
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('浏览器不支持 Canvas')

        /* 1. 米色底框（圆角，带极淡描边，模拟陶瓷/封面印刷边缘）；满幅模式跳过 */
        if (!full) {
          roundedRectPath(ctx, 0, 0, outW, outH, radius)
          ctx.fillStyle = '#f4edde'
          ctx.fill()
          ctx.strokeStyle = 'rgba(150,120,80,0.28)'
          ctx.lineWidth = 3
          ctx.stroke()
        } else {
          /* 满幅：铺一层暖米色底，防止透明图露黑 */
          roundedRectPath(ctx, 0, 0, outW, outH, radius)
          ctx.fillStyle = '#f4edde'
          ctx.fill()
        }

        /* 2. 内圆角裁剪，cover 方式画入图片（色调轻微调和，贴上后不突兀） */
        const iw = img.naturalWidth
        const ih = img.naturalHeight
        const scale = Math.max(innerW / iw, innerH / ih)
        const dw = iw * scale
        const dh = ih * scale
        ctx.save()
        roundedRectPath(ctx, pad, pad, innerW, innerH, radius - pad > 2 ? radius - pad : 2)
        ctx.clip()
        if ('filter' in ctx) ctx.filter = 'saturate(0.95) brightness(1.03)'
        ctx.drawImage(img, pad + (innerW - dw) / 2, pad + (innerH - dh) / 2, dw, dh)
        ctx.filter = 'none'
        /* 3. 极淡的暖色罩，让贴面融进房间的暖色系 */
        ctx.fillStyle = 'rgba(255,240,214,0.05)'
        ctx.fillRect(pad, pad, innerW, innerH)
        ctx.restore()

        resolve({ dataUrl: canvas.toDataURL('image/png'), width: outW, height: outH })
      } catch (e) {
        reject(e instanceof Error ? e : new Error('贴面生成失败'))
      }
    }
    img.onerror = () => reject(new Error('贴面生成失败：图片无法解码'))
    img.src = source
  })
}

/* 白边膨胀用的 8 个方向 */
const DIRS8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
]

/**
 * 给透明底抠图沿轮廓外扩一圈贴合边缘的白边（撕贴工坊效果）
 * 原理：alpha 逐像素 8 方向膨胀 pad 轮 → 膨胀层染白 → 原图盖回中心。
 * @returns { dataUrl, width, height } 带白边贴纸的 PNG dataURL 与尺寸
 */
export function addStickerBorder(
  srcUrl: string,
  opts?: { ratio?: number; max?: number }
): Promise<{ dataUrl: string; width: number; height: number }> {
  const ratio = opts?.ratio ?? 0.05
  const max = opts?.max ?? 1000
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const pad = Math.max(4, Math.round(Math.min(w, h) * ratio))

        const base = document.createElement('canvas')
        base.width = w
        base.height = h
        base.getContext('2d')!.drawImage(img, 0, 0, w, h)

        /* 膨胀层：自绘累积 alpha，pad 轮后比主体大一圈 */
        const m = document.createElement('canvas')
        m.width = w + pad * 2
        m.height = h + pad * 2
        const mc = m.getContext('2d')!
        mc.drawImage(base, pad, pad)
        for (let r = 0; r < pad; r++) {
          for (const d of DIRS8) mc.drawImage(m, d[0], d[1])
        }

        /* 膨胀层染成纯白，再把原图盖回中心 */
        const out = document.createElement('canvas')
        out.width = m.width
        out.height = m.height
        const oc = out.getContext('2d')!
        oc.drawImage(m, 0, 0)
        oc.globalCompositeOperation = 'source-in'
        oc.fillStyle = '#fff'
        oc.fillRect(0, 0, out.width, out.height)
        oc.globalCompositeOperation = 'source-over'
        oc.drawImage(base, pad, pad)
        resolve({ dataUrl: out.toDataURL('image/png'), width: out.width, height: out.height })
      } catch (e) {
        reject(e instanceof Error ? e : new Error('白边生成失败'))
      }
    }
    img.onerror = () => reject(new Error('白边生成失败：图片无法解码'))
    img.src = srcUrl
  })
}
