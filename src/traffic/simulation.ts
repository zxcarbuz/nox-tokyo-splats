import { CITIZEN_IDS, createCitizens } from './citizens'
import { createEventLog, type CityEventType } from './events'
import { CROSSING_DISTANCE, planCitizenRoute, type CitizenRoute } from './navigation'
import { POIS } from './pois'
import { actionOf, canStart, isRest, isSheltering, movementState, reasonOf, transition, type Behavior } from './behavior'
import { advanceShelter, shelters, type ShelterVisit } from './shelters'
import { advanceBench, approachSeconds, benches, sitBack, type BenchRest } from './benches'
import { advanceVisit, attemptVisit, passes, visitRoll, type ShopVisit } from './visits'
import { createRingRoute, SIDES, SIDEWALKS, wrap } from './routes'
import type { Side } from './routes'

export const CYCLE_LENGTH = 22
const GREEN_END = 10.6
const WALK_START = 12.8
const WALK_END = 20.8
const OFFSETS = [0.7, 11.4, 14.1, 7.1]
const STOP_DISTANCE = 2.26
const CROSSING_CLEARANCE = 2.17
const FOLLOWING_DISTANCE = 2.43
const STEP = 1 / 30
const CAR_BRAKE = 5.2
const CAR_ACCELERATION = 2.25

const LANES = [
  { name: 'outer', direction: 1, route: createRingRoute(11.86, 2.24) },
  { name: 'inner', direction: -1, route: createRingRoute(10.14, 1.02) },
] as const

export type VehiclePhase = 'green' | 'yellow' | 'red'
export type { PedestrianState } from './behavior'

export interface SignalState {
  side: Side
  vehicle: VehiclePhase
  pedestrian: boolean
  walkTime: number
}

interface Car {
  id: number
  lane: number
  distance: number
  cruise: number
  speed: number
  braking: boolean
}

interface Pedestrian extends Behavior {
  id: number
  sidewalk: number
  direction: number
  distance: number
  speed: number
  heading: number
  lookout: number
  stride: number
  phase: number
  offset: number
  umbrella: boolean
  shelter?: ShelterVisit
  rest?: BenchRest
  visit?: ShopVisit
  gate: number
  crossing: number
  crossingEvery: number
  passed: number
  interactionHeading?: number
  eating?: boolean
  availabilitySeen?: number
}

export function signalAt(side: number, time: number): SignalState {
  const phase = wrap(time + OFFSETS[side], CYCLE_LENGTH)
  return {
    side: SIDES[side],
    vehicle: phase < GREEN_END ? 'green' : phase < WALK_START ? 'yellow' : 'red',
    pedestrian: phase >= WALK_START && phase < WALK_END,
    walkTime: phase >= WALK_START && phase < WALK_END ? WALK_END - phase : 0,
  }
}

function makeCar(id: number, lane: number, side: number, offset: number, cruise: number): Car {
  const { route, direction } = LANES[lane]
  return {
    id,
    lane,
    distance: wrap(route.gate(side) + offset * direction, route.length),
    cruise,
    speed: cruise * 0.72,
    braking: false,
  }
}

function makePedestrian(id: number, sidewalk: number, side: number, ahead: number): Pedestrian {
  const route = SIDEWALKS[sidewalk]
  const direction = id % 3 === 1 ? -1 : 1
  const distance = wrap(route.gate(side) + direction * ahead, route.length)
  return {
    id,
    sidewalk,
    direction,
    distance,
    speed: 0.91 + (id % 6) * 0.105,
    heading: route.sample(distance).heading + (direction < 0 ? Math.PI : 0),
    lookout: 0,
    stride: 0,
    phase: id * 1.87,
    offset: ((id * 5) % 9 - 4) * 0.13,
    umbrella: id % 5 !== 0,
    mode: 'walking',
    actionSince: 0,
    gate: side,
    crossing: 0,
    crossingEvery: 2 + (id % 2),
    passed: id % 4 === 0 ? 0 : 2,
  }
}

