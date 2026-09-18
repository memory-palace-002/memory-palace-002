import type { ThreeEvent } from '@react-three/fiber';
import { useBookshelf } from '../store/bookshelf';
import { isTap } from '../lib/pointer';

/** 房间与书柜: 地板、背墙、侧板、背板、三层木板 */
export function Room() {
  const phase = useBookshelf((s) => s.phase);
  const closeBook = useBookshelf((s) => s.closeBook);

  // 打开书本时, 点击房间任意空白处关闭
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (phase !== 'open' || !isTap(e.clientX, e.clientY)) return;
    e.stopPropagation();
    closeBook();
  };

  return (
    <group onClick={onClick}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 12]} />
        <meshStandardMaterial color="#b39470" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2, -2.62]}>
        <planeGeometry args={[14, 4.4]} />
        <meshStandardMaterial color="#cdb78f" roughness={0.95} />
      </mesh>
      <group position={[0, 0, -2.35]}>
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 1.1, 0]}>
            <boxGeometry args={[0.06, 1.56, 0.36]} />
            <meshStandardMaterial color="#6e5236" roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 1.1, -0.17]}>
          <boxGeometry args={[1.76, 1.56, 0.03]} />
          <meshStandardMaterial color="#5d4530" roughness={0.85} />
        </mesh>
        {[0.55, 1.08, 1.61].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[1.7, 0.045, 0.36]} />
            <meshStandardMaterial color="#8a6642" roughness={0.65} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
