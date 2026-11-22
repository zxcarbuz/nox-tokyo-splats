import { expect, it } from 'vitest'
import { createEventLog, EVENT_LIMIT } from '../src/traffic/events'
import { CROSSING_DISTANCE, planCitizenRoute } from '../src/traffic/navigation'
import { POIS } from '../src/traffic/pois'
import { SIDEWALKS } from '../src/traffic/routes'

it('retains a contiguous event window and protects its history from snapshot mutation', () => {
  const log = createEventLog()
  for (let i = 0; i < EVENT_LIMIT + 5; i++) {
    log.add({ time: i / 2, npcId: 2, type: 'needs_changed', reason: 'walking', values: { hunger: i / 1000 } })
  }
  const events = log.snapshot()
  expect(events).toHaveLength(EVENT_LIMIT)
  expect(events.map(e => e.id)).toEqual(Array.from({ length: EVENT_LIMIT }, (_, i) => i + 6))
  expect(events.at(-1)?.id).toBe(log.sequence)
  events[0].values!.hunger = 100
  expect(log.snapshot()[0].values?.hunger).toBeCloseTo(0.005)
})

it('plans rail routes to all seven distinct destinations and respects blocked crosswalks', () => {
  expect(new Set(POIS.map(poi => poi.id)).size).toBe(POIS.length)
  expect(POIS.length).toBeGreaterThanOrEqual(7)
  expect(new Set(POIS.map(poi => poi.action))).toEqual(new Set(['eat','buy_food','rest','leisure_walk']))
  for (const poi of POIS) {
    const rail = SIDEWALKS[poi.sidewalk]
    const pose = rail.sample(poi.distance)
    expect([pose.x, pose.z]).toEqual([poi.x, poi.z])
    expect(poi.capacity).toBeGreaterThan(0)
    const same = planCitizenRoute(poi.sidewalk, poi.distance, 1, 0, poi)!
    expect(same.gate).toBe(-1)
    expect(same.distance).toBeCloseTo(0)
    const other = 1 - poi.sidewalk
    for (let open = 0; open < 4; open++) {
      const blocked = Uint8Array.of(1, 1, 1, 1)
      blocked[open] = 0
      const plan = planCitizenRoute(other, 0, -1, 0.27, poi, blocked)!
      expect(plan.gate).toBe(open)
      expect(plan.distance).toBeGreaterThanOrEqual(CROSSING_DISTANCE)
    }
    expect(planCitizenRoute(other, 0, 1, 0, poi, Uint8Array.of(1, 1, 1, 1))).toBeUndefined()
  }
})
