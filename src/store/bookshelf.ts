import { create } from 'zustand';
import type { CapturePayload, CollectionItem, MemoryBox } from '../data/boxes';
import { boxes as initialBoxes } from '../data/boxes';
import { BOOK_FACE_ANGLE, CLOSE_DURATION, OPEN_DURATION } from '../lib/anim';

export type Phase = 'closed' | 'opening' | 'open' | 'closing';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** 初始机位: 环绕书架 */
export const INITIAL_POSE: CameraPose = {
  position: [0.55, 1.55, 1.9],
  target: [0, 1.2, -2.0],
};

/** 阅读机位: 正对摊开的书 */
export const STAGE: CameraPose = {
  position: [0, 1.5, -0.29],
  target: [0, 1.5, -1.45],
};

/** 打开时书本飞到的展示位姿(封面朝镜头) */
export const STAGE_BOOK = {
  position: [0, 1.5, -1.45] as [number, number, number],
  rotationY: BOOK_FACE_ANGLE,
  scale: 1.75,
};

export interface DragState {
  boxId: string;
  itemId: string;
  startX: number;
  startY: number;
  /** 位移超过阈值后进入真正的拖拽(区别于点击看详情) */
  active: boolean;
}

interface BookshelfState {
  boxes: MemoryBox[];
  hoveredId: string | null;
  activeId: string | null;
  phase: Phase;
  openStartedAt: number;
  currentPage: number;
  openTimer: ReturnType<typeof setTimeout> | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  /** 悬浮工具条挂在哪本书上(悬停翻面时出现) */
  toolsBoxId: string | null;
  toolsTimer: ReturnType<typeof setTimeout> | null;
  renamingId: string | null;
  detail: { boxId: string; itemId: string } | null;
  drag: DragState | null;

  setHovered: (id: string | null) => void;
  showTools: (id: string) => void;
  scheduleHideTools: () => void;
  keepTools: () => void;
  openBook: (id: string) => void;
  closeBook: () => void;
  setPage: (n: number) => void;
  beginDrag: (boxId: string, itemId: string, x: number, y: number) => void;
  moveDrag: (x: number, y: number) => void;
  /** 结束拖拽: placed=true 落到房间, 否则视为点击看详情 */
  endDrag: (placed: boolean, pos?: [number, number, number]) => void;
  extractItem: (boxId: string, itemId: string, pos: [number, number, number]) => void;
  returnItem: (boxId: string, itemId: string) => void;
  openDetail: (boxId: string, itemId: string) => void;
  closeDetail: () => void;
  updateBox: (id: string, patch: Partial<MemoryBox>) => void;
  startRename: (id: string) => void;
  renameCommit: (title: string) => void;
  /** 队友模块接入: 自动新建当天日期的书并存入素材 */
  capture: (payload: CapturePayload) => void;
}

