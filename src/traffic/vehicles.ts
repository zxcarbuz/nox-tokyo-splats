import * as THREE from 'three'
import { batch, placePart, standard, staticPose, tint } from './instancing'
import type { createMobilitySimulation } from './simulation'

type Cars = ReturnType<ReturnType<typeof createMobilitySimulation>['snapshot']>['cars']

const BODY_COLORS = [
  '#3d5461', '#b24d43', '#d7cfc0', '#3c5764', '#585462', '#9aa0a6', '#c47443',
  '#9eaeaf', '#213e49', '#5a5361', '#79514c', '#c7c3b9', '#d8dad0', '#4f7173',
]
const TAXIS = new Set([2, 8, 13])

function bodyProfile(points: [number, number][], width: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
  })
  return geometry.rotateY(-Math.PI / 2).translate(width / 2, 0, 0)
}

function headlightProjection() {
  const vertices = new Float32Array([-.41, .023, .83, .41, .023, .83, 1.16, .023, 4.4, -1.16, .023, 4.4])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 2, 1, 0, 3, 2])
  return geometry
}

function carShadow() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float d = length((vUv - .5) * 2.0);
        gl_FragColor = vec4(.014, .018, .025, .53 * (1.0 - smoothstep(.38, 1.0, d)));
      }`,
  })
  const geometry = new THREE.PlaneGeometry(1.54, 2.48).rotateX(-Math.PI / 2).translate(0, .006, 0)
  return { geometry, material }
}

export function buildVehicles(group: THREE.Group, cars: Cars) {
  const count = cars.length
  const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
  const dark = standard('#20272d', .77)
  const headlamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, .78, .53).multiplyScalar(3.1) })
  const taillamp = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const tireGeometry = new THREE.CylinderGeometry(.168, .168, .115, 12).rotateZ(Math.PI / 2)
  const wheelHub = new THREE.CylinderGeometry(.091, .091, .125, 10).rotateZ(Math.PI / 2)
  const body = batch(group, bodyProfile([
    [-.88, .17], [.9, .17], [.94, .36], [.81, .43], [.21, .48], [-.53, .47], [-.85, .41], [-.92, .31],
  ], .75, .052), standard('#ffffff', .28, .31), count)
  const glass = batch(group, bodyProfile([
    [-.65, .45], [.54, .45], [.21, .77], [-.37, .78], [-.52, .69],
  ], .59, .025), standard('#273842', .22, .45), count)
  const roof = batch(group, bodyProfile([
    [-.39, .755], [.21, .755], [.16, .79], [-.36, .798],
  ], .56, .023), standard('#ffffff', .29, .24), count)
  const frame = batch(group, box(.66, .152, .042), dark, count * 2)
  const tires = batch(group, tireGeometry, standard('#171d24', .92), count * 4)
  const hubs = batch(group, wheelHub, standard('#738087', .45, .54), count * 4)
  const headlights = batch(group, box(.213, .083, .032), headlamp, count * 2)
  const taillights = batch(group, box(.205, .073, .033), taillamp, count * 2)
  const sideMirrors = batch(group, box(.115, .063, .096), dark, count * 2)
  const doors = batch(group, box(.692, .242, .032), standard('#272d34', .31, .18), count)
  const cabSigns = batch(group, box(.28, .073, .11), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, .94, .39) }), TAXIS.size)
  const shadow = carShadow()
  const shadows = batch(group, shadow.geometry, shadow.material, count)
  const groundBeam = batch(group, headlightProjection(), new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float spread = abs(vUv.x - .5) * 2.0;
        float fade = pow(1.0 - vUv.y, 2.1) * smoothstep(0.0, .12, vUv.y);
        float edge = 1.0 - smoothstep(.35, 1.0, spread);
        gl_FragColor = vec4(.82, .65, .48, fade * edge * .34);
      }`,
  }), count)

  for (const [index, car] of cars.entries()) {
    tint(body, index, BODY_COLORS[car.id])
    tint(roof, index, BODY_COLORS[car.id])
  }

  const origin = staticPose([0, 0, 0])
  const bumpers = [staticPose([0, .23, .962]), staticPose([0, .23, -.944])]
  const pillars = staticPose([0, .619, -.115, .02])
  const taxiSign = staticPose([0, .856, -.06])
  const headlightPoses = [-.291, .291].map((x) => staticPose([x, .362, .981]))
  const taillightPoses = [-.276, .276].map((x) => staticPose([x, .347, -.968]))
  const mirrorPoses = [-.434, .434].map((x) => staticPose([x, .573, .285]))
  const axlePoses = [-.57, .58].flatMap((z) => [-.392, .392].map((x) => staticPose([x, .168, z])))
  const mainParts = [body, glass, roof, shadows, groundBeam]
  const allParts = [...mainParts, frame, tires, hubs, headlights, taillights, sideMirrors, doors, cabSigns]
  const world = new THREE.Object3D()
  const brakeLights = new Array<boolean>(count)

  return (states: Cars) => {
    let taxiIndex = 0
    let updateBrakeLights = false
    for (const [index, car] of states.entries()) {
      world.position.set(car.x, car.y, car.z)
      world.rotation.y = car.heading
      world.scale.set(.9 + (car.id % 4) * .031, .95 + ((car.id * 7) % 5) * .069, .92 + (car.id % 3) * .048)
      world.updateMatrix()
      for (const part of mainParts) placePart(part, index, world.matrix, origin)
      for (let offset = 0; offset < axlePoses.length; offset++) {
        placePart(tires, index * 4 + offset, world.matrix, axlePoses[offset])
        placePart(hubs, index * 4 + offset, world.matrix, axlePoses[offset])
      }
      for (let offset = 0; offset < 2; offset++) {
        const slot = index * 2 + offset
        placePart(frame, slot, world.matrix, bumpers[offset])
        placePart(headlights, slot, world.matrix, headlightPoses[offset])
        placePart(taillights, slot, world.matrix, taillightPoses[offset])
        placePart(sideMirrors, slot, world.matrix, mirrorPoses[offset])
        if (brakeLights[index] !== car.braking) {
          tint(taillights, slot, '#ff3221', car.braking ? 2.1 : .95)
          updateBrakeLights = true
        }
      }
      brakeLights[index] = car.braking
      placePart(doors, index, world.matrix, pillars)
      if (TAXIS.has(car.id)) placePart(cabSigns, taxiIndex++, world.matrix, taxiSign)
    }
    for (const part of allParts) part.instanceMatrix.needsUpdate = true
    if (updateBrakeLights && taillights.instanceColor) taillights.instanceColor.needsUpdate = true
  }
}
