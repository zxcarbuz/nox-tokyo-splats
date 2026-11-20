import * as THREE from 'three'
import { batch, placePart, standard, staticPose, tint } from './instancing'
import { SIDES } from './routes'
import type { SignalState, VehiclePhase } from './simulation'

const VEHICLE_COLORS = ['#ff3a36', '#ffba58', '#43e589']
const ACTIVE_INDEX: Record<VehiclePhase, number> = { red: 0, yellow: 1, green: 2 }

function pedestrianIcon(walking: boolean) {
  const silhouette = walking
    ? [[-.012, .025], [.016, .018], [.026, -.01], [.061, -.025], [.055, -.039], [.013, -.025], [.008, -.041], [.05, -.069], [.045, -.086], [-.009, -.057], [-.037, -.09], [-.052, -.082], [-.027, -.042], [-.02, -.011], [-.045, -.022], [-.05, -.005]]
    : [[-.023, .025], [.023, .025], [.036, .016], [.04, -.033], [.025, -.036], [.018, -.01], [.018, -.083], [.004, -.083], [0, -.042], [-.005, -.083], [-.018, -.083], [-.018, -.01], [-.026, -.036], [-.041, -.032], [-.034, .016]]
  const body = new THREE.Shape(silhouette.map(([x, y]) => new THREE.Vector2(x, y)))
  const head = new THREE.Shape()
  head.absarc(walking ? .015 : 0, .043, .013, 0, Math.PI * 2, false)
  return new THREE.ShapeGeometry([body, head], 5)
}

export function buildSignals(group: THREE.Group) {
  const count = SIDES.length * 2
  const basic = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  const dark = standard('#283639', .64, .38)
  const polarArm = new THREE.CylinderGeometry(.021, .021, .265, 8).rotateX(Math.PI / 2)
  const pole = batch(group, new THREE.CylinderGeometry(.031, .045, 2.32, 8), dark, count)
  const base = batch(group, new THREE.CylinderGeometry(.075, .084, .16, 8), dark, count)
  const arm = batch(group, polarArm, dark, count)
  const vehicleHousing = batch(group, new THREE.BoxGeometry(.205, .455, .134), dark, count)
  const pedestrianHousing = batch(group, new THREE.BoxGeometry(.195, .222, .115), dark, count)
  const lens = batch(group, new THREE.CircleGeometry(.056, 12), basic, count * 3)
  const hood = batch(group, new THREE.CylinderGeometry(.079, .074, .073, 12, 1, true, -.15, Math.PI + .3).rotateX(-Math.PI / 2), dark, count * 3)
  const panel = batch(group, new THREE.PlaneGeometry(.15, .173), new THREE.MeshBasicMaterial({ color: '#182729' }), count)
  const walk = batch(group, pedestrianIcon(true), new THREE.MeshBasicMaterial({
    color: new THREE.Color('#4affb5').multiplyScalar(3.4),
  }), count)
  const wait = batch(group, pedestrianIcon(false), new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ff524d').multiplyScalar(3.2),
  }), count)
  const staticParts = [pole, base, arm, vehicleHousing, pedestrianHousing, lens, hood, panel]
  const previous = new Array<string>(SIDES.length)
  const vehicleFace = staticPose([0, 0, .068])
  const pedestrianFace = staticPose([0, 0, .058])
  const pedestrianSymbol = staticPose([0, .012, .119])
  const panelOffset = staticPose([0, 0, .118])
  const lensPositions = [.137, 0, -.137].map((y) => staticPose([0, y, .143]))
  const hoodPositions = [.137, 0, -.137].map((y) => staticPose([0, y, .17]))
  const root = new THREE.Matrix4()
  const symbols: THREE.Matrix4[] = []
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

  for (let side = 0; side < SIDES.length; side++) {
    const rotation = side * Math.PI / 2
    const tx = Math.cos(rotation)
    const tz = Math.sin(rotation)
    const ox = tz
    const oz = -tx

    for (let curb = 0; curb < 2; curb++) {
      const index = side * 2 + curb
      const direction = curb === 0 ? 1 : -1
      const edge = curb === 0 ? 13.28 : 8.5
      const poleX = ox * edge - tx * direction * 1.86
      const poleZ = oz * edge - tz * direction * 1.86
      pole.setMatrixAt(index, staticPose([poleX, 1.3, poleZ]))
      base.setMatrixAt(index, staticPose([poleX, .188, poleZ]))
      const inwardX = -ox * direction
      const inwardZ = -oz * direction
      const pedestrianYaw = Math.atan2(inwardX, inwardZ)
      const vehicleYaw = Math.atan2(-tx * direction, -tz * direction)
      arm.setMatrixAt(index, staticPose([poleX + inwardX * .13, 2.215, poleZ + inwardZ * .13, 0, pedestrianYaw]))
      root.copy(staticPose([poleX + inwardX * .25, 2.215, poleZ + inwardZ * .25, 0, vehicleYaw]))
      placePart(vehicleHousing, index, root, vehicleFace)
      for (let light = 0; light < 3; light++) {
        placePart(lens, index * 3 + light, root, lensPositions[light])
        placePart(hood, index * 3 + light, root, hoodPositions[light])
      }
      root.copy(staticPose([poleX + inwardX * .033, 1.36, poleZ + inwardZ * .033, 0, pedestrianYaw]))
      placePart(pedestrianHousing, index, root, pedestrianFace)
      placePart(panel, index, root, panelOffset)
      symbols.push(root.clone().multiply(pedestrianSymbol))
    }
  }
  for (const part of staticParts) part.instanceMatrix.needsUpdate = true

  return (signals: SignalState[]) => {
    let changed = false
    for (const [side, signal] of signals.entries()) {
      const state = `${signal.vehicle}-${signal.pedestrian}`
      if (previous[side] === state) continue
      previous[side] = state
      changed = true
      for (let curb = 0; curb < 2; curb++) {
        const index = side * 2 + curb
        for (let light = 0; light < 3; light++) {
          tint(lens, index * 3 + light, VEHICLE_COLORS[light], light === ACTIVE_INDEX[signal.vehicle] ? 3.7 : .047)
        }
        walk.setMatrixAt(index, signal.pedestrian ? symbols[index] : hidden)
        wait.setMatrixAt(index, signal.pedestrian ? hidden : symbols[index])
      }
    }
    if (changed) {
      if (lens.instanceColor) lens.instanceColor.needsUpdate = true
      walk.instanceMatrix.needsUpdate = true
      wait.instanceMatrix.needsUpdate = true
    }
  }
}