function distanceAhead(from: number, to: number, direction: number, length: number): number {
  return wrap((to - from) * direction, length)
}

function gateDistance(pedestrian: Pedestrian, gate: number): number {
  return SIDEWALKS[pedestrian.sidewalk].gate(gate) + pedestrian.offset
}

export function createMobilitySimulation(seed = Math.floor(Math.random() * 0x100000000), autonomous = true) {
  const events = createEventLog()
  const citizens = createCitizens<CitizenRoute>(seed, events.add)
  const experiment = new Set<number>(autonomous ? CITIZEN_IDS : [])
  for (const id of experiment) citizens.get(id)
  const cars = [
    makeCar(0, 0, 2, -4.8, 3.8),
    makeCar(1, 0, 2, 6.5, 4.15),
    makeCar(2, 0, 3, -2.4, 3.1),
    makeCar(3, 0, 3, 9.2, 3.6),
    makeCar(4, 0, 0, 1.6, 3.2),
    makeCar(5, 0, 1, -8.1, 4.25),
    makeCar(6, 0, 1, 5.7, 3.45),
    makeCar(7, 1, 2, 3.5, 3.4),
    makeCar(8, 1, 2, -9.4, 3.75),
    makeCar(9, 1, 1, 3.8, 4.05),
    makeCar(10, 1, 1, -7.7, 3.5),
    makeCar(11, 1, 0, -4.5, 3.23),
    makeCar(12, 1, 3, -3.3, 3.55),
    makeCar(13, 1, 3, 7.7, 3.9),
  ]
  const pedestrians = [
    makePedestrian(0, 0, 0, -3.6),
    makePedestrian(1, 1, 0, 5.8),
    makePedestrian(2, 0, 0, 4.8),
    makePedestrian(3, 1, 0, -2.8),
    makePedestrian(4, 0, 1, -7.1),
    makePedestrian(5, 1, 1, -2.1),
    makePedestrian(6, 0, 1, -0.7),
    makePedestrian(7, 1, 1, 5.8),
    makePedestrian(8, 0, 2, 5.6),
    makePedestrian(9, 1, 2, -2.1),
    makePedestrian(10, 0, 2, -1.35),
    makePedestrian(11, 1, 2, 6.5),
    makePedestrian(12, 0, 3, -5.5),
    makePedestrian(13, 1, 3, -3.2),
    makePedestrian(14, 0, 3, 3.4),
    makePedestrian(15, 1, 3, 5.45),
  ]
  // Storefronts face the inner ring. Stops are spaced along the south
  // frontage (distance decreases with x) and east frontage (increases with z).
  const shops = {
    Tsukimiken: [{ id: 9, stop: SIDEWALKS[0].gate(2) - 1.28 }, { id: 11, stop: SIDEWALKS[0].gate(2) - 2.2 }],
    'Aoba Mart': [{ id: 4, stop: SIDEWALKS[0].gate(1) + 5.9 }, { id: 5, stop: SIDEWALKS[0].gate(1) + 7.1 }],
  }
  for (const [shop, slots] of Object.entries(shops)) {
    for (const { id, stop } of slots) {
      pedestrians[id].visit = {
        stop, heading: shop === 'Tsukimiken' ? Math.PI : -Math.PI / 2,
        remaining: 0, cooldownUntil: 0,
        attempts: 0, successes: 0, completed: 0, roll: visitRoll(seed ^ Math.imul(id, 0x85ebca6b)),
      }
    }
  }

  for (const bench of benches) {
    const route = SIDEWALKS[1]
    const gate = route.gate(bench.side)
    const start = route.sample(gate)
    const along = (bench.x - start.x) * Math.sin(start.heading) + (bench.z - start.z) * Math.cos(start.heading)
    const entry = gate + along
    const stop = route.sample(entry)
    const approachLength = Math.hypot(bench.x - stop.x, bench.z - stop.z) - sitBack
    pedestrians[bench.id].rest = { bench, entry, approachLength,
      elapsed: 0, cooldown: 0, offset: 0, sit: 0 }
  }

  let raining = false
  let weatherRevision = 0
  for (const site of shelters) {
    pedestrians[site.id].shelter = { site, entry: SIDEWALKS[0].gate(site.side) + site.along,
      progress: 0, travelRate: 1, remaining: 0, readyAt: 0, completed: 0, reached: false }
  }
  function shelterStatus() {
    return shelters.map(({ id, x, z }) => {
      const { mode, shelter } = pedestrians[id]
      return { id, x, z, state: movementState(mode), completed: shelter!.completed, remaining: shelter!.remaining }
    })
  }

  function visits() {
    return Object.fromEntries(Object.entries(shops).map(([name, slots]) => {
      const ids = slots.map(slot => slot.id)
      const records = ids.map(id => pedestrians[id].visit!)
      return [name, {
        assigned: ids, current: ids.filter(id => pedestrians[id].mode === 'visiting'),
        attempts: records.reduce((sum, r) => sum + r.attempts, 0),
        successes: records.reduce((sum, r) => sum + r.successes, 0),
        completed: records.reduce((sum, r) => sum + r.completed, 0),
      }]
    }))
  }

  const carNextDistances = new Float64Array(cars.length)
  const signals = SIDES.map((_, index) => signalAt(index, 0))
  const crossingActive = new Uint8Array(SIDES.length)
  const crossingBlocked = new Uint8Array(SIDES.length)
  let time = 0
  let accumulator = 0
  let enabled = true

  function updateCars(dt: number) {
    crossingActive.fill(0)
    for (const pedestrian of pedestrians) {
      if (pedestrian.mode === 'crossing') crossingActive[pedestrian.gate] = 1
    }

    for (const car of cars) {
      const { direction, route } = LANES[car.lane]
      let available = Infinity
      for (const other of cars) {
        if (other.id === car.id || other.lane !== car.lane) continue
        available = Math.min(
          available,
          distanceAhead(car.distance, other.distance, direction, route.length) - FOLLOWING_DISTANCE,
        )
      }

      for (let side = 0; side < signals.length; side++) {
        if (signals[side].vehicle === 'green' && !crossingActive[side]) continue
        const ahead = distanceAhead(car.distance, route.gate(side), direction, route.length)
        if (ahead >= STOP_DISTANCE - 0.001) available = Math.min(available, ahead - STOP_DISTANCE)
      }

      const previousSpeed = car.speed
      const safeSpeed = Math.sqrt(2 * CAR_BRAKE * Math.max(0, available))
      const targetSpeed = Math.min(car.cruise, safeSpeed)
      const rate = targetSpeed < car.speed ? CAR_BRAKE : CAR_ACCELERATION
      const speedStep = Math.sign(targetSpeed - car.speed) * rate * dt
      car.speed += Math.abs(speedStep) > Math.abs(targetSpeed - car.speed)
        ? targetSpeed - car.speed
        : speedStep
      const distance = Math.min(car.speed * dt, Math.max(0, available))
      car.speed = distance / dt
      car.braking = previousSpeed - car.speed > 0.025 || car.speed < 0.08
      carNextDistances[car.id] = wrap(car.distance + distance * direction, route.length)
    }
    for (const car of cars) car.distance = carNextDistances[car.id]
  }

  function findBlockedCrossings() {
    crossingBlocked.fill(0)
    for (const car of cars) {
      const { route } = LANES[car.lane]
      for (let side = 0; side < signals.length; side++) {
        const distance = Math.abs(car.distance - route.gate(side))
        if (Math.min(distance, route.length - distance) < CROSSING_CLEARANCE) crossingBlocked[side] = 1
      }
    }
  }

  function chooseGoal(pedestrian: Pedestrian) {
    const candidates = []
    for (const poi of POIS) {
      const route = planCitizenRoute(pedestrian.sidewalk, pedestrian.distance, pedestrian.direction,
        pedestrian.offset, poi, enabled ? undefined : crossingBlocked)
      const distance = route?.distance ?? Infinity
      if (route) candidates.push({
        poi, distance, travelTime: distance / pedestrian.speed + (route.gate < 0 ? 0 : 8), route,
      })
    }
    const goal = citizens.choose(pedestrian.id, candidates, time, raining)
    if (goal) pedestrian.direction = goal.route.direction
    return goal
  }

  function canCross(pedestrian: Pedestrian) {
    return !crossingBlocked[pedestrian.gate]
      && signals[pedestrian.gate].walkTime > CROSSING_DISTANCE / pedestrian.speed + 0.26
  }

  function moveCitizen(pedestrian: Pedestrian, dt: number) {
    const { id } = pedestrian
    const citizen = citizens.get(id)!
    citizens.tick(id, dt, raining, pedestrian.mode === 'walking' || pedestrian.mode === 'crossing', time)
    const step = pedestrian.speed * dt
    let goal = citizen.goal
    if (pedestrian.mode === 'crossing') {
      pedestrian.crossing += step
      if (pedestrian.crossing >= CROSSING_DISTANCE) {
        pedestrian.sidewalk = 1 - pedestrian.sidewalk
        pedestrian.distance = gateDistance(pedestrian, pedestrian.gate)
        pedestrian.crossing = 0
        if (goal) pedestrian.direction = goal.route.afterCrossing
        transition(pedestrian, 'walking', time)
      }
      return 1
    }
    if (pedestrian.mode === 'interacting') {
      if (goal?.startedAt !== undefined && time >= goal.startedAt + goal.duration) {
        citizens.complete(id, time)
        pedestrian.eating = false
        transition(pedestrian, 'walking', time)
      }
      return 0
    }
    if (goal && !citizens.activeAvailable(id, raining)) {
      citizens.cancel(id, time, 'poi_unavailable')
      goal = null
      if (pedestrian.mode === 'waiting') transition(pedestrian, 'walking', time, true)
    }
    if (pedestrian.mode === 'waiting') {
      if (canCross(pedestrian)) transition(pedestrian, 'crossing', time)
      else if (!enabled && crossingBlocked[pedestrian.gate] && goal) {
        const route = planCitizenRoute(pedestrian.sidewalk, pedestrian.distance, pedestrian.direction,
          pedestrian.offset, goal.poi, crossingBlocked)
        if (route) {
          goal.route = route
          pedestrian.direction = route.direction
        } else citizens.cancel(id, time, 'crossings_blocked')
        transition(pedestrian, 'walking', time, true)
      }
      return 0
    }

    if (!goal) {
      const availability = citizens.revision + weatherRevision
      const idleRecheck = citizen.lastDecision?.poiId === null && pedestrian.availabilitySeen !== availability
        && time - citizen.lastDecision.time >= .5
      if (time >= citizen.nextDecisionAt || idleRecheck) {
        pedestrian.availabilitySeen = availability
        if (idleRecheck) citizen.nextDecisionAt = time
        goal = chooseGoal(pedestrian)
      }
    }
    const route = SIDEWALKS[pedestrian.sidewalk]
    if (goal) {
      const atCorrectSidewalk = pedestrian.sidewalk === goal.poi.sidewalk
      const target = atCorrectSidewalk ? goal.poi.distance : gateDistance(pedestrian, goal.route.gate)
      const gap = distanceAhead(pedestrian.distance, target, pedestrian.direction, route.length)
      const pace = Math.min(1, Math.sqrt(gap / .55))
      if (gap < 1e-8 || gap <= step * pace) {
        pedestrian.distance = target
        if (atCorrectSidewalk) {
          citizens.begin(id, time)
          pedestrian.interactionHeading = goal.poi.heading
          pedestrian.eating = goal.poi.action === 'eat' || goal.poi.action === 'buy_food'
          transition(pedestrian, 'interacting', time)
        } else {
          pedestrian.gate = goal.route.gate
          transition(pedestrian, 'waiting', time)
        }
        return 0
      }
      pedestrian.distance = wrap(pedestrian.distance + step * pace * pedestrian.direction, route.length)
      return pace
    }
    pedestrian.distance = wrap(pedestrian.distance + step * pedestrian.direction, route.length)
    return 1
  }

  function updateCitizen(pedestrian: Pedestrian, dt: number) {
    const pace = moveCitizen(pedestrian, dt)
    updatePose(pedestrian, dt, pace, pedestrian.speed * dt * pace)
  }

  function recordLegacy(pedestrian: Pedestrian, previous: Behavior['mode'], completedShelters: number) {
    const { id, mode } = pedestrian
    if (mode === previous) return
    if (mode === 'visiting' || previous === 'visiting') {
      const poi = id === 9 || id === 11 ? 'tsukimiken' : 'aoba-mart'
      events.add({ time, npcId: id, type: mode === 'visiting' ? 'arrived_at_shop' : 'visit_finished', poi, reason: 'shop_visit' })
    }
    if (mode === 'approaching_bench' || previous === 'leaving_bench') {
      const poi = id === 1 ? 'north-bench' : 'west-bench'
      events.add({ time, npcId: id, type: mode === 'approaching_bench' ? 'bench_rest_started' : 'bench_rest_finished', poi, reason: 'bench_rest' })
    }
    let shelterEvent: CityEventType | undefined
    if (mode === 'sheltered') shelterEvent = 'shelter_entered'
    else if (pedestrian.shelter && pedestrian.shelter.completed > completedShelters) shelterEvent = 'shelter_left'
    if (shelterEvent) events.add({ time, npcId: id, type: shelterEvent,
      poi: id === 0 ? 'east-awning' : 'south-awning', reason: 'rain_shelter' })
  }

  function updatePedestrians(dt: number) {
    for (const pedestrian of pedestrians) {
      if (experiment.has(pedestrian.id)) {
        updateCitizen(pedestrian, dt)
        continue
      }
      const route = SIDEWALKS[pedestrian.sidewalk]
      const visit = pedestrian.visit
      const rest = pedestrian.rest
      const cover = pedestrian.shelter
      const mode = pedestrian.mode
      const completedShelters = cover?.completed ?? 0
      const strideDistance = pedestrian.speed * dt
      const walkingOnRoute = movementState(mode) === 'walking'
      // A required gate has priority over elective stops. Crossing clearance
      // and sufficient green time are still decided by the traffic simulation.
      const gate = walkingOnRoute ? SIDES.findIndex((_, side) => {
        const gap = distanceAhead(pedestrian.distance, gateDistance(pedestrian, side), pedestrian.direction, route.length)
        return gap > .0001 && gap <= strideDistance
      }) : -1
      const mustWait = gate >= 0 && pedestrian.passed + 1 >= pedestrian.crossingEvery
      const brakingDistance = 0.55
      if (visit && canStart(mode, 'approaching_shop', mustWait) && pedestrian.sidewalk === 0
        && time >= visit.cooldownUntil && passes(pedestrian.distance, visit.stop - pedestrian.direction * brakingDistance,
          pedestrian.direction, strideDistance, route.length) && attemptVisit(visit, time)) {
        transition(pedestrian, 'approaching_shop', time)
      }
      const ahead = visit && pedestrian.mode === 'approaching_shop'
        ? distanceAhead(pedestrian.distance, visit.stop, pedestrian.direction, route.length) : Infinity
      const benchAhead = rest && canStart(pedestrian.mode, 'approaching_bench', mustWait) && pedestrian.sidewalk === 1 && time >= rest.cooldown
        ? distanceAhead(pedestrian.distance, rest.entry, pedestrian.direction, route.length) : Infinity
      const shelterAhead = cover && raining && canStart(pedestrian.mode, 'seeking_shelter', mustWait) && pedestrian.sidewalk === 0 && time >= cover.readyAt
        ? distanceAhead(pedestrian.distance, cover.entry, pedestrian.direction, route.length) : Infinity
      const pace = Math.min(1, Math.sqrt(Math.min(ahead, benchAhead, shelterAhead) / brakingDistance))
      const desiredDistance = pedestrian.speed * pace * dt
      if (cover && isSheltering(mode)) {
        transition(pedestrian, advanceShelter(cover, mode, raining, dt, time), time)
      } else if (rest && isRest(mode)) {
        transition(pedestrian, advanceBench(rest, mode, dt, time), time)
      } else if (visit && mode === 'visiting') {
        transition(pedestrian, advanceVisit(visit, dt, time), time)
      } else if (mode === 'crossing') {
        pedestrian.crossing += desiredDistance
        if (pedestrian.crossing >= CROSSING_DISTANCE) {
          pedestrian.sidewalk = 1 - pedestrian.sidewalk
          pedestrian.distance = gateDistance(pedestrian, pedestrian.gate)
          pedestrian.crossing = 0
          transition(pedestrian, 'walking', time)
        }
      } else if (mode === 'waiting') {
        if (canCross(pedestrian)) {
          pedestrian.passed = 0
          transition(pedestrian, 'crossing', time)
        }
      } else if (mustWait) {
        pedestrian.gate = gate
        pedestrian.passed++
        pedestrian.distance = gateDistance(pedestrian, gate)
        transition(pedestrian, 'waiting', time)
      } else if (cover && shelterAhead > 0 && shelterAhead <= desiredDistance) {
        cover.travelRate = 1
        pedestrian.distance = cover.entry
        transition(pedestrian, 'seeking_shelter', time)
      } else if (rest && benchAhead > 0 && benchAhead <= desiredDistance) {
        pedestrian.distance = rest.entry
        transition(pedestrian, 'approaching_bench', time)
      } else if (visit && ahead <= desiredDistance) {
        visit.remaining = 5
        visit.successes++
        pedestrian.distance = visit.stop
        transition(pedestrian, 'visiting', time)
      } else {
        if (gate >= 0 && passes(pedestrian.distance, gateDistance(pedestrian, gate), pedestrian.direction, desiredDistance, route.length)) pedestrian.passed++
        pedestrian.distance = wrap(pedestrian.distance + desiredDistance * pedestrian.direction, route.length)
      }

      updatePose(pedestrian, dt, pace, desiredDistance)
      recordLegacy(pedestrian, mode, completedShelters)
    }
  }

  function updatePose(pedestrian: Pedestrian, dt: number, pace: number, desiredDistance: number) {
    const rest = pedestrian.rest
    const cover = pedestrian.shelter
    const { heading } = pedestrianPose(pedestrian)
    const delta = wrap(heading - pedestrian.heading + Math.PI, Math.PI * 2) - Math.PI
    pedestrian.heading += delta * Math.min(1, dt * 9)
    const moving = movementState(pedestrian.mode) === 'walking' || pedestrian.mode === 'crossing'
    const approaching = pedestrian.mode === 'approaching_bench' || pedestrian.mode === 'leaving_bench'
    const shelterWalk = pedestrian.mode === 'seeking_shelter' || pedestrian.mode === 'leaving_shelter'
    const shelterPace = shelterWalk && cover ? .7 * Math.abs(cover.travelRate) * Math.sin(Math.PI * cover.progress) : 0
    const detourPace = approaching && rest ? Math.sin(Math.PI * rest.elapsed / approachSeconds) * .75 : shelterPace
    if (approaching || shelterWalk) pedestrian.phase += detourPace * dt * 9
    if (moving) pedestrian.phase += desiredDistance * 9
    if (pedestrian.mode === 'sheltered') pedestrian.stride = 0
    const lookout = pedestrian.mode === 'waiting' ? 1 : 0
    pedestrian.lookout += (lookout - pedestrian.lookout) * -Math.expm1(-dt * 3)
    const targetStride = moving ? pace : detourPace
    pedestrian.stride += (targetStride - pedestrian.stride) * Math.min(1, dt * 8)
  }

  function update(dt: number, traffic: boolean) {
    enabled = traffic
    if (!Number.isFinite(dt) || dt <= 0) return false
    // Gate reservations, signals and weather decisions must see the same ticks at every display rate.
    accumulator += dt
    if (accumulator < STEP - 1e-10) return false
    while (accumulator >= STEP - 1e-10) {
      accumulator -= STEP
      time += STEP
      for (let side = 0; side < signals.length; side++) signals[side] = signalAt(side, time)
      if (enabled) updateCars(STEP)
      findBlockedCrossings()
      updatePedestrians(STEP)
    }
    return true
  }

  function snapshot() {
    return {
      cars: cars.map((car) => {
        const { route, direction, name } = LANES[car.lane]
        const { x, z, heading } = route.sample(car.distance)
        return {
          id: car.id,
          x,
          y: 0.025,
          z,
          heading: heading + (direction < 0 ? Math.PI : 0),
          speed: enabled ? car.speed : 0,
          braking: enabled && car.braking,
          lane: name,
        }
      }),
      pedestrians: pedestrians.map((pedestrian) => {
        const { x, y, z } = pedestrianPose(pedestrian)
        return {
          id: pedestrian.id,
          x,
          y,
          z,
          heading: pedestrian.heading,
          state: movementState(pedestrian.mode),
          lookout: pedestrian.lookout,
          sit: pedestrian.rest?.sit ?? 0,
          stride: pedestrian.stride,
          phase: pedestrian.phase,
          umbrella: pedestrian.umbrella,
          eating: pedestrian.eating ?? false,
        }
      }),
      signals: signals.map((signal) => ({ ...signal })),
      carCount: cars.length,
      pedestrianCount: pedestrians.length,
      time,
      enabled,
    }
  }

  function behavior() {
    return pedestrians.map(({ id, mode, actionSince }) => ({
      id, action: actionOf(mode), state: movementState(mode), reason: reasonOf(mode), actionSince,
    }))
  }
  return { snapshot, behavior, update, visits, shelterStatus, citizens: citizens.snapshot, events: events.snapshot,
    get eventSequence() { return events.sequence }, setRain(on: boolean) {
      if (raining !== on) weatherRevision++
      raining = on
    }, get raining() { return raining } }
}

