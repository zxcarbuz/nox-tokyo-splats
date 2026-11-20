import { expect, it } from 'vitest'
import { Group, InstancedMesh, Matrix4, Vector3 } from 'three'
import { buildPedestrians } from '../src/traffic/pedestrians'
import { benches, seatTop } from '../src/traffic/benches'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('approaches each seat on the pavement, rests, stands and rejoins the original path', () => {
  const sim = createMobilitySimulation(42)
  const sequence = ['walking', 'approaching_bench', 'sitting_down', 'seated', 'standing_up', 'leaving_bench', 'walking']
  const history: string[][] = [['walking'], ['walking']]
  const seatedTime = [0, 0]
  let paused = false
  let last = sim.snapshot()
  for (let tick = 0; tick < 32 * 30; tick++) {
    sim.update(1 / 30, true)
    const next = sim.snapshot()
    benches.forEach(({ id, x, z, duration }, i) => {
      const p = next.pedestrians[id], old = last.pedestrians[id]
      expect(Math.hypot(p.x-old.x, p.z-old.z)).toBeLessThan(.055)
      if (p.state !== old.state) history[i].push(p.state)
      if (p.state === 'seated') {
        expect(p.x).toBeCloseTo(x, 5)
        expect(p.z).toBeCloseTo(z, 5)
        expect(p.sit).toBe(1)
        if (old.state === 'seated') expect(p.phase).toBe(old.phase)
        else seatedTime[i] = next.time
      }
      if (p.state === 'standing_up' && old.state === 'seated') {
        expect(next.time-seatedTime[i]).toBeCloseTo(duration, 1)
      }
    })
    if (!paused && benches.every(b => next.pedestrians[b.id].state === 'seated')) {
      sim.update(0, true)
      expect(sim.snapshot()).toEqual(next)
      paused = true
    }
    last = next
  }
  expect(paused).toBe(true)
  expect(history).toEqual([sequence, sequence])
  expect(seatedTime[0]).not.toBe(seatedTime[1])
})

it('reserves each bench again on a subsequent eligible circuit', () => {
  const sim = createMobilitySimulation(42)
  const visits = [0, 0], lastStart = [-Infinity, -Infinity]
  let before = sim.snapshot()
  for (let t = 1; t <= 650; t++) {
    sim.update(1, true)
    const state = sim.snapshot()
    benches.forEach(({ id, duration }, i) => {
      if (state.pedestrians[id].state === 'seated' && before.pedestrians[id].state !== 'seated') {
        expect(t-lastStart[i]).toBeGreaterThan(duration + 24)
        lastStart[i] = t
        visits[i]++
      }
    })
    before = state
  }
  expect(Math.min(...visits)).toBeGreaterThan(1)
})

it('places the rendered hips on the slats with horizontal thighs and upright shins', () => {
  const sim = createMobilitySimulation(42)
  sim.update(8, true)
  const { pedestrians, time } = sim.snapshot()
  const group = new Group()
  buildPedestrians(group, pedestrians)(pedestrians, time)
  const matrix = new Matrix4(), axis = new Vector3()
  for (const { id } of benches) {
    const hips = group.children[1] as InstancedMesh
    hips.geometry.computeBoundingBox()
    hips.getMatrixAt(id, matrix)
    expect(hips.geometry.boundingBox!.clone().applyMatrix4(matrix).min.y).toBeCloseTo(seatTop, 2)
    for (const leg of [2 * id, 2 * id + 1]) {
      const thighs = group.children[6] as InstancedMesh
      const shins = group.children[7] as InstancedMesh
      thighs.getMatrixAt(leg, matrix)
      expect(Math.abs(axis.setFromMatrixColumn(matrix, 1).normalize().y)).toBeLessThan(.1)
      shins.getMatrixAt(leg, matrix)
      expect(Math.abs(axis.setFromMatrixColumn(matrix, 1).normalize().y)).toBeGreaterThan(.98)
    }
  }
})
