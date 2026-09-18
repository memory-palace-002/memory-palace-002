import type { Transform } from './transform'

export type DisplayMode = 'glb' | 'photo_360'
export type CabinetStatus = 'active' | 'full' | 'archived'

export interface CabinetItemVO {
  id: string
  name: string
  owner: { id: string; nickname: string }
  display_mode: DisplayMode
  model: { url?: string; thumbnail_url?: string }
  transform: Transform
  blurb: { content: string; source: string; updated_at: string } | null
}

export interface CabinetDetailVO {
  cabinet: {
    id: string
    period_type: 'monthly' | 'quarterly' | 'yearly'
    period_key: string
    name: string | null
    status: CabinetStatus
    item_count: number
    model: { display_mode: DisplayMode; url?: string }
    is_full: boolean
  }
  items: CabinetItemVO[]
}