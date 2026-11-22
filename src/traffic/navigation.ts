import { SIDES, SIDEWALKS, wrap } from './routes'
import type { PointOfInterest } from './pois'

export const CROSSING_DISTANCE = 13.65 - 8.73

export interface CitizenRoute {
  gate: number
  direction: number
  afterCrossing: number
  distance: number
}

export function directedDistance(from: number, to: number, direction: number, length: number) {
  return wrap((to - from) * direction, length)
}

export function planCitizenRoute(
  sidewalk: number, start: number, preferred: number, offset: number,
  poi: PointOfInterest, blocked?: Uint8Array,
): CitizenRoute | undefined {
  const current = SIDEWALKS[sidewalk], next = SIDEWALKS[poi.sidewalk]
  let best: CitizenRoute | undefined
  for (const direction of [preferred, -preferred]) {
    if (sidewalk === poi.sidewalk) {
      const distance = directedDistance(start, poi.distance, direction, current.length)
      if (!best || distance < best.distance) best = { gate: -1, direction, afterCrossing: direction, distance }
      continue
    }
    for (let gate = 0; gate < SIDES.length; gate++) {
      if (blocked?.[gate]) continue
      const toGate = directedDistance(start, current.gate(gate) + offset, direction, current.length)
      const landing = next.gate(gate) + offset
      for (const afterCrossing of [direction, -direction]) {
        const distance = toGate + CROSSING_DISTANCE + directedDistance(landing, poi.distance, afterCrossing, next.length)
        if (!best || distance < best.distance) best = { gate, direction, afterCrossing, distance }
      }
    }
  }
  return best
}
