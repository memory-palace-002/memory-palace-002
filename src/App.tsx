import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Room } from './components/Room';
import { ShelfRows } from './components/Bookshelf';
import { CameraRig } from './components/CameraRig';
import { ClickGuard } from './components/ClickGuard';
import { Overlay } from './components/Overlay';
import { Lights } from './components/Lights';
import { ExtractedLayer } from './components/ExtractedLayer';
import { DragController } from './components/DragController';
import { INITIAL_POSE, useBookshelf } from './store/bookshelf';

export default function App() {
  const closeBook = useBookshelf((s) => s.closeBook);
  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        flat
        camera={{ position: INITIAL_POSE.position, fov: 45, near: 0.05, far: 50 }}
        gl={{ antialias: true }}
        onCreated={(state) => {
          (window as any).__r3f = state;
        }}
        onPointerMissed={() => closeBook()}
      >
        <color attach="background" args={['#e6d9bd']} />
        <fog attach="fog" args={['#e6d9bd', 8, 16]} />
        <Lights />
        <Suspense fallback={null}>
          <Room />
          <ShelfRows />
          <ExtractedLayer />
          <ClickGuard />
        </Suspense>
        <CameraRig />
      </Canvas>
      <div className="brand">
        <strong>记忆书柜</strong>
        <small>悬停抽出翻面 · 点击摊开 · 拖动物品取出</small>
      </div>
      <Overlay />
      <DragController />
    </div>
  );
}
