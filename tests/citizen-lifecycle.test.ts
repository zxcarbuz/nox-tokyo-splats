import { expect, it } from 'vitest'
import { EVENT_LIMIT, type CityEvent } from '../src/traffic/events'
import { POIS } from '../src/traffic/pois'
import { createMobilitySimulation } from '../src/traffic/simulation'

const citizenIds = [2, 6, 12]
const sites = new Map(POIS.map(p => [p.id, p]))

function checkEventOrder(events: CityEvent[]) {
  const selected = new Map<number, CityEvent>()
  const arrived = new Map<number, CityEvent>()
  const started = new Map<number, CityEvent>()
  const decisions = new Map<number, CityEvent>()
  const lastCompletion = new Map<number, number>()
  const completed = new Map(citizenIds.map(id => [id, new Set<string>()]))
  const usedTypes = new Set(events.map(e => e.type))
  for (const type of ['decision_made', 'goal_selected', 'destination_reached', 'action_started', 'action_completed',
    'needs_changed', 'arrived_at_shop', 'visit_finished', 'bench_rest_started', 'bench_rest_finished',
    'shelter_entered', 'shelter_left'] as const) expect(usedTypes).toContain(type)

  events.forEach((event, index) => {
    const { npcId, poi, goal, time, type } = event
    expect(event.id).toBe(index + 1)
    expect(time).toBeGreaterThanOrEqual(events[index - 1]?.time ?? 0)
    expect(event.reason.trim()).not.toHaveLength(0)
    if (!citizenIds.includes(npcId)) return
    if (type === 'decision_made') {
      expect(event.scores?.length).toBeGreaterThan(0)
      decisions.set(npcId, event)
    } else if (type === 'goal_selected' || type === 'goal_changed') {
      expect(decisions.get(npcId)?.time).toBe(time)
      expect(selected.has(npcId)).toBe(false)
      expect(sites.get(poi!)?.action).toBe(goal)
      selected.set(npcId, event)
    } else if (type === 'destination_reached') {
      expect(selected.get(npcId)?.poi).toBe(poi)
      expect(arrived.has(npcId)).toBe(false)
      arrived.set(npcId, event)
    } else if (type === 'action_started') {
      expect(arrived.get(npcId)?.poi).toBe(poi)
      expect(started.has(npcId)).toBe(false)
      started.set(npcId, event)
    } else if (type === 'action_completed' || type === 'action_cancelled') {
      expect(selected.get(npcId)?.poi).toBe(poi)
      if (type === 'action_completed') {
        expect(started.get(npcId)?.poi).toBe(poi)
        const duration = time - started.get(npcId)!.time
        expect(duration).toBeGreaterThan(0)
        completed.get(npcId)!.add(goal!)
        expect(time - (lastCompletion.get(npcId) ?? 0)).toBeLessThan(300)
        lastCompletion.set(npcId, time)
      }
      selected.delete(npcId)
      arrived.delete(npcId)
      started.delete(npcId)
    }
  })

  for (const [id, actions] of completed) {
    expect(actions.size).toBeGreaterThan(1)
    expect(1800 - (lastCompletion.get(id) ?? 0)).toBeLessThan(300)
  }
  return [...completed].map(([id, actions]) => ({ id, actions: [...actions].sort() }))
}

it.each([7, 42, 638])('safely replays 1800 seconds of wet/dry city activity for seed %i', { timeout: 60_000 }, seed => {
  const sim = createMobilitySimulation(seed)
  const replay = createMobilitySimulation(seed)
  const legacy = createMobilitySimulation(seed, false)
  const originalPedestrians = (state: ReturnType<typeof sim.snapshot>) => state.pedestrians.filter(p => !citizenIds.includes(p.id))
  let before = sim.snapshot()
  const crossings = new Set<number>()
  const history: CityEvent[] = []
  let cursor = 0
  for (let sample = 1; sample <= 7200; sample++) {
    const wet = Math.floor((sample - 1) / 172) % 2 === 0
    const carsOn = (sample - 1) % 1016 >= 112
    sim.setRain(wet)
    replay.setRain(wet)
    legacy.setRain(wet)
    sim.update(0.25, carsOn)
    legacy.update(0.25, carsOn)
    replay.update(0.125, carsOn)
    replay.update(0.125, carsOn)
    const state = sim.snapshot()
    const occupied = new Map<string, number>()
    for (const id of citizenIds) {
      const p = state.pedestrians[id], old = before.pedestrians[id]
      const delta = Math.hypot(p.x - old.x, p.z - old.z)
      if (!Number.isFinite(delta) || delta > 0.48) throw Error('Invalid motion for NPC ' + id + ' at ' + state.time)
      if (p.state === 'crossing') {
        crossings.add(id)
        const side = Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? 1 : 3) : (p.z > 0 ? 2 : 0)
        if (Math.min(Math.abs(p.x), Math.abs(p.z)) > 0.75 || state.signals[side].vehicle !== 'red') throw Error('Unsafe crossing at ' + state.time)
        if (state.cars.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 1)) throw Error('Occupied crossing')
      } else {
        const radius = Math.max(Math.abs(p.x), Math.abs(p.z))
        if ((radius > 9.05 && radius < 13.1) || radius < 8.4 || radius > 13.7) throw Error('Left the sidewalk at ' + state.time)
      }
      if (p.state === 'interacting') {
        const poi = POIS.find(candidate => Math.hypot(candidate.x - p.x, candidate.z - p.z) < 1e-5)
        if (!poi) throw Error('Action started away from POI')
        const count = (occupied.get(poi.id) ?? 0) + 1
        if (count > poi.capacity) throw Error('Exceeded POI capacity')
        occupied.set(poi.id, count)
        if (p.eating !== ['eat', 'buy_food'].includes(poi.action)) throw Error('Gesture does not match action')
      }
    }
    if (sample % 40 === 0) {
      const recent = sim.events()
      expect(recent.length).toBeLessThanOrEqual(EVENT_LIMIT)
      const fresh = recent.filter(e => e.id > cursor)
      if (fresh.length) {
        expect(fresh[0].id).toBe(cursor + 1)
        history.push(...fresh)
        cursor = fresh.at(-1)!.id
      }
      // Compare histories across two real frame partitions, including every score and event payload.
      expect(replay.events().filter(e => e.id > cursor - fresh.length)).toEqual(fresh)
      const residents = sim.citizens()
      expect(residents).toEqual(replay.citizens())
      for (const resident of residents) {
        for (const value of Object.values(resident.needs)) {
          expect(Number.isFinite(value)).toBe(true)
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(100)
        }
      }
      expect(originalPedestrians(state)).toEqual(originalPedestrians(legacy.snapshot()))
      expect(sim.visits()).toEqual(legacy.visits())
      expect(sim.shelterStatus()).toEqual(legacy.shelterStatus())
    }
    before = state
  }
  expect(before.time).toBeCloseTo(1800, 5)
  expect(before).toEqual(replay.snapshot())
  expect(history.length).toBeGreaterThan(EVENT_LIMIT)
  expect(crossings).toEqual(new Set(citizenIds))
  const completed = checkEventOrder(history)
  const held = { citizens: sim.citizens(), events: sim.events(), state: before }
  sim.setRain(!sim.raining)
  sim.update(0, false)
  expect({ citizens: sim.citizens(), events: sim.events(), state: sim.snapshot() }).toEqual(held)
  console.info('1800 simulation seconds', { seed, events: history.length, completed })
})
