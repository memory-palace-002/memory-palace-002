import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { MemoryBox } from '../data/boxes';
import { SPINE_PALETTE } from '../data/boxes';
import { STAGE_BOOK, useBookshelf } from '../store/bookshelf';
import { OPEN_ANGLE, OPEN_LIFT_DELAY, damp, parallax } from '../lib/anim';
import { bookDims } from '../lib/dims';
import { coverTexture, spineTexture } from '../lib/textures';
import { isTap } from '../lib/pointer';
import { PageSurface } from './OpenBook';

const ITEMS_PER_PAGE = 4; // 摊开后左右两页各放 2 个, 页数随条目无限增加
const SIZES = [0.9, 1, 1.12];
const PAPERS = ['plain', 'lined', 'aged'] as const;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * 一本书 = 外层 group(书架槽位 <-> 展示位飞行)
 *        > pivot(悬停时先向镜头抽出放大, 再绕装订棱翻转; 装订棱在 pivot 原点)
 *          > 书身(页面块, +z 面贴书脊纹理)
 *          > hinge(封面绕装订棱摊开) > 封面板 + 左页内容
 */
export function Book({ box, position }: { box: MemoryBox; position: [number, number, number] }) {
  const hovered = useBookshelf((s) => s.hoveredId === box.id || s.toolsBoxId === box.id);
  const active = useBookshelf((s) => s.activeId === box.id);
  const phase = useBookshelf((s) => s.phase);
  const page = useBookshelf((s) => s.currentPage);
  const openStartedAt = useBookshelf((s) => s.openStartedAt);
  const setHovered = useBookshelf((s) => s.setHovered);
  const openBook = useBookshelf((s) => s.openBook);
  const showTools = useBookshelf((s) => s.showTools);
  const scheduleHideTools = useBookshelf((s) => s.scheduleHideTools);
  const keepTools = useBookshelf((s) => s.keepTools);
  const updateBox = useBookshelf((s) => s.updateBox);
  const startRename = useBookshelf((s) => s.startRename);

  const group = useRef<THREE.Group>(null!);
  const pivot = useRef<THREE.Group>(null!);
  const hinge = useRef<THREE.Group>(null!);
  /** 悬停总进度: 0→0.55 抽出放大, 0.5→1 翻面(两段式, 避免在架内旋转穿模) */
  const hoverAmt = useRef(0);

  const dims = useMemo(() => bookDims(box), [box]);
  const spine = useMemo(() => spineTexture(box.title, box.spineColor), [box]);
  const cover = useMemo(() => coverTexture(box.title, box.spineColor), [box]);
  const pageW = dims.d - 0.04;
  const pageH = dims.h - 0.06;
  const leftItems = box.items.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + 2);
  const rightItems = box.items.slice(page * ITEMS_PER_PAGE + 2, page * ITEMS_PER_PAGE + 4);
  const pages = Math.max(1, Math.ceil(box.items.length / ITEMS_PER_PAGE));
  const showPages = active && phase !== 'closed';

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (phase !== 'closed') return;
    setHovered(box.id);
    showTools(box.id);
    document.body.style.cursor = 'pointer';
  };
  const onPointerOut = () => {
    setHovered(null);
    scheduleHideTools();
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (phase !== 'closed' || !isTap(e.clientX, e.clientY)) return;
    openBook(box.id);
  };

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = group.current;
    const pv = pivot.current;
    const hg = hinge.current;
    if (!g || !pv || !hg) return;

    if (active && phase !== 'closed') {
      const goal = phase === 'closing' ? null : STAGE_BOOK;
      // 摊开时以书脊为视觉中心: 书身原点需向右偏移 d/2*scale
      const gx = goal ? goal.position[0] + (dims.d / 2) * goal.scale : position[0];
      const gy = goal ? goal.position[1] : position[1];
      const gz = goal ? goal.position[2] : position[2];
      const gr = goal ? goal.rotationY : 0;
      const gs = goal ? goal.scale : 1;
      g.position.x = damp(g.position.x, gx, 6, dt);
      g.position.y = damp(g.position.y, gy, 6, dt);
      g.position.z = damp(g.position.z, gz, 6, dt);
      g.rotation.y = damp(g.rotation.y, gr, 6, dt);
      g.scale.setScalar(damp(g.scale.x, gs, 6, dt));
      pv.rotation.y = damp(pv.rotation.y, 0, 9, dt);
      pv.position.y = damp(pv.position.y, 0, 9, dt);
      pv.position.z = damp(pv.position.z, 0, 9, dt);
      const elapsed = performance.now() - openStartedAt;
      const coverGoal =
        phase === 'opening' && elapsed < OPEN_LIFT_DELAY ? 0 : goal ? OPEN_ANGLE : 0;
      hg.rotation.y = damp(hg.rotation.y, coverGoal, 5, dt);
      // 打开时整本书随指针轻微倾斜, 2.5D 物件做反向补偿形成视差
      parallax.x = damp(parallax.x, goal ? state.pointer.y * 0.05 : 0, 6, dt);
      parallax.y = damp(parallax.y, goal ? state.pointer.x * 0.07 : 0, 6, dt);
      g.rotation.x = damp(g.rotation.x, parallax.x, 8, dt);
      g.rotation.z = damp(g.rotation.z, -parallax.y * 0.6, 8, dt);
    } else {
      hoverAmt.current = damp(hoverAmt.current, hovered ? 1 : 0, 5.5, dt);
      const a = hoverAmt.current;
      const pull = 1 - Math.pow(1 - Math.min(1, a / 0.55), 3); // 第一段: 抽出放大
      const rot = smoothstep((a - 0.5) / 0.5);                 // 第二段: 翻面
      g.position.x = damp(g.position.x, position[0], 8, dt);
      g.position.y = damp(g.position.y, position[1], 8, dt);
      g.position.z = damp(g.position.z, position[2], 8, dt);
      g.rotation.y = damp(g.rotation.y, 0, 8, dt);
      g.rotation.x = damp(g.rotation.x, 0, 8, dt);
      g.rotation.z = damp(g.rotation.z, 0, 8, dt);
      parallax.x = damp(parallax.x, 0, 6, dt);
      parallax.y = damp(parallax.y, 0, 6, dt);
      g.scale.setScalar(1 + pull * 0.12);
      pv.position.z = pull * 0.3;
      pv.position.y = pull * 0.025;
      pv.rotation.y = -rot * 1.35;
      hg.rotation.y = damp(hg.rotation.y, 0, 9, dt);
    }
  });

  return (
    <group
      ref={group}
      position={position}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <group ref={pivot} position={[dims.t / 2, 0, dims.d / 2]}>
        {/* 书身: 页面块, +z 面是书脊 */}
        <group position={[-dims.t / 2, 0, -dims.d / 2]}>
          <mesh>
            <boxGeometry args={[dims.t - 0.012, dims.h - 0.012, dims.d - 0.01]} />
            <meshStandardMaterial attach="material-0" color="#eee3cb" roughness={0.85} />
            <meshStandardMaterial attach="material-1" color="#e5d9bf" roughness={0.85} />
            <meshStandardMaterial attach="material-2" color="#eee3cb" roughness={0.85} />
            <meshStandardMaterial attach="material-3" color="#d8cbaf" roughness={0.85} />
            <meshStandardMaterial attach="material-4" map={spine} roughness={0.5} />
            <meshStandardMaterial attach="material-5" color="#e5d9bf" roughness={0.85} />
          </mesh>
          {/* 右页 = 页面块外露面(打开后朝向镜头) */}
          <PageSurface
            side="right"
            boxId={box.id}
            items={rightItems}
            width={pageW}
            height={pageH}
            paper={box.paper ?? 'plain'}
            canTurn={pages > 1}
            position={[dims.t / 2 - 0.004, 0, -0.004]}
            rotation={[0, Math.PI / 2, 0]}
            visible={showPages}
          />
        </group>
        {/* 封面: 绕装订棱开合 */}
        <group ref={hinge}>
          <mesh position={[0.004, 0, -dims.d / 2]}>
            <boxGeometry args={[0.008, dims.h + 0.004, dims.d + 0.004]} />
            <meshStandardMaterial attach="material-0" map={cover} roughness={0.45} />
            <meshStandardMaterial attach="material-1" color="#f3ead6" roughness={0.8} />
            <meshStandardMaterial attach="material-2" color="#3a2e22" roughness={0.6} />
            <meshStandardMaterial attach="material-3" color="#3a2e22" roughness={0.6} />
            <meshStandardMaterial attach="material-4" color="#3a2e22" roughness={0.6} />
            <meshStandardMaterial attach="material-5" color="#f3ead6" roughness={0.8} />
          </mesh>
          {/* 左页 = 封面内侧, 随封面一起翻开 */}
          <PageSurface
            side="left"
            boxId={box.id}
            items={leftItems}
            width={pageW}
            height={pageH}
            paper={box.paper ?? 'plain'}
            canTurn={pages > 1}
            position={[-0.002, 0, -dims.d / 2]}
            rotation={[0, -Math.PI / 2, 0]}
            visible={showPages}
          />
        </group>
      </group>

      {/* 悬停时书上方出现的编辑工具条 */}
      {hovered && phase === 'closed' && (
        <Html position={[0, dims.h / 2 + 0.07, 0.12]} center zIndexRange={[9, 0]}>
          <div className="book-tools" onMouseEnter={keepTools}>
            <button
              onClick={() => {
                const i = SPINE_PALETTE.indexOf(box.spineColor);
                updateBox(box.id, { spineColor: SPINE_PALETTE[(i + 1) % SPINE_PALETTE.length] });
              }}
            >
              书皮
            </button>
            <button
              onClick={() => {
                const i = SIZES.indexOf(box.sizeScale ?? 1);
                updateBox(box.id, { sizeScale: SIZES[(i + 1) % SIZES.length] });
              }}
            >
              大小
            </button>
            <button
              onClick={() => {
                const cur = box.paper ?? 'plain';
                updateBox(box.id, { paper: PAPERS[(PAPERS.indexOf(cur) + 1) % PAPERS.length] });
              }}
            >
              纸张
            </button>
            <button onClick={() => startRename(box.id)}>重命名</button>
          </div>
        </Html>
      )}
    </group>
  );
}
