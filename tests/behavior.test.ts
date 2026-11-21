import { expect, it } from 'vitest'
import { canStart, canTransition, transition, type Behavior, type BehaviorPhase } from '../src/traffic/behavior'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('admits only free walkers to optional activities and protects committed phases', () => {
  const entries = ['approaching_shop','approaching_bench','seeking_shelter'] as const
  const locked: BehaviorPhase[] = ['waiting','crossing','visiting','approaching_shop','approaching_bench',
    'sitting_down','seated','standing_up','leaving_bench','seeking_shelter','sheltered','leaving_shelter']
  for (const next of entries) {
    expect(canStart('walking',next,false)).toBe(true)
    expect(canStart('walking',next,true)).toBe(false)
    for (const mode of locked) expect(canTransition(mode,next)).toBe(false)
  }
  const p: Behavior = { mode:'walking', actionSince:0 }
  transition(p,'approaching_bench',1)
  for (const next of ['sitting_down','seated','standing_up','leaving_bench'] as const) {
    expect(()=>transition(p,'walking',2)).toThrow()
    transition(p,next,3)
    expect(p.actionSince).toBe(1)
  }
  transition(p,'walking',4)
  expect(p.actionSince).toBe(4)
  expect(canTransition('waiting','walking')).toBe(false)
  expect(canTransition('crossing','visiting')).toBe(false)
  expect(canTransition('seeking_shelter','leaving_shelter')).toBe(true)
})

it('keeps an interrupted shelter approach and both clocks frozen until resume', () => {
  const sim = createMobilitySimulation(42)
  sim.setRain(true)
  for (let i=0; i<900 && sim.behavior()[0].state !== 'seeking_shelter'; i++) sim.update(1/30,true)
  sim.update(.5,true)
  const before = sim.behavior(), held = sim.snapshot()
  expect(before[0]).toMatchObject({ action:'shelter',state:'seeking_shelter',reason:'rain_shelter' })
  sim.setRain(false)
  sim.update(0,true)
  expect(sim.snapshot()).toEqual(held)
  expect(sim.behavior()).toEqual(before)
  sim.update(1/30,true)
  expect(sim.behavior()[0]).toEqual({ ...before[0], state:'leaving_shelter' })
  sim.update(2,true)
  expect(sim.behavior()[0]).toMatchObject({action:'walk', state:'walking', reason:'roaming'})
})

it('replays independent actions, shop departures and repeated returns to the route', { timeout: 30_000 }, () => {
  const sim = createMobilitySimulation(42), replay = createMobilitySimulation(42)
  const returns = Array<number>(16).fill(0), walks = Array<number>(16).fill(0)
  const resumeChecks = new Set<number>()
  const anchors: Record<number,number> = {4:5.9,5:7.1,9:1.28,11:2.2}
  let previous = sim.behavior()
  for (let sample=0; sample<90000; sample++) {
    const wet = sample%6000<4500, traffic = sample%2700>=100
    sim.setRain(wet)
    replay.setRain(wet)
    sim.update(1/30,traffic)
    replay.update(1/60,traffic)
    replay.update(1/60,traffic)
    const current = sim.behavior()
    let state: ReturnType<typeof sim.snapshot> | undefined
    // Compare the full record at intervals; validate every observed transition.
    if (sample%900===0) expect(current).toEqual(replay.behavior())
    for (const p of current) {
      const old = previous[p.id]
      if (resumeChecks.delete(p.id)) {
        state ??= sim.snapshot()
        const south = p.id===9 || p.id===11
        const pos = state.pedestrians[p.id]
        expect(south ? pos.z : pos.x).toBeCloseTo(8.73)
        const delta = ((south ? pos.x : pos.z)-anchors[p.id]) * (p.id===5 ? 1 : -1)
        expect(delta).toBeGreaterThan(0)
        expect(delta).toBeLessThan(.06)
      }
      if (p.state === old.state && p.action === old.action) {
        if (p.actionSince !== old.actionSince) throw Error('Restarted an unchanged action for '+p.id)
        continue
      }
      state ??= sim.snapshot()
      expect(p.state).toBe(state.pedestrians[p.id].state)
      expect(p.actionSince).toBeLessThanOrEqual(state.time)
      if (p.action === old.action) expect(p.actionSince).toBe(old.actionSince)
      else expect(p.actionSince).toBe(state.time)
      if (p.action === 'visit') {
        expect([4,5,9,11]).toContain(p.id)
        expect(p.reason).toBe('shop_visit')
      }
      if (p.state === 'walking' && p.action === 'walk') {
        walks[p.id]++
        expect(p.reason).toBe('roaming')
        if (['visit','shelter','rest'].includes(old.action)) returns[p.id]++
        if (old.state === 'visiting') {
          const pos = state.pedestrians[p.id]
          const south = p.id===9 || p.id===11
          resumeChecks.add(p.id)
          expect(south ? pos.z : pos.x).toBeCloseTo(8.73)
          expect(south ? pos.x : pos.z).toBeCloseTo(anchors[p.id],8)
        }
      }
    }
    previous = current
  }
  expect(sim.behavior()).toEqual(replay.behavior())
  expect(Math.min(...walks)).toBeGreaterThan(2)
  for (const id of [4,5,9,11,0,10,1,15]) expect(returns[id]).toBeGreaterThan(1)
  expect(sim.visits()).toEqual(replay.visits())
})
