/**
 * trimAsset —— 把扫描模块产出的 2.5D 资产整理成「房间贴片」能直接用的贴图
 *
 * 为什么需要这一步：
 *   扫描模块的 assetProcessor 输出的是 640×640 画布，主体只占中间约 78% 宽，
 *   四周全是透明留白。贴片系统按图片宽高比决定显示尺寸，直接把这张方图丢进去，
 *   贴片会被大片透明边距「撑小」，看上去比实际小一圈、还偏上。
 *   这里按 alpha 包围盒裁掉留白，主体就紧贴贴片边缘。
 *
 * 两个防御点（都不是理论风险，是真实会遇到的）：
 *   1. 资产在 Supabase 存储桶里，读像素属于跨域。若桶没给 CORS 头，
 *      canvas 会被污染、toDataURL 抛 SecurityError —— 此时回退成「用原图整张」，
 *      显示不受影响，只是贴片带一圈透明边距。
 *   2. 贴图会进 localStorage（贴片存档），所以输出限制在 512px 以内、
 *      优先 WebP 编码，避免几张图就把 5MB 配额吃满。
 */

export interface StickerImage {
  /** 贴片纹理（裁掉留白后的紧贴贴图；裁剪失败时等于原图 URL） */
  dataUrl: string
  width: number
  height: number
}

const MAX_SIDE = 512

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    /* 刻意不设 crossOrigin：设了的话，桶一旦不回 CORS 头就会连显示都失败。
     * 不设则图片正常显示，只在读像素时被安全策略拦下——那一步我们兜底。 */
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('扫描资产加载失败'))
    img.src = src
  })
}

/** 非透明区域的包围盒；整张全透明时返回 null */
function alphaBBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 画布导出：优先 WebP（体积小且带透明通道），不被支持时回退 PNG */
function exportCanvas(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.92)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
}

/**
 * 裁掉透明留白并控制尺寸，返回贴片可用的纹理
 * @param src 扫描资产 URL（Supabase 公网地址）
 * @param fallbackSize 读像素失败时用于兜底的原始尺寸（可由调用方先量好，避免重复加载）
 */
export async function trimAssetPadding(src: string): Promise<StickerImage> {
  const img = await loadImage(src)
  const natW = img.naturalWidth || img.width
  const natH = img.naturalHeight || img.height

  try {
    const full = document.createElement('canvas')
    full.width = natW
    full.height = natH
    const fctx = full.getContext('2d', { willReadFrequently: true })
    if (!fctx) throw new Error('浏览器不支持 Canvas')
    fctx.drawImage(img, 0, 0, natW, natH)

    const box = alphaBBox(fctx, natW, natH)
    if (!box) throw new Error('扫描资产是空的')

    const scale = Math.min(1, MAX_SIDE / Math.max(box.w, box.h))
    const w = Math.max(1, Math.round(box.w * scale))
    const h = Math.max(1, Math.round(box.h * scale))

    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const octx = out.getContext('2d')
    if (!octx) throw new Error('浏览器不支持 Canvas')
    octx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, w, h)

    return { dataUrl: exportCanvas(out), width: w, height: h }
  } catch {
    /* 跨域污染 / 空图 / Canvas 不可用 → 原图整张兜底，功能不中断 */
    return { dataUrl: src, width: natW, height: natH }
  }
}
