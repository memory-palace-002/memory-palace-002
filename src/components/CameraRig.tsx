import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { INITIAL_POSE, STAGE, useBookshelf } from '../store/bookshelf';
import { damp, reducedMotion } from '../lib/anim';

/**
 * closed 相位: OrbitControls 自由环绕;
 * opening/open: 接管相机飞到阅读机位; closing: 飞回原机位
 */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null!);
  const camera = useThree((s) => s.camera);
  const phase = useBookshelf((s) => s.phase);
  const dragging = useBookshelf((s) => !!s.drag);

  useFrame((_, dtRaw) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.05);
    // 拖拽物品期间冻结相机, 避免视角跟着转
    if (dragging) {
      c.enabled = false;
      return;
    }
    if (phase === 'closed') {
      c.enabled = true;
      c.enableDamping = true;
      return;
    }
    c.enabled = false;
    c.enableDamping = false;
    const goal = phase === 'closing' ? INITIAL_POSE : STAGE;
    const l = reducedMotion ? 1000 : 5;
    camera.position.x = damp(camera.position.x, goal.position[0], l, dt);
    camera.position.y = damp(camera.position.y, goal.position[1], l, dt);
    camera.position.z = damp(camera.position.z, goal.position[2], l, dt);
    c.target.x = damp(c.target.x, goal.target[0], l, dt);
    c.target.y = damp(c.target.y, goal.target[1], l, dt);
    c.target.z = damp(c.target.z, goal.target[2], l, dt);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={INITIAL_POSE.target}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.5}
      maxDistance={6}
      minPolarAngle={0.5}
      maxPolarAngle={1.52}
    />
  );
}
