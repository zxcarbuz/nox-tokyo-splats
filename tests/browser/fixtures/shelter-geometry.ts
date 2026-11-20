import * as THREE from 'three'
import { buildCity } from '../../../src/city/city'
import { shelters } from '../../../src/traffic/shelters'
import { createRingRoute } from '../../../src/traffic/routes'

const scene = new THREE.Scene()
let splats = 0
const city = buildCity(scene, () => { splats++ })
scene.updateMatrixWorld(true)
const boxes = scene.getObjectByName('Tokyo city geometry')!.children.filter(
  (node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh && node.name.startsWith('City '),
)
const route = createRingRoute(8.73,.22)
const bounds = new THREE.Box3(), matrix = new THREE.Matrix4()
let buildings = 0
const corridors = shelters.map(site => {
  const entry = route.sample(route.gate(site.side)+site.along)
  const path = new THREE.Box3().setFromPoints([
    new THREE.Vector3(entry.x,.35,entry.z), new THREE.Vector3(site.x,1.3,site.z),
  ]).expandByScalar(.16)
  return { site, path, obstructions: 0 }
})
for (const mesh of boxes) {
  mesh.geometry.computeBoundingBox()
  for (let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,matrix)
    bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix)
    if (mesh.name === 'City wall' && Math.abs(bounds.min.y-.115)<.001 &&
        bounds.max.y>3 && bounds.max.x-bounds.min.x>2 && bounds.max.z-bounds.min.z>2) buildings++
    for (const corridor of corridors) if (bounds.intersectsBox(corridor.path)) corridor.obstructions++
  }
}
const roofHeights = corridors.map(({site}) => {
  const heights: number[] = []
  for (const dx of [-.16,0,.16]) for (const dz of [-.16,0,.16]) {
    const origin = new THREE.Vector3(site.x+dx,1.5,site.z+dz)
    const ray = new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),0,.6)
    const roof = ray.intersectObjects(boxes,false)[0]
    const dry = city.rainCovers.some(c => origin.x>=c.x && origin.x<=c.z && origin.z>=c.y && origin.z<=c.w)
    heights.push(roof && dry ? roof.point.y : 0)
  }
  return heights
})
const signs = scene.getObjectByName('Japanese neon and illuminated signs') as THREE.Mesh
document.body.dataset.audit = JSON.stringify({
  buildings, splats, signs: signs.geometry.getAttribute('position').count/6,
  obstructions: corridors.map(c=>c.obstructions), roofHeights,
})
