import { describe, expect, it } from 'vitest'
import { createMobilitySimulation } from '../src/traffic/simulation'
import { shelters } from '../src/traffic/shelters'

const tick = 1 / 30
const create = () => createMobilitySimulation(42)

describe('rain shelters on the inner sidewalk', () => {
  it('reverses a partial approach and freezes the return when paused', () => {
    const sim = create()
    sim.setRain(true)
    for (let i = 0; i < 1000 && sim.shelterStatus()[0].state !== 'seeking_shelter'; i++) sim.update(tick, true)
    sim.update(.5, true)
    const before = sim.snapshot()
    expect(before.pedestrians[0].state).toBe('seeking_shelter')
    sim.setRain(false)
    sim.update(0, true)
    expect(sim.raining).toBe(false)
    expect(sim.snapshot()).toEqual(before)
    sim.update(tick, true)
    const p = sim.snapshot().pedestrians[0]
    expect(p.state).toBe('leaving_shelter')
    // Still moving inward on the first cancellation tick, then reverses without jumping.
    expect(before.pedestrians[0].x-p.x).toBeGreaterThan(0)
    expect(before.pedestrians[0].x-p.x).toBeLessThan(.035)
    sim.update(.55,true)
    expect(sim.snapshot().pedestrians[0].x).toBeGreaterThan(p.x)
    sim.update(.75,true)
    expect(sim.shelterStatus()[0]).toMatchObject({state:'walking', completed:0})
    sim.update(500, true)
    expect(sim.shelterStatus().map(s => s.completed)).toEqual([0,0])
  })

  it('holds planted feet under each canopy, releases early and counts only finished returns', () => {
    for (const [slot,site] of shelters.entries()) {
      const sim = create()
      sim.setRain(true)
      for (let i = 0; i < 120 * 30 && sim.shelterStatus()[slot].state !== 'sheltered'; i++) sim.update(tick,true)
      const p = sim.snapshot().pedestrians[site.id]
      expect(p).toMatchObject({state:'sheltered', umbrella:false, stride:0})
      expect(p.x).toBeCloseTo(site.x,8)
      expect(p.z).toBeCloseTo(site.z,8)
      sim.update(.5,true)
      expect(sim.snapshot().pedestrians[site.id].phase).toBe(p.phase)
      expect(sim.shelterStatus()[slot].remaining).toBeCloseTo(site.wait-.5)
      const frozen = sim.shelterStatus()
      sim.setRain(false)
      sim.update(0,true)
      expect(sim.shelterStatus()).toEqual(frozen)
      sim.update(tick,true)
      expect(sim.shelterStatus()[slot]).toMatchObject({state:'leaving_shelter',completed:0})
      sim.update(1.5,true)
      expect(sim.shelterStatus()[slot]).toMatchObject({state:'walking',completed:1})
    }
  })

  it('replays three wet/dry cycles across frame rates, with continuous approaches and personal cooldowns', () => {
    function run(fps: number) {
      const sim = create(), entries: [number,number][] = []
      const exits = [-Infinity,-Infinity], arrivals = [0,0], fullStays = [0,0]
      let last = sim.snapshot()
      for (let frame=0; frame<480*fps; frame++) {
        const rain = frame % (160*fps) < 116*fps
        sim.setRain(rain)
        sim.update(1/fps,true)
        const now = sim.snapshot()
        shelters.forEach((site,i) => {
          const p = now.pedestrians[site.id], old = last.pedestrians[site.id]
          if (!p.state.includes('shelter') && !old.state.includes('shelter')) return
          expect(Math.hypot(p.x-old.x,p.z-old.z)).toBeLessThan(.08)
          if (p.state === 'seeking_shelter' && old.state === 'walking') {
            expect(rain).toBe(true)
            expect(now.time-exits[i]).toBeGreaterThanOrEqual(site.cooldown)
          }
          if (p.state === 'sheltered' && old.state !== 'sheltered') {
            entries.push([site.id,now.time])
            arrivals[i] = now.time
          }
          if (rain && p.state === 'leaving_shelter' && old.state === 'sheltered') {
            expect(Math.abs(now.time-arrivals[i]-site.wait)).toBeLessThan(.08)
            fullStays[i]++
          }
          if (p.state === 'walking') exits[i] = now.time
        })
        last = now
      }
      const completed = sim.shelterStatus().map(p => p.completed)
      expect(completed).toEqual(shelters.map(site => entries.filter(e => e[0] === site.id).length))
      expect(Math.min(...fullStays)).toBeGreaterThan(0)
      expect(Math.min(...completed)).toBeGreaterThan(1)
      return { entries, completed }
    }
    const reference = run(30)
    for (const fps of [24,120]) {
      const replay = run(fps)
      expect(replay.completed).toEqual(reference.completed)
      expect(replay.entries.map(e => e[0])).toEqual(reference.entries.map(e => e[0]))
      replay.entries.forEach((e,i) => expect(Math.abs(e[1]-reference.entries[i][1])).toBeLessThanOrEqual(1/fps))
    }
    console.info('480 seconds, seed 42, completed', reference.completed)
  })
})

it('keeps shops, benches and all four crossings active while rain changes', () => {
  const sim = create()
  const shoppers = [9,11,4,5], visits = [0,0,0,0], seated = new Set<number>()
  const crossings = new Set<number>()
  let last = sim.snapshot()
  for (let tick=0; tick<12000; tick++) {
    sim.setRain(tick % 800 < 600)
    sim.update(.25,true)
    const now = sim.snapshot()
    for (const p of now.pedestrians) {
      if (p.state === 'seated') seated.add(p.id)
      if (p.state === 'visiting' && last.pedestrians[p.id].state !== 'visiting') {
        expect(shoppers).toContain(p.id)
        visits[shoppers.indexOf(p.id)]++
      }
      if (p.state === 'crossing') {
        const side = Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? 1 : 3) : (p.z > 0 ? 2 : 0)
        crossings.add(side)
        expect(now.signals[side].vehicle).toBe('red')
        expect(now.cars.some(c => Math.hypot(c.x-p.x,c.z-p.z)<1)).toBe(false)
      }
    }
    last = now
  }
  expect(crossings.size).toBe(4)
  expect([...seated].sort((a,b)=>a-b)).toEqual([1,15])
  expect(Math.min(...visits)).toBeGreaterThan(1)
  const stats = sim.visits()
  expect(stats.Tsukimiken.successes).toBe(visits[0]+visits[1])
  expect(stats['Aoba Mart'].successes).toBe(visits[2]+visits[3])
  for (const shop of Object.values(stats)) expect(shop.completed + shop.current.length).toBe(shop.successes)
  console.info('3000 weather-varying seconds, shop arrivals by resident', shoppers, visits)
})
