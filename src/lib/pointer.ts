/** 区分"点击"与"拖拽环绕": pointerdown 记录位置, click 时比较位移 */
let downX = 0;
let downY = 0;

export function pointerDown(x: number, y: number) {
  downX = x;
  downY = y;
}

export function isTap(x: number, y: number, threshold = 6): boolean {
  return Math.hypot(x - downX, y - downY) < threshold;
}
