import * as THREE from 'three'
import { Splats } from '../../../src/splats/splats'

const size = 144
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setSize(size, size)
renderer.setClearColor(0x000000, 1)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30)
const gl = renderer.getContext()

function pixel(x: number, y: number) {
  const rgba = new Uint8Array(4)
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
  return [...rgba].slice(0, 3)
}
function render(splats: Splats, z = 6) {
  camera.position.set(0, 0, z)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  splats.update(camera, size, size)
  renderer.render(scene, camera)
}

const ellipse = new Splats()
ellipse.add(0, 0, 0, 0.6, 0.15, 0.12, 0xffffff, 0.9)
ellipse.build(scene)
ellipse.setQuality('high')
render(ellipse)
const center = pixel(72, 72)[0]
const majorAxis = pixel(84, 72)[0]
const minorAxis = pixel(72, 84)[0]
const background = pixel(5, 5)[0]
const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }))
wall.position.z = 0.7
scene.add(wall)
render(ellipse)
const occluded = pixel(72, 72)
scene.clear()

const pair = new Splats()
pair.add(0, 0, 0.5, 0.4, 0.4, 0.12, 0x0000ff, 0.92)
pair.add(0, 0, -0.5, 0.4, 0.4, 0.12, 0xff0000, 0.92)
pair.build(scene)
pair.setQuality('high')
render(pair)
const frontBlue = pixel(72, 72)
render(pair, -6)
const frontRed = pixel(72, 72)
document.body.dataset.samples = JSON.stringify({ center, majorAxis, minorAxis, background, occluded, frontBlue, frontRed })
renderer.dispose()
