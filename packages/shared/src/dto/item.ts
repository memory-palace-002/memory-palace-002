import type { Transform } from './transform'

export interface CreateItemDTO {
  model_asset_id: string
  name?: string
  transform?: Transform
}

export interface UpdateTransformDTO {
  transform: Transform
}