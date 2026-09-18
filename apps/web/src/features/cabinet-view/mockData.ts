import type { CabinetDetailVO } from '@memory-palace/shared'

export const PLANE_HEIGHT = 0.45

export const MOCK_CABINET: CabinetDetailVO = {
  cabinet: {
    id: 'cab-001',
    period_type: 'monthly',
    period_key: '2026-09',
    name: '九月的角落',
    status: 'active',
    item_count: 1,
    model: { display_mode: 'glb', url: '/placeholder/cabinet.glb' },
    is_full: false,
  },
  items: [
    {
      id: 'item-001',
      cabinet_id: 'cab-001',
      name: '我的杯子',
      owner: { id: 'u1', nickname: '我' },
      display_mode: 'glb',
      model: { display_mode: 'glb', url: '/placeholder/item-cup.glb' },
      // 屏幕正中间：相机在 [0, 2, 5] 看向原点，x=0/z=0 即画面中心；
      // rotation 归零让标签正对镜头；scale 放大让杯子在画面里完整醒目
      transform: { position: [0, PLANE_HEIGHT, 0], rotation: [0, 0, 0], scale: 2 },
      blurb: {
        content: '这是我用了三年的杯子，杯口有一道小缺口。每天早上我都用它泡一杯咖啡，然后坐在窗边发呆。',
        source: 'agent_ai',
        updated_at: '2026-09-13T10:00:00Z',
      },
    },
  ],
}