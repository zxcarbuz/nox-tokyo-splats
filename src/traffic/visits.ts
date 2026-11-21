import { wrap } from './routes'

// A counter-based 32-bit generator, with a separately seeded stream per walker.
export function visitRoll(seed: number) {
  let counter = seed
  return () => {
    let n: number
    do {
      counter = (counter + 0x9e3779b9) >>> 0
      n = Math.imul(counter ^ (counter >>> 16), 0x21f0aaad)
      n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
      n = (n ^ (n >>> 15)) >>> 0
    } while (n >= 4294967200) // largest multiple of 100 below 2^32
    return n % 100 < 33
  }
}

// Half-open directed segment (from, to], also across the ring seam.
export function passes(from: number, target: number, direction: number, step: number, length: number) {
  const ahead = wrap((target - from) * direction, length)
  return ahead > 0 && ahead <= step
}

export interface ShopVisit {
  stop: number
  heading: number
  remaining: number
  cooldownUntil: number
  roll: () => boolean
  attempts: number
  successes: number
  completed: number
}

export function attemptVisit(visit: ShopVisit, time: number) {
  visit.attempts++
  visit.cooldownUntil = time + 8
  return visit.roll()
}

export function advanceVisit(visit: ShopVisit, dt: number, time: number) {
  visit.remaining = Math.max(0, visit.remaining - dt)
  if (visit.remaining > 0) return 'visiting'
  visit.cooldownUntil = time + 8
  visit.completed++
  return 'walking'
}
