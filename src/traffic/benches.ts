// One assigned user per seat. Both face the road from the outer pavement.
export const benches = [
  { id: 1, x: -7.8, z: -14.8, heading: 0, side: 0, duration: 10 },
  { id: 15, x: -14.8, z: -8, heading: Math.PI / 2, side: 3, duration: 12 },
] as const

export const seatTop = .42

// The walker turns in front of the slats, then moves the hips back over them.
export const sitBack = .36
export const approachSeconds = 1.5
export const sitSeconds = .95

export type BenchState = 'approaching_bench' | 'sitting_down' | 'seated' | 'standing_up' | 'leaving_bench'
export interface BenchRest {
  bench: typeof benches[number]
  entry: number
  approachLength: number
  elapsed: number
  cooldown: number
  offset: number
  sit: number
}

const afterRestPhase = {
  approaching_bench: 'sitting_down', sitting_down: 'seated', seated: 'standing_up',
  standing_up: 'leaving_bench', leaving_bench: 'walking',
} as const

export function advanceBench(rest: BenchRest, state: BenchState, dt: number, time: number) {
  rest.elapsed += dt
  const duration = state === 'seated' ? rest.bench.duration :
    state === 'approaching_bench' || state === 'leaving_bench' ? approachSeconds : sitSeconds
  const t = Math.min(1, rest.elapsed / duration)
  const ease = t * t * (3 - 2 * t)
  if (state === 'approaching_bench') rest.offset = rest.approachLength * ease
  if (state === 'sitting_down') rest.sit = ease
  if (state === 'standing_up') rest.sit = 1 - ease
  if (state === 'leaving_bench') rest.offset = rest.approachLength * (1 - ease)
  if (t < 1) return state
  rest.elapsed = 0
  if (state === 'leaving_bench') rest.cooldown = time + 24
  return afterRestPhase[state]
}
