import { afterEach, expect, it, vi } from 'vitest'
import { cameraRig } from '../src/camera/rig'

function mount(reduce = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduce }))
  const canvas = Object.assign(new EventTarget(), { ownerDocument: new EventTarget(), style: {} })
  const rig = cameraRig(canvas as unknown as HTMLCanvasElement, () => {})
  rig.resize(1200, 800)
  rig.update(1 / 60)
  return rig
}
afterEach(() => vi.unstubAllGlobals())

it('eases between exact presets on real time and releases a flight to manual input', () => {
  const rig = mount()
  const start = rig.camera.position.clone()
  const direct = mount(true)
  direct.apply(1)
  const end = direct.camera.position.clone()
  rig.apply(1)
  expect(rig.camera.position.distanceTo(start)).toBeLessThan(1e-8)
  rig.update(.25)
  expect(rig.camera.position.distanceTo(start)).toBeGreaterThan(1)
  expect(rig.camera.position.distanceTo(end)).toBeGreaterThan(1)
  rig.controls.dispatchEvent({ type: 'start' })
  const interrupted = rig.camera.position.clone()
  rig.update(1)
  expect(rig.camera.position.distanceTo(interrupted)).toBeLessThan(1e-8)
  rig.apply(1)
  rig.update(.75)
  expect(rig.camera.position.distanceTo(end)).toBeLessThan(1e-8)
})

it('decays after input, settles while simulation is paused and respects reduced motion', () => {
  const rig = mount()
  rig.controls.rotateLeft(.3)
  const advance = () => {
    const last = rig.camera.position.clone()
    rig.update(1 / 60)
    return rig.camera.position.distanceTo(last)
  }
  const initial = advance()
  expect(initial).toBeGreaterThan(.01)
  expect(advance()).toBeLessThan(initial)
  expect(advance()).toBeGreaterThan(.001)
  for (let i = 0; i < 180; i++) advance()
  expect(rig.update(1 / 60)).toBe(false)
  const direct = mount(true)
  direct.controls.rotateLeft(.3)
  direct.update(1 / 60)
  expect(direct.update(1 / 60)).toBe(false)
})
