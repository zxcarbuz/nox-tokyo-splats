import * as THREE from 'three'

type Pose = [x: number, y: number, z: number, rx?: number, ry?: number, rz?: number]
export type Batch = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>

const local = new THREE.Object3D()
const combined = new THREE.Matrix4()
const up = new THREE.Vector3(0, 1, 0)
const segment = new THREE.Vector3()
const instanceColor = new THREE.Color()

export function batch(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, count: number): Batch {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  parent.add(mesh)
  return mesh
}

export function staticPose(pose: Pose): THREE.Matrix4 {
  const [x, y, z, rx = 0, ry = 0, rz = 0] = pose
  local.position.set(x, y, z)
  local.rotation.set(rx, ry, rz)
  local.scale.set(1, 1, 1)
  local.updateMatrix()
  return local.matrix.clone()
}

export function placePart(mesh: Batch, index: number, world: THREE.Matrix4, pose: THREE.Matrix4) {
  mesh.setMatrixAt(index, combined.multiplyMatrices(world, pose))
}

export function placeMovingPart(mesh: Batch, index: number, world: THREE.Matrix4, pose: Pose) {
  const [x, y, z, rx = 0, ry = 0, rz = 0] = pose
  local.position.set(x, y, z)
  local.rotation.set(rx, ry, rz)
  local.scale.set(1, 1, 1)
  local.updateMatrix()
  placePart(mesh, index, world, local.matrix)
}

export function placeSegment(
  mesh: Batch,
  index: number,
  world: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  endX: number,
  endY: number,
  endZ: number,
) {
  local.position.set((x + endX) / 2, (y + endY) / 2, (z + endZ) / 2)
  segment.set(endX - x, endY - y, endZ - z)
  local.scale.set(1, segment.length(), 1)
  local.quaternion.setFromUnitVectors(up, segment.normalize())
  local.updateMatrix()
  placePart(mesh, index, world, local.matrix)
}

export function standard(color: THREE.ColorRepresentation, roughness = 0.66, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

export function tint(mesh: Batch, index: number, color: THREE.ColorRepresentation, brightness = 1) {
  mesh.setColorAt(index, instanceColor.set(color).multiplyScalar(brightness))
}
