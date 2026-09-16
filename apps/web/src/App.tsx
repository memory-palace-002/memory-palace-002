import { BrowserRouter, Route, Routes } from "react-router-dom"
import { CabinetViewScreen } from "./features/cabinet-view/CabinetViewScreen"
import { PlaceEditScreen } from "./features/place-edit/PlaceEditScreen"
import MemoryRoom3D from "./features/memory-room3d/MemoryRoom3D"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cabinets/:id/view" element={<CabinetViewScreen />} />
        <Route path="/cabinets/:id/place" element={<PlaceEditScreen />} />
        <Route path="/memory-room3d" element={<MemoryRoom3D />} />
      </Routes>
    </BrowserRouter>
  )
}
