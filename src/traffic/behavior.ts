import type { BenchState } from './benches'
import type { ShelterState } from './shelters'

export type PedestrianState = 'walking' | 'waiting' | 'crossing' | 'visiting' | BenchState | ShelterState
// A committed shopper still uses the ordinary walking pose until arriving at the stop.
export type BehaviorPhase = PedestrianState | 'approaching_shop'
export type Action = 'walk' | 'wait' | 'visit' | 'rest' | 'shelter'
export interface Behavior {
  mode: BehaviorPhase
  actionSince: number
}

const rules: Record<BehaviorPhase, { action: Action; next: readonly BehaviorPhase[] }> = {
  walking: { action: 'walk', next: ['waiting', 'approaching_shop', 'approaching_bench', 'seeking_shelter'] },
  waiting: { action: 'wait', next: ['crossing'] },
  crossing: { action: 'walk', next: ['walking'] },
  approaching_shop: { action: 'visit', next: ['visiting', 'waiting'] },
  visiting: { action: 'visit', next: ['walking'] },
  approaching_bench: { action: 'rest', next: ['sitting_down'] },
  sitting_down: { action: 'rest', next: ['seated'] },
  seated: { action: 'rest', next: ['standing_up'] },
  standing_up: { action: 'rest', next: ['leaving_bench'] },
  leaving_bench: { action: 'rest', next: ['walking'] },
  seeking_shelter: { action: 'shelter', next: ['sheltered', 'leaving_shelter'] },
  sheltered: { action: 'shelter', next: ['leaving_shelter'] },
  leaving_shelter: { action: 'shelter', next: ['walking'] },
}

const reasons = { walk: 'roaming', wait: 'traffic_signal', visit: 'shop_visit', rest: 'bench_rest', shelter: 'rain_shelter' } as const

export const movementState = (mode: BehaviorPhase): PedestrianState => mode === 'approaching_shop' ? 'walking' : mode
export const actionOf = (mode: BehaviorPhase) => rules[mode].action
export const reasonOf = (mode: BehaviorPhase) => mode === 'crossing' ? 'traffic_signal' : reasons[actionOf(mode)]
export const isRest = (mode: BehaviorPhase): mode is BenchState => actionOf(mode) === 'rest'
export const isSheltering = (mode: BehaviorPhase): mode is ShelterState => actionOf(mode) === 'shelter'
export const canTransition = (from: BehaviorPhase, to: BehaviorPhase) => rules[from].next.includes(to)

type OptionalEntry = 'approaching_shop' | 'approaching_bench' | 'seeking_shelter'
export function canStart(mode: BehaviorPhase, entry: OptionalEntry, mustWait: boolean) {
  return !mustWait && canTransition(mode, entry)
}

export function transition(actor: Behavior, next: BehaviorPhase, time: number) {
  if (actor.mode === next) return
  if (!canTransition(actor.mode, next)) throw new Error(`Invalid pedestrian transition: ${actor.mode} -> ${next}`)
  if (actionOf(actor.mode) !== actionOf(next)) actor.actionSince = time
  actor.mode = next
}
