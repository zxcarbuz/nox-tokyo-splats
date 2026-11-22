import { poiAvailable, type PoiAction, type PointOfInterest } from './pois'

export interface CitizenNeeds {
  hunger: number
  energy: number
  leisure: number
}

export type CitizenPreferences = Readonly<Record<PoiAction, number>>

export interface UtilityEvaluation {
  action: PoiAction
  poiId: string
  poiName: string
  score: number
  reason: string
  available: boolean
}

interface UtilityInput {
  poi: PointOfInterest
  needs: Readonly<CitizenNeeds>
  preferences: CitizenPreferences
  distance: number
  travelTime?: number
  raining: boolean
  hasCapacity: boolean
  cooldown: number
  sinceSameAction: number
  sinceSamePoi: number
}

export const MIN_UTILITY = 0.1

export function unit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function needFor(action: PoiAction, needs: Readonly<CitizenNeeds>) {
  if (action === 'rest') return { label: 'Energy deficit', level: unit(1 - needs.energy / 100) }
  if (action === 'leisure_walk') return { label: 'Leisure deficit', level: unit(1 - needs.leisure / 100) }
  return { label: 'Hunger', level: unit(needs.hunger / 100) }
}

export function evaluateUtility(input: UtilityInput): UtilityEvaluation {
  const { poi, needs, preferences, distance, travelTime = distance / 1.15, raining, hasCapacity, cooldown, sinceSameAction, sinceSamePoi } = input
  const identity = { action: poi.action, poiId: poi.id, poiName: poi.name }
  const unavailable = !poiAvailable(poi, raining) ? 'Closed while it rains'
    : !hasCapacity ? 'All places reserved'
      : !Number.isFinite(distance) || distance < 0 || !Number.isFinite(travelTime) || travelTime < 0 ? 'No available sidewalk route'
        : cooldown > 0 ? `Available again in ${Math.ceil(cooldown)} s` : ''
  if (unavailable) return { ...identity, score: 0, reason: unavailable, available: false }

  const { label, level } = needFor(poi.action, needs)
  const urgency = (0.25 * level + 0.75 * Math.pow(level, 1.45)) * preferences[poi.action]
  const relief = poi.action === 'rest' ? poi.effect.energy ?? 0
    : poi.action === 'leisure_walk' ? poi.effect.leisure ?? 0 : -(poi.effect.hunger ?? 0)
  const distanceCost = 0.31 * distance / (distance + 10)
  const timeCost = 0.19 * poi.duration / (poi.duration + 8) + 0.035 * travelTime / (travelTime + 14)
  const repeatCost = 0.15 * unit(1 - sinceSameAction / 45) + 0.15 * unit(1 - sinceSamePoi / 80)
  const weatherCost = raining && poi.action === 'leisure_walk' ? 0.025 : 0
  const impact = urgency * (0.82 + 0.18 * unit(relief / 100))
  const score = unit((impact - distanceCost - timeCost - repeatCost - weatherCost) / 1.5)
  const reason = `${label} ${Math.round(level * 100)}%, ${distance.toFixed(1)} m walk, ${poi.duration} s at destination`
    + (repeatCost > 0 ? ', recent activity penalty' : '')
  return { ...identity, score, reason, available: true }
}
