import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Splats } from '../src/splats/splats'

type SplatMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>

function meshIn(scene: THREE.Scene): SplatMesh {
  return scene.children[0] as SplatMesh
}

function indicesOf(mesh: SplatMesh): number[] {
  const { array } = mesh.geometry.getAttribute('aSplatIndex')
  return Array.from(array.slice(0, mesh.geometry.instanceCount))
}

function addPoint(splats: Splats, x: number, y: number, z: number): void {
  splats.add(x, y, z, 1, 1, 1, 0xffffff, 0.6)
}

describe('Gaussian splat rendering data', () => {
  it('packs the anisotropic world radii and decodes sRGB colors', () => {
    const scene = new THREE.Scene()
    const splats = new Splats()
    splats.add(1, 2, 3, 0.25, 0.5, 2, 0xff8000, 0.75)
    splats.build(scene)

    const { material } = meshIn(scene)
    const texture = material.uniforms.uSplats.value as THREE.DataTexture
    const texels = texture.image.data
    expect(Array.from(texels.slice(0, 9))).toEqual([1, 2, 3, 0.75, 0.25, 0.5, 2, 0, 1])
    expect(texels[9]).toBeCloseTo(0.21586)
    expect(texels[10]).toBe(0)
    expect(material.transparent).toBe(true)
    expect(material.depthTest).toBe(true)
    expect(material.depthWrite).toBe(false)
  })

  it('sorts by camera-space depth across signed depths and preserves ties', () => {
    const scene = new THREE.Scene()
    const splats = new Splats()
    addPoint(splats, 5, 100, -1)
    addPoint(splats, 0, 0, -2)
    addPoint(splats, 5, 0, 1)
    addPoint(splats, 0, 0, 0)
    addPoint(splats, -8, 0, -2)
    addPoint(splats, 10, 0, -5)
    splats.build(scene)
    const mesh = meshIn(scene)
    const camera = new THREE.PerspectiveCamera()
    splats.update(camera, 800, 400)
    expect(indicesOf(mesh)).toEqual([5, 1, 4, 0, 3, 2])

    const indexBuffer = mesh.geometry.getAttribute('aSplatIndex') as THREE.InstancedBufferAttribute
    const oldVersion = indexBuffer.version
    camera.position.z = 20
    splats.update(camera, 400, 800)
    expect(indexBuffer.version).toBe(oldVersion)
    expect(mesh.material.uniforms.uViewport.value.toArray()).toEqual([400, 800])

    camera.rotation.y = -Math.PI / 2
    splats.update(camera, 400, 800)
    expect(indicesOf(mesh)).toEqual([5, 0, 2, 1, 3, 4])
    expect(indexBuffer.version).toBeGreaterThan(oldVersion)
  })

  it('applies deterministic nested LOD while retaining the source count', () => {
    const scene = new THREE.Scene()
    const splats = new Splats()
    for (let i = 0; i < 512; i++) addPoint(splats, i, 0, -i)
    splats.setQuality('low')
    splats.build(scene)
    const mesh = meshIn(scene)
    const camera = new THREE.PerspectiveCamera()
    splats.update(camera, 800, 400)
    const low = indicesOf(mesh)
    expect(splats.activeCount).toBe(low.length)
    expect(low.length).toBeGreaterThan(130)
    expect(low.length).toBeLessThan(215)
    expect(low).toEqual([...low].sort((a, b) => b - a))

    splats.setQuality('medium')
    splats.update(camera, 800, 400)
    const medium = new Set(indicesOf(mesh))
    expect(medium.size).toBeGreaterThan(low.length)
    expect(low.every((index) => medium.has(index))).toBe(true)

    splats.setQuality('high')
    splats.update(camera, 800, 400)
    expect(splats.activeCount).toBe(512)
    expect(splats.count).toBe(512)
    splats.setQuality('low')
    splats.update(camera, 800, 400)
    expect(indicesOf(mesh)).toEqual(low)
  })

  it('can rebuild an empty cloud with new points', () => {
    const scene = new THREE.Scene()
    const splats = new Splats()
    const camera = new THREE.PerspectiveCamera()
    splats.update(camera, 800, 400)
    splats.build(scene)
    expect(splats.activeCount).toBe(0)
    addPoint(splats, 1, 2, 3)
    splats.build(scene)
    splats.update(camera, 800, 400)
    expect(scene.children).toHaveLength(1)
    expect(indicesOf(meshIn(scene))).toEqual([0])
  })
})
