import { BrowserRouter, Route, Routes } from "react-router-dom"
import { CabinetViewScreen } from "./features/cabinet-view/CabinetViewScreen"
import { PlaceEditScreen } from "./features/place-edit/PlaceEditScreen"
import MemoryRoom3D from "./features/memory-room3d/MemoryRoom3D"
import ScanPage from "./features/scan/pages/ScanPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cabinets/:id/view" element={<CabinetViewScreen />} />
        <Route path="/cabinets/:id/place" element={<PlaceEditScreen />} />
        <Route path="/memory-room3d" element={<MemoryRoom3D />} />
        {/* 手机端拍摄页：电脑端生成的二维码指向这个地址（/scan?session=xxx）。
            调摄像头要求安全上下文，localhost 或 HTTPS 均可。 */}
        <Route path="/scan" element={<ScanPage />} />
      </Routes>
    </BrowserRouter>
  )
}
