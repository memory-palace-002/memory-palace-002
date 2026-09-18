import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useBookshelf } from '../store/bookshelf';
import { damp, reducedMotion } from '../lib/anim';

/**
 * 场景灯光: 打开书本时环境光减弱(背景变暗),
 * 同时一盏聚光打在摊开的书上, 形成"只照亮这本书"的效果
 */
export function Lights() {
  const ambient = useRef<THREE.AmbientLight>(null!);
  const dir1 = useRef<THREE.DirectionalLight>(null!);
  const dir2 = useRef<THREE.DirectionalLight>(null!);
  const point = useRef<THREE.PointLight>(null!);
  const bookLight = useRef<THREE.PointLight>(null!);
  const phase = useBookshelf((s) => s.phase);
  const scene = useThree((s) => s.scene);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const k = reducedMotion ? 1000 : 5;
    const dim = phase !== 'closed';
    ambient.current.intensity = damp(ambient.current.intensity, dim ? 0.22 : 0.85, k, dt);
    dir1.current.intensity = damp(dir1.current.intensity, dim ? 0.25 : 1.05, k, dt);
    dir2.current.intensity = damp(dir2.current.intensity, dim ? 0.08 : 0.3, k, dt);
    point.current.intensity = damp(point.current.intensity, dim ? 0.12 : 0.5, k, dt);
    bookLight.current.intensity = damp(bookLight.current.intensity, dim ? 3.2 : 0, k, dt);
    const bg = scene.background as THREE.Color | null;
    if (bg) {
      const t = dim ? 0.24 : 0.9;
      bg.r = damp(bg.r, t, k, dt);
      bg.g = damp(bg.g, dim ? 0.2 : 0.85, k, dt);
      bg.b = damp(bg.b, dim ? 0.16 : 0.74, k, dt);
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.85} />
      <directionalLight ref={dir1} position={[2.5, 4, 2.5]} intensity={1.05} color="#fff2dd" />
      <directionalLight ref={dir2} position={[-3, 2.5, -1]} intensity={0.3} color="#d8e2ff" />
      <pointLight ref={point} position={[1.2, 2.4, 0.2]} intensity={0.5} color="#ffd9a0" distance={5} />
      <pointLight ref={bookLight} position={[0, 2, 0.2]} intensity={0} color="#fff2dd" distance={4} />
    </>
  );
}
