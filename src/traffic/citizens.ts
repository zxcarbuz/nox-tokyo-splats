import type { CityEventInput } from './events'
import { poiAvailable, type PoiAction, type PointOfInterest } from './pois'
import { evaluateUtility, MIN_UTILITY, type CitizenNeeds, type CitizenPreferences, type UtilityEvaluation } from './utility'

export const CITIZEN_IDS = [2, 6, 12] as const
const NEED_EVENT_INTERVAL = 2
const DECISION_INTERVAL = 2
const HISTORY_LIMIT = 12

export interface CitizenProfile {
  readonly name: string
  readonly preferences: CitizenPreferences
  readonly hungerRate: number
  readonly energyRate: number
  readonly leisureRate: number
}

const PROFILES: Readonly<Record<number, CitizenProfile>> = {
  2: {
    name: 'Харуто', preferences: { eat: 1.38, buy_food: 0.78, rest: 0.99, leisure_walk: 0.97 },
    hungerRate: 0.35, energyRate: 0.36, leisureRate: 0.34,
  },
  6: {
    name: 'Рэн', preferences: { eat: 0.90, buy_food: 1.22, rest: 1.48, leisure_walk: 0.90 },
    hungerRate: 0.31, energyRate: 0.44, leisureRate: 0.29,
  },
  12: {
    name: 'Акира', preferences: { eat: 0.98, buy_food: 0.96, rest: 1.18, leisure_walk: 1.32 },
    hungerRate: 0.26, energyRate: 0.38, leisureRate: 0.41,
  },
}

const INITIAL_NEEDS: Readonly<Record<number, Readonly<CitizenNeeds>>> = {
  2: { hunger: 85, energy: 79, leisure: 74 },
  6: { hunger: 63, energy: 40, leisure: 77 },
  12: { hunger: 40, energy: 39, leisure: 21 },
}

export interface CitizenCandidate<Route> {
  poi: PointOfInterest
  distance: number
  travelTime?: number
  route: Route
}

export interface CitizenGoal<Route> {
  readonly poi: PointOfInterest
  route: Route
  readonly action: PoiAction
  readonly score: number
  readonly reason: string
  readonly duration: number
  readonly selectedAt: number
  phase: 'walking' | 'executing'
  startedAt?: number
}

interface CitizenDecision {
  readonly time: number
  readonly poiId: string | null
  readonly action: PoiAction | null
  readonly score: number
  readonly reason: string
  readonly scores: readonly UtilityEvaluation[]
}

interface CitizenActivity {
  readonly time: number
  readonly action: PoiAction
  readonly poiId: string
  readonly poiName: string
}

interface Citizen<Route> {
  readonly id: number
  readonly profile: CitizenProfile
  readonly needs: CitizenNeeds
  goal: CitizenGoal<Route> | null
  lastDecision: CitizenDecision | null
  history: CitizenActivity[]
  nextDecisionAt: number
}

interface CitizenState<Route> extends Citizen<Route> {
  time: number
  lastNeedsAt: number
  lastNeedBands: number
  cancelledPoi: string | null
  lastAction: Map<PoiAction, number>
  lastPoi: Map<string, number>
  cooldown: Map<string, number>
}

function seededUnit(seed: number, id: number, index: number) {
  let hash = seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000
}

const boundedNeed = (value: number) => Math.max(0, Math.min(100, value))

function needBands({ hunger, energy, leisure }: CitizenNeeds) {
  return Math.floor(hunger / 10) * 121 + Math.floor(energy / 10) * 11 + Math.floor(leisure / 10)
}

