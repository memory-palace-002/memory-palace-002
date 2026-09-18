import * as THREE from 'three';

/** 悬停时书绕装订棱旋转角(弧度, 约 -77°) */
export const HOVER_ANGLE = -1.35;
/** 打开时封面绕装订棱摊开角(弧度, 约 -166°) */
export const OPEN_ANGLE = -2.9;
/** 打开时书身转向镜头的角度 */
export const BOOK_FACE_ANGLE = -Math.PI / 2;
/** 书飞到展示位后, 延迟多久开始摊开封面(ms) */
export const OPEN_LIFT_DELAY = 380;
/** 打开动画总时长(ms), 到时进入 open 相位 */
export const OPEN_DURATION = 950;
/** 关闭动画总时长(ms) */
export const CLOSE_DURATION = 800;
/** 书架上书与书的间距 */
export const SHELF_GAP = 0.035;

export const reducedMotion =
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const LAMBDA = reducedMotion ? 1000 : 6.5;

/** 指针视差状态: Book(打开时)写入, Object2p5D 读取做反向补偿 */
export const parallax = { x: 0, y: 0 };

export function damp(current: number, target: number, lambda = LAMBDA, dt = 1 / 60) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/** 稳定伪随机: 同一 id 永远返回同一个 [-1,1] 值, 用于书本尺寸/照片微旋转 */
export function seededRand(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 2000) / 1000) - 1;
}