let uid = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`;

export const useBookshelf = create<BookshelfState>()((set, get) => ({
  boxes: initialBoxes,
  hoveredId: null,
  activeId: null,
  phase: 'closed',
  openStartedAt: 0,
  currentPage: 0,
  openTimer: null,
  closeTimer: null,
  toolsBoxId: null,
  toolsTimer: null,
  renamingId: null,
  detail: null,
  drag: null,

  setHovered: (id) => {
    if (get().phase !== 'closed') return;
    set({ hoveredId: id });
  },
  showTools: (id) => {
    const { toolsTimer } = get();
    if (toolsTimer) clearTimeout(toolsTimer);
    set({ toolsBoxId: id });
  },
  scheduleHideTools: () => {
    const { toolsTimer } = get();
    if (toolsTimer) clearTimeout(toolsTimer);
    set({ toolsTimer: setTimeout(() => set({ toolsBoxId: null }), 450) });
  },
  keepTools: () => {
    const { toolsTimer } = get();
    if (toolsTimer) clearTimeout(toolsTimer);
  },
  openBook: (id) => {
    const { phase, openTimer, closeTimer } = get();
    if (phase !== 'closed') return;
    if (openTimer) clearTimeout(openTimer);
    if (closeTimer) clearTimeout(closeTimer);
    document.body.style.cursor = '';
    set({
      activeId: id,
      phase: 'opening',
      hoveredId: null,
      toolsBoxId: null,
      currentPage: 0,
      detail: null,
      renamingId: null,
      openStartedAt: performance.now(),
    });
    set({ openTimer: setTimeout(() => set({ phase: 'open' }), OPEN_DURATION) });
  },
  closeBook: () => {
    const { phase, openTimer, closeTimer, drag } = get();
    if (phase === 'closed' || phase === 'closing' || drag) return;
    if (openTimer) clearTimeout(openTimer);
    if (closeTimer) clearTimeout(closeTimer);
    set({ phase: 'closing', detail: null, renamingId: null });
    set({
      closeTimer: setTimeout(
        () => set({ phase: 'closed', activeId: null, currentPage: 0 }),
        CLOSE_DURATION,
      ),
    });
  },
  setPage: (n) => set({ currentPage: n }),

  beginDrag: (boxId, itemId, x, y) => {
    const s = get();
    // 拖拽可发生在: 书摊开时从页内取出 / 书合上时挪动房间里的物品
    if (s.drag || s.phase === 'opening' || s.phase === 'closing') return;
    set({ drag: { boxId, itemId, startX: x, startY: y, active: false } });
  },
  moveDrag: (x, y) => {
    const d = get().drag;
    if (!d || d.active) return;
    if (Math.hypot(x - d.startX, y - d.startY) > 8) set({ drag: { ...d, active: true } });
  },
  endDrag: (placed, pos) => {
    const d = get().drag;
    if (!d) return;
    set({ drag: null });
    if (placed && pos) get().extractItem(d.boxId, d.itemId, pos);
    else if (!placed) get().openDetail(d.boxId, d.itemId);
  },
  extractItem: (boxId, itemId, pos) =>
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id !== boxId
          ? b
          : {
              ...b,
              items: b.items.map((i) =>
                i.id === itemId ? { ...i, extracted: true, pos } : i,
              ),
            },
      ),
    })),
  returnItem: (boxId, itemId) => {
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id !== boxId
          ? b
          : {
              ...b,
              items: b.items.map((i) =>
                i.id === itemId ? { ...i, extracted: false, pos: undefined } : i,
              ),
            },
      ),
      detail: null,
    }));
  },
  openDetail: (boxId, itemId) => set({ detail: { boxId, itemId } }),
  closeDetail: () => set({ detail: null }),

  updateBox: (id, patch) =>
    set((s) => ({ boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
  startRename: (id) => set({ renamingId: id }),
  renameCommit: (title) => {
    const id = get().renamingId;
    const t = title.trim();
    if (id && t) get().updateBox(id, { title: t });
    set({ renamingId: null });
  },
  capture: (p) => {
    const now = new Date();
    const time = p.time ?? now.toLocaleString('zh-CN', { hour12: false });
    const items: CollectionItem[] = [];
    (p.photos ?? []).forEach((src) =>
      items.push({ id: nextId('p'), kind: 'photo', src, caption: p.caption ?? '随手拍', time, place: p.place }),
    );
    (p.scans ?? []).forEach((sc) =>
      items.push({ id: nextId('o'), kind: 'object', src: sc.src, caption: sc.caption ?? '扫描物件', time, place: p.place }),
    );
    (p.texts ?? []).forEach((t) =>
      items.push({ id: nextId('n'), kind: 'note', caption: t.slice(0, 10), text: t, time, place: p.place }),
    );
    (p.voices ?? []).forEach((v) =>
      items.push({ id: nextId('v'), kind: 'voice', caption: v.caption ?? '语音随记', duration: v.duration ?? '0:30', text: v.text, time, place: p.place }),
    );
    if (!items.length) return;
    const box: MemoryBox = {
      id: nextId('b'),
      title: `${now.getMonth() + 1}月${now.getDate()}日`,
      period: 'week',
      spineColor: '#4f7d9c',
      items,
    };
    set((s) => ({ boxes: [...s.boxes, box] }));
  },
}));
