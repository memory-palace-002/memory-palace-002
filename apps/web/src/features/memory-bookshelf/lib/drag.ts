import * as THREE from 'three'

export const dragRuntime = { pos: new THREE.Vector3() }

/** 房间地板：本仓库 Room25D 的地板同样在 y=0，直接复用同一水平面 */
export const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export const dragRuntimeLift = { value: 0 }

// 松手后，物件从当前位置飞到落点的起始时间和起点
export const dropAnim = {
  active: false,
  startTime: 0,
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  duration: 320, // 毫秒
}
