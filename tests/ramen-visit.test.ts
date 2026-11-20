import { expect, it } from 'vitest'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('walks to Tsukimiken, faces the shop for five simulation seconds, then continues west', () => {
  const sim = createMobilitySimulation()
  const visitor = () => sim.snapshot().pedestrians[9]
  const start = visitor()
  sim.update(0.5, true)
  expect(visitor().state).toBe('walking')
  expect(visitor().x).toBeLessThan(start.x)
  sim.update(0.3, false)
  const stop = visitor()
  expect(stop.state).toBe('visiting')
  expect(stop.x).toBeCloseTo(1.28)
  expect(stop.z).toBeCloseTo(13.65)
  sim.update(0, true)
  expect(visitor()).toEqual(stop)
  sim.update(4.8, false)
  expect(visitor().state).toBe('visiting')
  expect(visitor().x).toBe(stop.x)
  expect(Math.cos(visitor().heading)).toBeCloseTo(-1)
  expect(visitor().stride).toBeCloseTo(0)
  sim.update(0.6, false)
  expect(visitor().state).toBe('walking')
  expect(visitor().x).toBeLessThan(stop.x)
  expect(visitor().z).toBe(stop.z)
})
