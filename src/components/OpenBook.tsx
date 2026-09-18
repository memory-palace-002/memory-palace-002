import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import type { CollectionItem } from '../data/boxes';
import { useBookshelf } from '../store/bookshelf';
import { parallax, reducedMotion, seededRand } from '../lib/anim';
import { isTap } from '../lib/pointer';
import { labelTexture, noteCardTexture, paperTexture, shadowTexture, voiceCardTexture } from '../lib/textures';

interface SurfaceProps {
  side: 'left' | 'right';
  boxId: string;
  items: CollectionItem[];
  width: number;
  height: number;
  paper: 'plain' | 'lined' | 'aged';
  canTurn: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
}

/** 摊开后的一页: 纸面(可点击翻页) + 内容(照片 / 2.5D 物件 / 语音 / 文字 / 已取出倒影) */
export function PageSurface({
  side,
  boxId,
  items,
  width,
  height,
  paper,
  canTurn,
  position,
  rotation,
  visible,
}: SurfaceProps) {
  const phase = useBookshelf((s) => s.phase);
  const setPage = useBookshelf((s) => s.setPage);
  const page = useBookshelf((s) => s.currentPage);
  const surfaceRef = useRef<THREE.Mesh>(null!);
  const paperMap = useMemo(() => (paper === 'plain' ? null : paperTexture(paper)), [paper]);

  // 点击书页空白处翻页: 右半页下一页, 左半页上一页(页数无上限)
  const onPageClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!canTurn || phase !== 'open' || !isTap(e.clientX, e.clientY)) return;
    const local = surfaceRef.current.worldToLocal(e.point.clone());
    const dir = local.x > 0 ? 1 : -1;
    setPage(Math.max(0, page + (side === 'right' ? dir : -dir)));
  };

  return (
    <group position={position} rotation={rotation} visible={visible}>
      <mesh ref={surfaceRef} onClick={onPageClick}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color={paper === 'plain' ? '#f6efdd' : '#ffffff'}
          map={paperMap ?? undefined}
          roughness={0.92}
        />
      </mesh>
      {items.map((item, i) => (
        <Pop key={`${boxId}-${item.id}`} delay={i * 90}>
          <ItemView boxId={boxId} item={item} index={i} side={side} width={width} height={height} />
        </Pop>
      ))}
    </group>
  );
}

/** 入场弹出动画(翻页时重新挂载即重播) */
function Pop({ delay, children }: { delay: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    if (start.current === null) start.current = now + delay;
    const s = reducedMotion ? 1 : Math.min(1, Math.max(0, now - start.current) / 280);
    ref.current.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - s, 3)));
  });
  return <group ref={ref}>{children}</group>;
}

function ItemView({ boxId, item, index, side, width, height }: {
  boxId: string;
  item: CollectionItem;
  index: number;
  side: 'left' | 'right';
  width: number;
  height: number;
}) {
  const phase = useBookshelf((s) => s.phase);
  const beginDrag = useBookshelf((s) => s.beginDrag);

  const isCard = item.kind === 'voice' || item.kind === 'note';
  const w = isCard
    ? Math.min(width * 0.55, height * 0.46)
    : item.kind === 'photo'
      ? Math.min(width * 0.52, height * 0.42)
      : width * 0.5;
  const h = item.kind === 'photo' ? w * 0.75 : w;
  const x = (side === 'left' ? -1 : 1) * width * 0.02;
  const y = index === 0 ? height * 0.21 : -height * 0.25;
  const rotZ = isCard ? 0 : seededRand(item.id, 2) * 0.1;

  // 物件被取出后, 书内留一个淡淡的反影, 点击可放回
  if (item.extracted) {
    return (
      <group position={[x, y, 0.004]}>
        <GhostView boxId={boxId} item={item} size={w} />
      </group>
    );
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (phase !== 'open') return;
    beginDrag(boxId, item.id, e.clientX, e.clientY);
  };

  return (
    <group
      position={[x, y, 0.004]}
      rotation={[0, 0, rotZ]}
      onPointerDown={onPointerDown}
      onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
    >
      <ItemVisual item={item} w={w} h={h} />
      {item.caption && (
        <mesh position={[0, -h / 2 - 0.024, 0.003]}>
          <planeGeometry args={[w, w * 0.19]} />
          <meshBasicMaterial map={labelTexture(item.caption)} transparent />
        </mesh>
      )}
    </group>
  );
}

