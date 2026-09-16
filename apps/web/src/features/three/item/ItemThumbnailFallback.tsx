import { Html } from '@react-three/drei'
export function ItemThumbnailFallback({ position }: { position: [number, number, number] }) {
  return (
    <Html position={position} center>
      <div style={{ padding: 6, background: '#fff8ef', borderRadius: 8, fontSize: 12 }}>加载失败</div>
    </Html>
  )
}