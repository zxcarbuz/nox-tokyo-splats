import { expect, it } from 'vitest'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('slows at the east shop window, holds through pause and resumes independently of the ramen visitor', () => {
  const sim = createMobilitySimulation()
  const customer = () => sim.snapshot().pedestrians[4]
  const ramen = () => sim.snapshot().pedestrians[9]
  const start = customer().z
  sim.update(0.4, false)
  const cruise = start - customer().z
  sim.update(0.4, false)
  const approach = customer().z
  sim.update(0.4, false)
  expect(approach - customer().z).toBeGreaterThan(0)
  expect(approach - customer().z).toBeLessThan(cruise)
  expect(ramen().state).toBe('visiting')
  expect(customer().state).toBe('walking')
  sim.update(0.8, false)
  const stopped = customer()
  expect(stopped.state).toBe('visiting')
  expect(stopped.x).toBeCloseTo(8.73)
  expect(stopped.z).toBeCloseTo(5.9)
  const beforePause = sim.snapshot().pedestrians
  sim.update(0, true)
  expect(sim.snapshot().pedestrians).toEqual(beforePause)
  sim.update(3.9, false)
  expect(ramen().state).not.toBe('visiting')
  expect(customer().state).toBe('visiting')
  expect(customer().phase).toBe(stopped.phase)
  expect(customer().stride).toBeCloseTo(0)
  expect(Math.sin(customer().heading)).toBeCloseTo(-1)
  sim.update(0.5, false)
  expect(customer().state).toBe('walking')
  expect(customer().z).toBeLessThan(stopped.z)
})
