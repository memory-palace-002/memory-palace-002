/**
 * 记忆书柜 —— 数据模型（移植自队友的 memory-bookshelf 项目，paths 已适配本仓库 public/bookshelf/）
 * 文件头注明来源，方便团队溯源。
 */
export type Period = 'week' | 'month' | 'year'

export type ItemKind = 'photo' | 'object' | 'voice' | 'note'

export interface CollectionItem {
  id: string
  /**
   * photo = 普通照片; object = 2.5D 扫描/平面抠图得到的透明背景物件;
   * voice = 语音感受; note = 文字
   */
  kind: ItemKind
  /** photo / object 的图片地址 */
  src?: string
  /** 标题 / 图注 */
  caption?: string
  /** note / voice 的正文或转写 */
  text?: string
  /** 录入/拍摄时间 */
  time?: string
  /** 地点 */
  place?: string
  /** 语音时长 */
  duration?: string
  /** 是否已被取出到房间(书内留倒影) */
  extracted?: boolean
  /** 取出后在房间中的位置 */
  pos?: [number, number, number]
}

export interface MemoryBox {
  id: string
  /** 书脊 / 封面标题 */
  title: string
  period: Period
  spineColor: string
  /** 预留: 自定义封面图(不填则用 Canvas 生成封面) */
  coverImage?: string
  /** 外观自定义: 大小档位 */
  sizeScale?: number
  /** 外观自定义: 纸张质感 */
  paper?: 'plain' | 'lined' | 'aged'
  items: CollectionItem[]
}

/**
 * 队友模块接入的数据契约:
 * 拍照 / 2.5D 扫描 / 平面抠图 / 文字 / 语音 统一通过 ingestCapture(payload) 进入,
 * 自动新建一本以当天日期命名的书并存入全部素材
 */
export interface CapturePayload {
  photos?: string[]
  /** 2.5D 扫描或平面抠图结果(透明背景 PNG) */
  scans?: { src: string; caption?: string }[]
  texts?: string[]
  voices?: { caption?: string; duration?: string; text?: string }[]
  time?: string
  place?: string
  caption?: string
}

const BASE = import.meta.env.BASE_URL
const photo = (n: number, caption: string, extra: Partial<CollectionItem> = {}): CollectionItem => ({
  id: `p${n}-${caption}`,
  kind: 'photo',
  src: `${BASE}bookshelf/photos/photo-${((n - 1) % 9) + 1}.svg`,
  caption,
  ...extra,
})
const object = (n: number, caption: string, extra: Partial<CollectionItem> = {}): CollectionItem => ({
  id: `o${n}-${caption}`,
  kind: 'object',
  src: `${BASE}bookshelf/objects/object-${((n - 1) % 4) + 1}.svg`,
  caption,
  ...extra,
})

/** mock 数据: 书架上的书。换成真实数据时改这里或走 ingestCapture */
export const boxes: MemoryBox[] = [
  {
    id: 'b1',
    title: '第36周',
    period: 'week',
    spineColor: '#c25e4c',
    items: [
      photo(1, '周五的晚霞', { time: '2026-09-11 18:42', place: '宿舍天台' }),
      photo(2, '周末早市', { time: '2026-09-12 08:15', place: '城南早市' }),
      object(1, '新买的水杯', { time: '2026-09-13', place: '街角文具店' }),
      {
        id: 'v1-晚霞心情',
        kind: 'voice',
        caption: '晚霞心情',
        duration: '0:42',
        text: '今天的晚霞是橘子汽水味的, 风很轻, 突然觉得这一周值了。',
        time: '2026-09-11 18:50',
        place: '宿舍天台',
      },
    ],
  },
  {
    id: 'b2',
    title: '第37周',
    period: 'week',
    spineColor: '#d98e4a',
    items: [
      photo(3, '加班后的便利店', { time: '2026-09-16 23:05', place: '公司楼下' }),
      object(2, '捡到的银杏叶', { time: '2026-09-15', place: '银杏道' }),
    ],
  },
  {
    id: 'b3',
    title: '9月',
    period: 'month',
    spineColor: '#4f7d9c',
    items: [
      photo(4, '台风前的天空', { time: '2026-09-05 16:20', place: '教学楼顶' }),
      photo(5, '夜市', { time: '2026-09-06 20:30', place: '老城夜市' }),
      photo(6, '海边', { time: '2026-09-07 17:10', place: '东沙滩' }),
      object(3, '演出票根', { time: '2026-09-06 19:00', place: '人民会堂' }),
    ],
  },
  {
    id: 'b4',
    title: '8月',
    period: 'month',
    spineColor: '#7a8c5c',
    items: [
      photo(7, '山间步道', { time: '2026-08-14 10:00', place: '青云山' }),
      photo(8, '外婆家的午饭', { time: '2026-08-15 12:30', place: '外婆家' }),
      object(4, '朋友送的冰箱贴', { time: '2026-08-20', place: '宿舍' }),
    ],
  },
  {
    id: 'b5',
    title: '7月',
    period: 'month',
    spineColor: '#8c6bb1',
    items: [
      photo(9, '暑假第一天的床', { time: '2026-07-01 09:00', place: '家里' }),
      photo(4, '雨后的积云', { time: '2026-07-12 17:40', place: '操场' }),
    ],
  },
  {
    id: 'b6',
    title: '2025年',
    period: 'year',
    spineColor: '#5d5a4f',
    items: [
      photo(1, '跨年', { time: '2025-12-31 23:58', place: '广场' }),
      photo(3, '春天'),
      photo(6, '夏天'),
      photo(2, '秋天'),
      photo(9, '冬天'),
      object(3, '年度票根'),
      object(1, '年度水杯'),
      photo(5, '夜宵'),
    ],
  },
  {
    id: 'b7',
    title: '2024年',
    period: 'year',
    spineColor: '#a0522d',
    items: [
      photo(7, '毕业季', { time: '2024-06-20 10:00', place: '大礼堂' }),
      photo(8, '散伙饭', { time: '2024-06-22 19:00', place: '老五餐厅' }),
    ],
  },
  {
    id: 'b8',
    title: '手账杂记',
    period: 'year',
    spineColor: '#3e5c50',
    items: [
      object(2, '不知名的叶子', { time: '2024-10-02', place: '后山' }),
      photo(6, '随手拍的海'),
      {
        id: 'n1-随想',
        kind: 'note',
        caption: '随想',
        text: '书架就像一排压缩包, 每本书都是一个盒子, 装着舍不得删掉的瞬间。',
        time: '2024-10-05 21:00',
        place: '图书馆',
      },
    ],
  },
]

/** 书皮可选色板(悬浮工具条「书皮」按钮循环取用) */
export const SPINE_PALETTE = [
  '#c25e4c', '#d98e4a', '#7a8c5c', '#4f7d9c',
  '#8c6bb1', '#5d5a4f', '#3e5c50', '#a0522d',
]

/** 「新建记忆」演示数据: 模拟队友模块产出的素材 */
export function demoCapture(): CapturePayload {
  return {
    photos: [`${BASE}bookshelf/photos/photo-6.svg`],
    scans: [{ src: `${BASE}bookshelf/objects/object-2.svg`, caption: '扫描的叶子' }],
    texts: ['今天在海边捡到一片很完整的叶子, 顺手扫描存进了这本新书。'],
    voices: [{ caption: '海边的风', duration: '0:18', text: '海风咸咸的, 浪声一下一下…' }],
    place: '东沙滩',
  }
}
