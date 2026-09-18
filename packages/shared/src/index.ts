export * from './types';
export * from './period';
export * from './blurbPrompt';

// 板块③④（feature-room-final）合并增量：柜子/物品 DTO 契约
// 注意：Transform / CabinetDetailVO / CabinetStatus / DisplayMode / ErrorCode
// 与 types.ts 中的定义重名（两分支各写了一套，保留 types.ts 为唯一真源），
// 因此这里不再整包 `export *`，只补充 types.ts 没有的增量类型，
// 避免星号导出二义性（TS2308）。
export { DEFAULT_TRANSFORM } from './dto/transform';
export type { CabinetItemVO } from './dto/cabinet';
export type { CreateItemDTO, UpdateTransformDTO } from './dto/item';