function pedestrianPose(pedestrian: Pedestrian) {
  const route = SIDEWALKS[pedestrian.sidewalk]
  const position = route.sample(pedestrian.distance)
  const direction = pedestrian.direction < 0 ? Math.PI : 0
  const rest = pedestrian.rest
  const cover = pedestrian.shelter
  if (cover && isSheltering(pedestrian.mode)) {
    const t = cover.progress
    const blend = t * t * (3 - 2 * t)
    const heading = cover.site.outward + (pedestrian.mode === 'seeking_shelter' ? Math.PI : 0)
    return { x: position.x + (cover.site.x - position.x) * blend, y: .12,
      z: position.z + (cover.site.z - position.z) * blend, heading }
  }
  if (rest && isRest(pedestrian.mode)) {
    const heading = rest.bench.heading
    const offset = rest.offset + sitBack * rest.sit
    const turning = pedestrian.mode === 'approaching_bench' && rest.elapsed < .85
    return { x: position.x - Math.sin(heading)*offset, z: position.z - Math.cos(heading)*offset,
      y: .12, heading: turning ? heading + Math.PI : heading }
  }
  if (pedestrian.mode === 'interacting') return { ...position, y: 0.12, heading: pedestrian.interactionHeading! }
  if (pedestrian.mode === 'visiting' && pedestrian.visit) return { ...position, y: 0.12, heading: pedestrian.visit.heading }
  if (movementState(pedestrian.mode) === 'walking') {
    return { ...position, y: 0.12, heading: position.heading + direction }
  }
  const destination = SIDEWALKS[1 - pedestrian.sidewalk].sample(
    SIDEWALKS[1 - pedestrian.sidewalk].gate(pedestrian.gate) + pedestrian.offset,
  )
  const dx = destination.x - position.x
  const dz = destination.z - position.z
  const progress = pedestrian.crossing / CROSSING_DISTANCE
  return {
    x: position.x + dx * progress,
    z: position.z + dz * progress,
    y: 0.12 - 0.095 * Math.min(1, pedestrian.crossing / 0.44, (CROSSING_DISTANCE - pedestrian.crossing) / 0.44),
    heading: Math.atan2(dx, dz),
  }
}
