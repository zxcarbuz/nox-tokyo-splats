import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
export function cameraRig(canvas: HTMLCanvasElement, manual: () => void) {
  const camera = new THREE.PerspectiveCamera(35, 1, 0.15, 240)
  const input = camera.clone()
  const controls = new OrbitControls(input, canvas)
  controls.minDistance = 5
  controls.maxDistance = 150
  controls.maxPolarAngle = Math.PI * 0.49
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  controls.enableDamping = !reduced.matches
  controls.dampingFactor = .15
  const direction = new THREE.Vector3()
  let preset: number | null = 0
  const views = [
    { offset: [0.64, 0.40, 0.76], target: [0, 1, 0], distance: 60 },
    { offset: [0.45, 0.13, 1], target: [0, 3, 3], distance: 27 },
    { offset: [-0.7, 1.24, 0.54], target: [0, 5, 0], distance: 47 },
  ]
  const from = new THREE.Spherical(), to = new THREE.Spherical(), orbit = new THREE.Spherical()
  const origin = new THREE.Vector3(), destination = new THREE.Vector3(), previous = new THREE.Vector3()
  let flight = 1
  let radius = 0
  function apply(index: number, instant = false) {
    preset = index
    origin.copy(controls.target)
    from.setFromVector3(direction.copy(camera.position).sub(origin))
    // Drain pending OrbitControls deltas before replacing its pose.
    controls.enableDamping = false
    controls.update()
    controls.target.copy(origin)
    const view = views[index]
    destination.fromArray(view.target)
    to.setFromVector3(direction.fromArray(view.offset).normalize())
    to.radius = THREE.MathUtils.clamp(view.distance * Math.max(1, (index === 0 ? 1.30 : 1.44) / camera.aspect), 5, 150)
    to.theta = from.theta + Math.atan2(Math.sin(to.theta-from.theta), Math.cos(to.theta-from.theta))
    flight = instant || reduced.matches ? 1 : 0
    poseFlight(flight)
  }
  function poseFlight(t: number) {
    const u = t*t*(3-2*t)
    controls.target.lerpVectors(origin, destination, u)
    orbit.set(THREE.MathUtils.lerp(from.radius,to.radius,u), THREE.MathUtils.lerp(from.phi,to.phi,u), THREE.MathUtils.lerp(from.theta,to.theta,u))
    input.position.copy(controls.target).add(direction.setFromSpherical(orbit))
    controls.update()
    radius = orbit.radius
    camera.position.copy(input.position)
    camera.lookAt(controls.target)
  }
  function update(dt: number) {
    previous.copy(camera.position)
    controls.enableDamping = !reduced.matches
    if (flight < 1) {
      flight = reduced.matches ? 1 : Math.min(1, flight + dt/.75)
      poseFlight(flight)
    } else {
      controls.dampingFactor = -Math.expm1(-12*Math.min(dt,.2))
      controls.update(dt)
      if (controls.target.y < .18) {
        input.position.y += .18-controls.target.y
        controls.target.y = .18
      }
      direction.copy(input.position).sub(controls.target)
      const goal = direction.length()
      radius = reduced.matches || Math.abs(goal-radius)<.0001 ? goal : THREE.MathUtils.lerp(radius,goal,-Math.expm1(-16*dt))
      camera.position.copy(controls.target).addScaledVector(direction.normalize(),radius)
      camera.lookAt(controls.target)
    }
    return previous.distanceToSquared(camera.position)>1e-15
  }
  const custom = () => {
    if (flight < 1) { input.position.copy(camera.position); flight = 1 }
    preset = null
    manual()
  }
  controls.addEventListener('start', custom)
  canvas.onkeydown = (event) => {
    if (
      ![
        'ArrowRight',
        'ArrowLeft',
        'ArrowDown',
        'ArrowUp',
        '+',
        '=',
        '-',
        'Home',
      ].includes(event.key)
    )
      return
    event.preventDefault()
    if (event.key === 'Home') {
      document.getElementById('reset')?.click()
      return
    }
    custom()
    const offset = camera.position.clone().sub(controls.target)
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * (event.key === '-' ? 1.1 : 0.9),
          controls.minDistance,
          controls.maxDistance,
        ),
      )
    } else if (event.shiftKey) {
      const v = new THREE.Vector3()
      v.setFromMatrixColumn(
        camera.matrixWorld,
        event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 0 : 1,
      )
      controls.target.addScaledVector(
        v,
        event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1,
      )
    } else {
      const s = new THREE.Spherical().setFromVector3(offset)
      if (event.key === 'ArrowLeft') s.theta -= 0.09
      if (event.key === 'ArrowRight') s.theta += 0.09
      if (event.key === 'ArrowUp') s.phi -= 0.07
      if (event.key === 'ArrowDown') s.phi += 0.07
      s.phi = THREE.MathUtils.clamp(s.phi, 0.03, controls.maxPolarAngle)
      offset.setFromSpherical(s)
    }
    input.position.copy(controls.target).add(offset)
    controls.update()
  }
  return {
    camera,
    controls,
    apply,
    update,
    resize: (w: number, h: number) => {
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
      input.aspect = camera.aspect
      input.updateProjectionMatrix()
      if (preset !== null) apply(preset, true)
    },
  }
}
