export type CityEventType = 'decision_made' | 'goal_selected' | 'goal_changed' | 'destination_reached'
  | 'action_started' | 'action_completed' | 'action_cancelled' | 'needs_changed'
  | 'arrived_at_shop' | 'visit_finished' | 'bench_rest_started' | 'bench_rest_finished'
  | 'shelter_entered' | 'shelter_left'
export interface CityEventInput {
  time: number
  npcId: number
  type: CityEventType
  goal?: string
  poi?: string
  reason: string
  values?: Record<string, number>
  scores?: { poi: string; action: string; score: number }[]
}
export interface CityEvent extends CityEventInput {
  id: number
}

export const EVENT_LIMIT = 250

export function createEventLog() {
  const entries = new Array<CityEvent>(EVENT_LIMIT)
  let sequence = 0
  return {
    add(event: CityEventInput) {
      entries[sequence % EVENT_LIMIT] = { ...event, id: ++sequence }
    },
    snapshot() {
      const count = Math.min(sequence, EVENT_LIMIT)
      return Array.from({ length: count }, (_, i) => structuredClone(entries[(sequence - count + i) % EVENT_LIMIT]))
    },
    get sequence() { return sequence },
  }
}
