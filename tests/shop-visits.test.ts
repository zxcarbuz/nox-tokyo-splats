import { expect, it } from 'vitest'
import { createMobilitySimulation } from '../src/traffic/simulation'
import { passes, visitRoll } from '../src/traffic/visits'

it('rolls 33 percent reproducibly and detects both directed ring seams once', () => {
  const roll = visitRoll(42), replay = visitRoll(42)
  const series = Array.from({ length: 50000 }, roll)
  expect(series).toEqual(Array.from({ length: series.length }, replay))
  expect(series.filter(Boolean).length / series.length).toBeCloseTo(0.33, 2)
  expect(passes(99, 0, 1, 1, 100)).toBe(true)
  expect(passes(0, 99, -1, 1, 100)).toBe(true)
  expect(passes(0, 0, 1, 1, 100)).toBe(false)
})

it('skips Aoba without braking after a rejected approach from the northbound walker', () => {
  const seed = Array.from({length: 32}, (_, i) => i).find(i => !visitRoll(i ^ Math.imul(4, 0x85ebca6b))())!
  const sim = createMobilitySimulation(seed)
  sim.update(1.2, false)
  expect(sim.visits()['Aoba Mart']).toMatchObject({attempts: 1, successes: 0})
  expect(sim.snapshot().pedestrians[4].z).toBeCloseTo(7.1 - 1.2 * 1.33)
})

it('revisits only assigned inner-sidewalk slots across many crossings and counts arrivals and departures', () => {
  const sim = createMobilitySimulation(42)
  const slots = [[9,1.28,8.73],[11,2.2,8.73],[4,8.73,5.9],[5,8.73,7.1]]
  const arrivals = [0,0,0,0], departures = [0,0,0,0]
  const held = [-1,-1,-1,-1], lastExit = [-20,-20,-20,-20]
  let testedPause = false
  for (let tick = 0; tick < 12000; tick++) {
    sim.update(0.25, true)
    const {pedestrians,time} = sim.snapshot()
    slots.forEach(([id,x,z], i) => {
      const p = pedestrians[id]
      if (p.state === 'visiting') {
        expect(p.x).toBeCloseTo(x)
        expect(p.z).toBeCloseTo(z)
        if (held[i] < 0) {
          expect(time-lastExit[i]).toBeGreaterThan(8)
          held[i] = time
          arrivals[i]++
        }
        if (!testedPause) {
          const before = sim.snapshot(), counts = sim.visits()
          sim.update(0,true)
          expect(sim.snapshot()).toEqual(before)
          expect(sim.visits()).toEqual(counts)
          testedPause = true
        }
      } else if (held[i] >= 0) {
        expect(time-held[i]).toBeCloseTo(5, 0)
        expect(p.state).toBe('walking')
        departures[i]++
        lastExit[i] = time
        held[i] = -1
      }
    })
  }
  const counts = sim.visits()
  expect([counts.Tsukimiken.attempts, counts['Aoba Mart'].attempts]).toEqual([38, 61])
  console.info('3000 simulation seconds, seed 42', counts, arrivals)
  for (const [i,shop] of ['Tsukimiken','Aoba Mart'].entries()) {
    expect(counts[shop].successes).toBe(arrivals[2*i]+arrivals[2*i+1])
    expect(counts[shop].completed).toBe(departures[2*i]+departures[2*i+1])
    expect(counts[shop].attempts).toBeGreaterThan(counts[shop].successes)
  }
  expect(Math.min(...departures)).toBeGreaterThan(1)
})
