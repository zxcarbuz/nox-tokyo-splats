// Dedicated inner-pavement slots below the existing striped canopies.
// x/z are the feet; the gate offset is measured in the ring's forward direction.
export const shelters = [
  { id: 0, side: 1, along: -1.65, x: 8.07, z: -1.65, outward: Math.PI / 2, wait: 9, cooldown: 27 },
  { id: 10, side: 2, along: 6.50, x: -6.50, z: 8.30, outward: 0, wait: 11, cooldown: 32 },
] as const

export type ShelterState = 'seeking_shelter' | 'sheltered' | 'leaving_shelter'
export const approachTime = 1.25

export interface ShelterVisit {
  site: typeof shelters[number]
  entry: number
  progress: number
  travelRate: number
  remaining: number
  readyAt: number
  completed: number
  reached: boolean
}

// Reverse the same smooth path if the rain stops partway through the approach.
export function advanceShelter(visit: ShelterVisit, state: ShelterState, rain: boolean, dt: number, time: number) {
  if (state === 'seeking_shelter' && rain) {
    visit.progress = Math.min(1, visit.progress + dt / approachTime)
    if (visit.progress < 1) return state
    visit.reached = true
    visit.remaining = visit.site.wait
    return 'sheltered'
  }
  if (state === 'sheltered' && rain) {
    visit.remaining = Math.max(0, visit.remaining - dt)
    if (visit.remaining > 1e-8) return state
  }
  // Brake before reversing an interrupted approach. Starting at the canopy edge,
  // smoothstep already has zero velocity, so a normal departure needs no brake.
  if (state === 'sheltered') visit.travelRate = -1
  const previousRate = visit.travelRate
  visit.travelRate = Math.max(-1, previousRate - dt * 2 / .3)
  visit.remaining = 0
  const travel = (previousRate + visit.travelRate) * .5 * dt / approachTime
  visit.progress = Math.max(0, Math.min(1, visit.progress + travel))
  if (visit.progress > 1e-8) return 'leaving_shelter'
  visit.progress = 0
  if (visit.reached) visit.completed++
  visit.reached = false
  visit.readyAt = time + visit.site.cooldown
  return 'walking'
}
