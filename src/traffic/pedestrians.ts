import * as THREE from 'three'
import { batch, placeMovingPart, placeSegment, standard, tint } from './instancing'
import type { createMobilitySimulation } from './simulation'

type Pedestrians = ReturnType<ReturnType<typeof createMobilitySimulation>['snapshot']>['pedestrians']
const COATS = ['#606773', '#39384d', '#8e5951', '#b59b78', '#4e5f61', '#5d827a', '#8d576b', '#6c586f']
const TROUSERS = ['#353c4d', '#252d37', '#4c4350', '#51483e', '#3b4250']
const SKIN = ['#b58b77', '#be967f', '#976d60', '#c39a88', '#865c52', '#a77f6e']
const UMBRELLAS = ['#d0a28f', '#7b88b1', '#b56a78', '#2d5261', '#c3b8b2', '#518e91', '#5e536c', '#ca9665']

function umbrellaCanopy() {
  const positions: number[] = []
  const colors: number[] = []
  const nodes = [[0, .193], [.32, .116], [.51, -.012]]
  const shade = [1.06, .94, 1.02, .87, 1.025, .92, 1.01, .87]

  function vertex(row: number, angle: number, intensity: number, scallop: boolean) {
    const [radius, height] = nodes[row]
    positions.push(Math.sin(angle) * radius, height - (scallop && row === 2 ? .025 : 0), Math.cos(angle) * radius)
    colors.push(intensity, intensity, intensity)
  }

  for (let panel = 0; panel < shade.length; panel++) {
    for (let half = 0; half < 2; half++) {
      const start = ((panel + half / 2) * Math.PI * 2) / shade.length
      const end = ((panel + (half + 1) / 2) * Math.PI * 2) / shade.length
      const bright = shade[panel]
      const dark = bright * 0.88
      const first = half === 0 ? dark : bright
      const second = half === 0 ? bright : dark
      vertex(0, start, bright, false)
      vertex(1, start, first, half === 1)
      vertex(1, end, second, half === 0)
      vertex(1, start, first, half === 1)
      vertex(2, start, first * .94, half === 1)
      vertex(2, end, second * .94, half === 0)
      vertex(1, start, first, half === 1)
      vertex(2, end, second * .94, half === 0)
      vertex(1, end, second, half === 0)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildPedestrians(group: THREE.Group, pedestrians: Pedestrians) {
  const count = pedestrians.length
  const umbrellaCount = pedestrians.filter((pedestrian) => pedestrian.umbrella).length
  const coat = standard('#ffffff', .88)
  const skin = standard('#ffffff', .91)
  const segment = (upper: number, lower = upper) => new THREE.CylinderGeometry(upper, lower, 1, 7)
  const torso = batch(group, new THREE.CapsuleGeometry(.136, .224, 3, 8).scale(1.19, 1, .79), coat, count)
  const hips = batch(group, new THREE.CapsuleGeometry(.112, .018, 3, 7).scale(1.25, .73, .8), standard('#ffffff', .92), count)
  const head = batch(group, new THREE.SphereGeometry(.118, 9, 7).scale(.88, 1.12, .97), skin, count)
  const hair = batch(group, new THREE.SphereGeometry(.108, 8, 6, 0, Math.PI * 2, 0, Math.PI * .69).scale(1.04, 1.08, 1.11), standard('#292832', .96), count)
  const sleeves = batch(group, segment(.046, .039), coat, count * 2)
  const hands = batch(group, new THREE.SphereGeometry(.039, 7, 5), skin, count * 2)
  const thighs = batch(group, segment(.058, .047), standard('#ffffff', .91), count * 2)
  const ankles = batch(group, segment(.04, .048), standard('#ffffff', .9), count * 2)
  const shoes = batch(group, new THREE.SphereGeometry(.061, 7, 5).scale(.9, .59, 1.64), standard('#242a32', .72), count * 2)
  const umbrellas = batch(group, umbrellaCanopy(), new THREE.MeshStandardMaterial({
    roughness: .53, metalness: .09, side: THREE.DoubleSide, vertexColors: true,
  }), umbrellaCount)
  const umbrellaStems = batch(group, segment(.01), standard('#6a6670', .34, .72), umbrellaCount)
  const backpacks = batch(group, new THREE.CapsuleGeometry(.108, .102, 3, 7).scale(1.06, 1, .63), standard('#323845', .95), 4)
  const parts = [torso, hips, head, hair, sleeves, hands, thighs, ankles, shoes, umbrellas, umbrellaStems, backpacks]
  const world = new THREE.Object3D()
  let umbrellaIndex = 0
  for (const [index, pedestrian] of pedestrians.entries()) {
    const jacket = COATS[pedestrian.id % COATS.length]
    const pants = TROUSERS[pedestrian.id % TROUSERS.length]
    const face = SKIN[pedestrian.id % SKIN.length]
    tint(torso, index, jacket)
    tint(hips, index, pants)
    tint(head, index, face)
    for (let limb = 0; limb < 2; limb++) {
      const slot = index * 2 + limb
      tint(sleeves, slot, jacket)
      tint(hands, slot, face)
      tint(thighs, slot, pants)
      tint(ankles, slot, pants)
    }
    if (pedestrian.umbrella) tint(umbrellas, umbrellaIndex++, UMBRELLAS[pedestrian.id % UMBRELLAS.length])
  }

  return (states: Pedestrians, time: number) => {
    let umbrellaIndex = 0
    let backpackIndex = 0
    for (const [index, pedestrian] of states.entries()) {
      const { phase, stride, id } = pedestrian
      const swing = Math.sin(phase) * stride
      const bounce = Math.abs(Math.cos(phase)) * stride * .021
      const sway = Math.sin(phase) * stride * .015
      world.position.set(pedestrian.x, pedestrian.y, pedestrian.z)
      world.rotation.y = pedestrian.heading
      world.scale.setScalar(.89 + ((id * 3) % 7) * .028)
      world.updateMatrix()
      const frame = world.matrix
      placeMovingPart(torso, index, frame, [sway, .754 + bounce, -.012, .036, swing * -.16, swing * -.052])
      placeMovingPart(hips, index, frame, [sway * .7, .557 + bounce, -.012, 0, swing * .12])
      placeMovingPart(head, index, frame, [sway, 1.085 + bounce, .024])
      placeMovingPart(hair, index, frame, [sway, 1.117 + bounce, .012])
      for (let limb = 0; limb < 2; limb++) {
        const side = limb === 0 ? -1 : 1
        const slot = index * 2 + limb
        const legStep = swing * side
        const footY = .05 + Math.max(0, Math.cos(phase) * side) * stride * .102
        const footZ = legStep * .18
        const kneeZ = footZ * .53 + .035 + Math.max(0, -legStep) * .051
        placeSegment(thighs, slot, frame, sway * .5 + .086 * side, .557 + bounce, -.012, .092 * side, .303 + footY * .48, kneeZ)
        placeSegment(ankles, slot, frame, .092 * side, .303 + footY * .48, kneeZ, .09 * side, footY, footZ)
        placeMovingPart(shoes, slot, frame, [.09 * side, footY, footZ + .04, Math.min(0, legStep) * .34])
        const carriesUmbrella = pedestrian.umbrella && limb === 1
        const handX = side * (carriesUmbrella ? .221 : .166)
        const handY = (carriesUmbrella ? .873 : .562) + bounce
        const handZ = carriesUmbrella ? .203 : -legStep * .137
        placeSegment(sleeves, slot, frame, sway + side * .157, .88 + bounce, -.001, handX, handY, handZ)
        placeMovingPart(hands, slot, frame, [handX, handY, handZ])
      }
      if (pedestrian.umbrella) {
        const tilt = Math.sin(time * 1.35 + id) * .049 + sway * 2
        placeMovingPart(umbrellas, umbrellaIndex, frame, [.146 + sway, 1.295 + bounce, .136, .08, id * .9, tilt])
        placeSegment(umbrellaStems, umbrellaIndex++, frame, .221, .86 + bounce, .203, .146 + sway, 1.473 + bounce, .136)
      }
      if (id % 4 === 0) {
        placeMovingPart(backpacks, backpackIndex++, frame, [sway, .754 + bounce, -.126, .05, swing * -.09])
      }
    }
    for (const part of parts) part.instanceMatrix.needsUpdate = true
  }
}
