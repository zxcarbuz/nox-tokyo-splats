import { expect, it } from 'vitest'
import { createCitizens } from '../src/traffic/citizens'
import type { CityEventInput } from '../src/traffic/events'
import { POIS } from '../src/traffic/pois'
import { evaluateUtility } from '../src/traffic/utility'

it('explains how urgency, distance, personality, duration, recency and availability affect the same choice', () => {
  const poi = POIS.find(site => site.action === 'eat')!
  const conditions = {
    poi, needs: { hunger: 76, energy: 80, leisure: 75 },
    preferences: { eat: 1, buy_food: 1, rest: 1, leisure_walk: 1 },
    distance: 8, raining: false, hasCapacity: true, cooldown: 0, sinceSameAction: 100, sinceSamePoi: 100,
  }
  const score = (changes: Partial<typeof conditions>) => evaluateUtility({ ...conditions, ...changes }).score
  const neutral = score({})
  expect(score({ needs: { ...conditions.needs, hunger: 96 } })).toBeGreaterThan(neutral)
  expect(score({ distance: 60 })).toBeLessThan(neutral)
  expect(score({ preferences: { ...conditions.preferences, eat: 1.2 } })).toBeGreaterThan(neutral)
  expect(score({ poi: { ...poi, duration: poi.duration * 4 } })).toBeLessThan(neutral)
  expect(score({ sinceSamePoi: 0, sinceSameAction: 0 })).toBeLessThan(neutral)
  for (const changes of [{ hasCapacity: false }, { cooldown: 2 }, { distance: Infinity },
    { raining: true, poi: POIS.find(site => site.availability === 'dry')! }]) {
    const choice = evaluateUtility({ ...conditions, ...changes })
    expect(choice.available).toBe(false)
    expect(choice.reason.length).toBeGreaterThan(0)
  }
})

it('reserves a dry destination, cancels it without applying rewards and selects a replacement', () => {
  const events: CityEventInput[] = []
  const model = createCitizens<number>(8, event => events.push(event))
  const dry = POIS.find(site => site.availability === 'dry')!
  const backup = POIS.find(site => site.action === dry.action && site.availability === 'always')!
  const candidates = (poi: typeof dry) => [{ poi, distance: 0.5, route: 1 }]
  for (const id of [2, 6]) Object.assign(model.get(id).needs, { hunger: 10, energy: 90, leisure: 4 })
  expect(model.choose(2, candidates(dry), 1, false)?.poi.id).toBe(dry.id)
  expect(model.occupancy(dry.id)).toBe(1)
  expect(model.choose(6, candidates(dry), 1, false)).toBeNull()
  expect(model.activeAvailable(2, true)).toBe(false)
  const initial = { ...model.get(2).needs }
  model.cancel(2, 4, 'rain')
  model.cancel(2, 4, 'rain')
  expect(model.get(2).needs).toEqual(initial)
  expect(model.occupancy(dry.id)).toBe(0)
  const replacement = model.choose(2, candidates(backup), 6, true)!
  expect(replacement.poi.id).toBe(backup.id)
  expect(events.filter(e => e.type === 'goal_changed')).toHaveLength(1)
  expect(events.filter(e => e.type === 'action_cancelled')).toHaveLength(1)
})

it('applies all four need effects once at completion and releases each reservation', () => {
  for (const poi of POIS) {
    const events: CityEventInput[] = []
    const model = createCitizens<number>(1, e => events.push(e))
    const actor = model.get(12)
    Object.assign(actor.needs, { hunger: 90, energy: 15, leisure: 10 })
    const candidate = [{ poi, distance: 1, route: 2 }]
    expect(model.choose(12, candidate, 1, false)).not.toBeNull()
    model.begin(12, 10)
    model.begin(12, 10)
    const before = { ...actor.needs }
    expect(model.complete(12, 10 + poi.duration - 0.1)).toBeNull()
    expect(actor.needs).toEqual(before)
    model.complete(12, 10 + poi.duration)
    model.complete(12, 10 + poi.duration + 0.1)
    for (const need of ['hunger','energy','leisure'] as const) {
      expect(actor.needs[need]).toBeCloseTo(Math.min(100, Math.max(0, before[need] + (poi.effect[need] ?? 0))))
    }
    expect(model.occupancy(poi.id)).toBe(0)
    expect(events.map(e => e.type)).toEqual(['decision_made','goal_selected','destination_reached',
      'action_started','action_completed','needs_changed'])
  }
})

it('selects among competing goals from needs and personal preferences, with faster fatigue on wet walks', () => {
  const options = POIS.map(poi => ({ poi, distance: 8, route: poi.id }))
  function decide(id: number, hunger: number, energy: number, leisure: number) {
    const model = createCitizens<string>(42)
    Object.assign(model.get(id).needs, { hunger, energy, leisure })
    return model.choose(id, options, 1, false)?.action
  }
  // Equal needs and walking distances expose the two different food preferences.
  expect(decide(2, 92, 90, 90)).toBe('eat')
  expect(decide(6, 92, 90, 90)).toBe('buy_food')
  expect(decide(12, 10, 5, 90)).toBe('rest')
  expect(decide(12, 10, 90, 5)).toBe('leisure_walk')

  const dry = createCitizens(42), wet = createCitizens(42)
  const initial = { ...dry.get(6).needs }
  dry.tick(6, 10, false)
  wet.tick(6, 10, true)
  const after = dry.get(6).needs, rainy = wet.get(6).needs
  expect(after.hunger).toBeGreaterThan(initial.hunger)
  expect(after.energy).toBeLessThan(initial.energy)
  expect(after.leisure).toBeLessThan(initial.leisure)
  expect(rainy.energy).toBeLessThan(after.energy)
  expect(rainy.leisure).toBeLessThan(after.leisure)
})