export function createCitizens<Route>(seed = 0, onEvent?: (event: CityEventInput) => void) {
  const citizens = new Map<number, CitizenState<Route>>()
  const reservations = new Map<string, Set<number>>()
  let revision = 0

  function get(id: number): CitizenState<Route> {
    const existing = citizens.get(id)
    if (existing) return existing
    const { hunger, energy, leisure } = INITIAL_NEEDS[id] ?? { hunger: 51, energy: 62, leisure: 61 }
    const jitter = (index: number) => (seededUnit(seed, id, index) - 0.5) * 10
    const needs = { hunger: boundedNeed(hunger + jitter(0)), energy: boundedNeed(energy + jitter(1)), leisure: boundedNeed(leisure + jitter(2)) }
    const citizen: CitizenState<Route> = {
      id,
      profile: PROFILES[id] ?? { ...PROFILES[2], name: `Citizen ${id}` },
      needs,
      goal: null,
      lastDecision: null,
      history: [],
      nextDecisionAt: seededUnit(seed, id, 3) * 0.65,
      time: 0,
      lastNeedsAt: 0,
      lastNeedBands: needBands(needs),
      cancelledPoi: null,
      lastAction: new Map(),
      lastPoi: new Map(),
      cooldown: new Map(),
    }
    citizens.set(id, citizen)
    return citizen
  }

  function occupancy(poiId: string) {
    return reservations.get(poiId)?.size ?? 0
  }

  function canReserve(poi: PointOfInterest, id?: number) {
    const occupied = reservations.get(poi.id)
    if (id !== undefined && occupied?.has(id)) return true
    return (occupied?.size ?? 0) < poi.capacity
  }

  function release(poi: PointOfInterest, id: number) {
    const occupied = reservations.get(poi.id)
    if (!occupied?.delete(id)) return
    if (!occupied.size) reservations.delete(poi.id)
    revision++
  }

  function needsChanged(citizen: CitizenState<Route>, time: number, reason: string, goal?: CitizenGoal<Route>) {
    citizen.lastNeedsAt = time
    citizen.lastNeedBands = needBands(citizen.needs)
    onEvent?.({ time, npcId: citizen.id, type: 'needs_changed', goal: goal?.action, poi: goal?.poi.id, reason, values: { ...citizen.needs } })
  }

  function tick(id: number, dt: number, raining: boolean, walking = true, time?: number) {
    if (!Number.isFinite(dt) || dt <= 0) return
    const citizen = get(id)
    const { needs, profile } = citizen
    citizen.time = time ?? citizen.time + dt
    needs.hunger = boundedNeed(needs.hunger + profile.hungerRate * dt)
    const effort = walking ? (raining ? 1.16 : 1) : 0.28
    needs.energy = boundedNeed(needs.energy - profile.energyRate * effort * dt)
    needs.leisure = boundedNeed(needs.leisure - profile.leisureRate * (raining ? 1.16 : 1) * dt)
    if (citizen.time - citizen.lastNeedsAt >= NEED_EVENT_INTERVAL && needBands(needs) !== citizen.lastNeedBands) {
      needsChanged(citizen, citizen.time, 'A need crossed a 10-point threshold', citizen.goal ?? undefined)
    }
  }

  function choose(id: number, candidates: readonly CitizenCandidate<Route>[], time: number, raining: boolean): CitizenGoal<Route> | null {
    const citizen = get(id)
    if (citizen.goal || time + 1e-8 < citizen.nextDecisionAt) return citizen.goal
    citizen.nextDecisionAt = time + DECISION_INTERVAL
    let selected: CitizenCandidate<Route> | undefined
    let best: UtilityEvaluation | undefined
    const scores: UtilityEvaluation[] = []
    for (const candidate of candidates) {
      const { poi, distance, travelTime } = candidate
      const evaluation = evaluateUtility({
        poi, distance, travelTime, raining,
        needs: citizen.needs, preferences: citizen.profile.preferences,
        hasCapacity: canReserve(poi, id), cooldown: (citizen.cooldown.get(poi.id) ?? -Infinity) - time,
        sinceSameAction: time - (citizen.lastAction.get(poi.action) ?? -Infinity),
        sinceSamePoi: time - (citizen.lastPoi.get(poi.id) ?? -Infinity),
      })
      scores.push(evaluation)
      if (!evaluation.available || evaluation.score < MIN_UTILITY) continue
      if (!best || evaluation.score > best.score || (evaluation.score === best.score && evaluation.poiId < best.poiId)) {
        selected = candidate
        best = evaluation
      }
    }
    const reason = best?.reason ?? (scores.some(score => score.available)
      ? 'No available destination offers enough benefit yet' : 'No destination is currently available')
    citizen.lastDecision = { time, poiId: best?.poiId ?? null, action: best?.action ?? null, score: best?.score ?? 0, reason, scores }
    onEvent?.({
      time, npcId: id, type: 'decision_made', goal: best?.action, poi: best?.poiId, reason,
      values: { ...citizen.needs }, scores: scores.map(({ poiId, action, score }) => ({ poi: poiId, action, score })),
    })
    if (!selected || !best) return null

    const { poi, route } = selected
    const occupied = reservations.get(poi.id) ?? new Set<number>()
    occupied.add(id)
    reservations.set(poi.id, occupied)
    revision++
    const goal: CitizenGoal<Route> = {
      poi, route, action: poi.action, score: best.score, reason: best.reason, duration: poi.duration, phase: 'walking', selectedAt: time,
    }
    const type = citizen.cancelledPoi && citizen.cancelledPoi !== poi.id ? 'goal_changed' : 'goal_selected'
    citizen.cancelledPoi = null
    citizen.goal = goal
    onEvent?.({ time, npcId: id, type, goal: goal.action, poi: poi.id, reason: goal.reason })
    return goal
  }

  function activeAvailable(id: number, raining: boolean) {
    const goal = citizens.get(id)?.goal
    return !!goal && poiAvailable(goal.poi, raining) && reservations.get(goal.poi.id)?.has(id) === true
  }

  function begin(id: number, time: number) {
    const goal = citizens.get(id)?.goal
    if (!goal || goal.phase !== 'walking') return null
    goal.phase = 'executing'
    goal.startedAt = time
    onEvent?.({ time, npcId: id, type: 'destination_reached', goal: goal.action, poi: goal.poi.id,
      reason: `Arrived at ${goal.poi.name}`, values: { x: goal.poi.x, z: goal.poi.z } })
    onEvent?.({ time, npcId: id, type: 'action_started', goal: goal.action, poi: goal.poi.id,
      reason: `Started a ${goal.duration} s visit`, values: { duration: goal.duration } })
    return goal
  }

  function complete(id: number, time: number) {
    const citizen = citizens.get(id)
    const goal = citizen?.goal
    if (!citizen || !goal || goal.startedAt === undefined || time + 1e-6 < goal.startedAt + goal.duration) return null
    const { needs } = citizen
    const { poi } = goal
    needs.hunger = boundedNeed(needs.hunger + (poi.effect.hunger ?? 0))
    needs.energy = boundedNeed(needs.energy + (poi.effect.energy ?? 0))
    needs.leisure = boundedNeed(needs.leisure + (poi.effect.leisure ?? 0))
    citizen.lastPoi.set(poi.id, time)
    citizen.lastAction.set(goal.action, time)
    citizen.cooldown.set(poi.id, time + 20)
    citizen.history.push({ time, action: goal.action, poiId: poi.id, poiName: poi.name })
    if (citizen.history.length > HISTORY_LIMIT) citizen.history.shift()
    citizen.goal = null
    citizen.nextDecisionAt = time + DECISION_INTERVAL
    release(poi, id)
    onEvent?.({ time, npcId: id, type: 'action_completed', goal: goal.action, poi: poi.id,
      reason: `Completed the visit to ${poi.name}` })
    needsChanged(citizen, time, 'The completed visit affected needs', goal)
    return goal
  }

  function cancel(id: number, time: number, reason = 'The destination became unavailable') {
    const citizen = citizens.get(id)
    const goal = citizen?.goal
    if (!citizen || !goal) return null
    citizen.goal = null
    citizen.cancelledPoi = goal.poi.id
    citizen.cooldown.set(goal.poi.id, time + 6)
    citizen.nextDecisionAt = time + 0.5
    release(goal.poi, id)
    onEvent?.({ time, npcId: id, type: 'action_cancelled', goal: goal.action, poi: goal.poi.id, reason })
    return goal
  }

  function snapshot(): Citizen<Route>[] {
    return Array.from(citizens.values(), ({ id, profile, needs, goal, lastDecision, history, nextDecisionAt }) => ({
      id, profile: { ...profile, preferences: { ...profile.preferences } }, needs: { ...needs },
      goal: goal && structuredClone(goal),
      lastDecision: lastDecision && { ...lastDecision, scores: lastDecision.scores.map(score => ({ ...score })) },
      history: history.map(activity => ({ ...activity })), nextDecisionAt,
    })).sort((a, b) => a.id - b.id)
  }

  return { get, tick, choose, activeAvailable, occupancy, canReserve, begin, complete, cancel, snapshot, get revision() { return revision } }
}