/** 按条目类型选择视觉: photo 相纸 / object 2.5D / voice 波形卡 / note 文字卡 */
function ItemVisual({ item, w, h }: { item: CollectionItem; w: number; h: number }) {
  if (item.kind === 'voice') {
    return (
      <mesh>
        <planeGeometry args={[w, w]} />
        <meshStandardMaterial
          map={voiceCardTexture(item.caption ?? '语音', item.duration ?? '0:30')}
          roughness={0.7}
        />
      </mesh>
    );
  }
  if (item.kind === 'note') {
    return (
      <mesh>
        <planeGeometry args={[w, w]} />
        <meshStandardMaterial map={noteCardTexture(item.text ?? item.caption ?? '')} roughness={0.85} />
      </mesh>
    );
  }
  if (item.kind === 'object') {
    return <ObjectView src={item.src!} size={w} />;
  }
  return <PhotoView src={item.src!} w={w} h={h} />;
}

function PhotoView({ src, w, h }: { src: string; w: number; h: number }) {
  const tex = useTexture(src);
  if (!tex.userData.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.srgb = true;
  }
  return (
    <>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w * 1.16, h * 1.16]} />
        <meshStandardMaterial color="#fffdf4" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </>
  );
}

/** 已取出条目在书内留下的倒影, 点击放回 */
function GhostView({ boxId, item, size }: { boxId: string; item: CollectionItem; size: number }) {
  const returnItem = useBookshelf((s) => s.returnItem);
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (isTap(e.clientX, e.clientY)) returnItem(boxId, item.id);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <SpriteView item={item} size={size} opacity={0.16} interactive={false} />
      <mesh position={[0, -size / 2 - 0.024, 0.001]}>
        <planeGeometry args={[size * 1.25, size * 0.19]} />
        <meshBasicMaterial map={labelTexture('已取出 · 点击放回')} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** 竖立条目 sprite: opacity<1 时为倒影形态(房间物品与书内倒影共用) */
export function SpriteView({ item, size, opacity, interactive }: {
  item: CollectionItem;
  size: number;
  opacity: number;
  interactive: boolean;
}) {
  const ghost = opacity < 1;
  return (
    <group>
      {item.src ? (
        <SpriteTex src={item.src} size={size} opacity={opacity} ghost={ghost} />
      ) : (
        <mesh>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial
            map={item.kind === 'voice'
              ? voiceCardTexture(item.caption ?? '语音', item.duration ?? '0:30')
              : noteCardTexture(item.text ?? '')}
            transparent
            opacity={opacity}
            depthWrite={!ghost}
          />
        </mesh>
      )}
      <mesh position={[0, -size * 0.42, -0.002]}>
        <planeGeometry args={[size * 1.05, size * 0.3]} />
        <meshBasicMaterial
          map={shadowTexture()}
          transparent
          opacity={interactive ? 0.4 : 0.15}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SpriteTex({ src, size, opacity, ghost }: {
  src: string;
  size: number;
  opacity: number;
  ghost: boolean;
}) {
  const tex = useTexture(src);
  if (!tex.userData.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.srgb = true;
  }
  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={tex}
        transparent
        opacity={opacity}
        alphaTest={ghost ? 0 : 0.08}
        depthWrite={!ghost}
        side={THREE.DoubleSide}
        roughness={0.6}
      />
    </mesh>
  );
}

/**
 * 2.5D 立体物件: 透明背景图贴在竖立平面上, 立在纸面上方,
 * 脚下垫椭圆软阴影; 整书倾斜时物件反向补偿, 产生立体视差
 */
function ObjectView({ src, size }: { src: string; size: number }) {
  const tex = useTexture(src);
  if (!tex.userData.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.srgb = true;
  }
  const ref = useRef<THREE.Group>(null!);
  const shadow = useMemo(() => shadowTexture(), []);
  const phase = useMemo(() => seededRand(src, 3) * 6.28, [src]);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 1.7 + phase) * 0.005;
    ref.current.rotation.y = -parallax.y * 1.8;
    ref.current.rotation.x = -parallax.x * 1.4;
    ref.current.rotation.z = parallax.y * 0.8;
  });
  return (
    <group>
      <mesh position={[0, -size * 0.42, -0.002]}>
        <planeGeometry args={[size * 1.05, size * 0.3]} />
        <meshBasicMaterial map={shadow} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <group ref={ref}>
        <mesh>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial
            map={tex}
            transparent
            alphaTest={0.08}
            side={THREE.DoubleSide}
            roughness={0.6}
          />
        </mesh>
      </group>
    </group>
  );
}
