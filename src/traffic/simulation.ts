import { createRingRoute, SIDES, wrap } from './routes'
import type { Side } from './routes'

export const CYCLE_LENGTH = 22
const GREEN_END = 10.6
const WALK_START = 12.8
const WALK_END = 20.8
const OFFSETS = [0.7, 11.4, 14.1, 7.1]
const STOP_DISTANCE = 2.26
const CROSSING_CLEARANCE = 2.17
const FOLLOWING_DISTANCE = 2.43
const MAX_STEP = 1 / 30
const CAR_BRAKE = 5.2
const CAR_ACCELERATION = 2.25

const LANES = [
  { name: 'outer', direction: 1, route: createRingRoute(11.86, 2.24) },
  { name: 'inner', direction: -1, route: createRingRoute(10.14, 1.02) },
] as const
const SIDEWALKS = [createRingRoute(8.73, 0.22), createRingRoute(13.65, 0.69)]
const CROSSING_DISTANCE = 13.65 - 8.73

export type VehiclePhase = 'green' | 'yellow' | 'red'
export type PedestrianState = 'walking' | 'waiting' | 'crossing' | 'visiting'

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

interface Pedestrian {
  id: number
  sidewalk: number
  direction: number
  distance: number
  speed: number
  heading: number
  stride: number
  phase: number
  offset: number
  umbrella: boolean
  state: PedestrianState
  visit?: { stop: number; heading: number; remaining: number; brakingDistance: number }
  gate: number
  crossing: number
  crossingEvery: number
  passed: number
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
    stride: 0,
    phase: id * 1.87,
    offset: ((id * 5) % 9 - 4) * 0.13,
    umbrella: id % 5 !== 0,
    state: 'walking',
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

export function createMobilitySimulation() {
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
  // Both stops are on the initial sidewalk, before the next crossing.
  pedestrians[9].visit = { stop: SIDEWALKS[1].gate(2) - 1.28, heading: Math.PI, remaining: 5, brakingDistance: 0 }
  // On the east straight route distance increases with z. Face west toward Aoba Mart.
  pedestrians[4].visit = { stop: SIDEWALKS[0].gate(1) + 5.9, heading: -Math.PI / 2, remaining: 5, brakingDistance: 0.55 }

  const carNextDistances = new Float64Array(cars.length)
  const signals = SIDES.map((_, index) => signalAt(index, 0))
  const crossingActive = new Uint8Array(SIDES.length)
  const crossingBlocked = new Uint8Array(SIDES.length)
  let time = 0
  let enabled = true

  function updateCars(dt: number) {
    crossingActive.fill(0)
    for (const pedestrian of pedestrians) {
      if (pedestrian.state === 'crossing') crossingActive[pedestrian.gate] = 1
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

  function updatePedestrians(dt: number) {
    for (const pedestrian of pedestrians) {
      const route = SIDEWALKS[pedestrian.sidewalk]
      const visit = pedestrian.visit
      const ahead = visit && visit.remaining > 0 && pedestrian.state === 'walking'
        ? distanceAhead(pedestrian.distance, visit.stop, pedestrian.direction, route.length)
        : Infinity
      const pace = visit && visit.brakingDistance > 0 ? Math.min(1, Math.sqrt(ahead / visit.brakingDistance)) : 1
      const desiredDistance = pedestrian.speed * pace * dt
      if (visit && pedestrian.state === 'visiting') {
        visit.remaining = Math.max(0, visit.remaining - dt)
        if (visit.remaining === 0) pedestrian.state = 'walking'
      } else if (visit && ahead <= desiredDistance) {
        pedestrian.distance = visit.stop
        pedestrian.state = 'visiting'
      } else if (pedestrian.state === 'crossing') {
        pedestrian.crossing += desiredDistance
        if (pedestrian.crossing >= CROSSING_DISTANCE) {
          pedestrian.sidewalk = 1 - pedestrian.sidewalk
          pedestrian.distance = gateDistance(pedestrian, pedestrian.gate)
          pedestrian.state = 'walking'
          pedestrian.crossing = 0
        }
      } else if (pedestrian.state === 'waiting') {
        const walkTime = signals[pedestrian.gate].walkTime
        if (!crossingBlocked[pedestrian.gate] && walkTime > CROSSING_DISTANCE / pedestrian.speed + 0.26) {
          pedestrian.state = 'crossing'
          pedestrian.passed = 0
        }
      } else {
        const gate = SIDES.findIndex((_, side) => {
          const ahead = distanceAhead(pedestrian.distance, gateDistance(pedestrian, side), pedestrian.direction, route.length)
          return ahead > 0.0001 && ahead <= desiredDistance
        })
        if (gate >= 0 && ++pedestrian.passed >= pedestrian.crossingEvery) {
          pedestrian.gate = gate
          pedestrian.distance = gateDistance(pedestrian, gate)
          pedestrian.state = 'waiting'
        } else {
          pedestrian.distance = wrap(pedestrian.distance + desiredDistance * pedestrian.direction, route.length)
        }
      }

      const { heading } = pedestrianPose(pedestrian)
      const delta = wrap(heading - pedestrian.heading + Math.PI, Math.PI * 2) - Math.PI
      pedestrian.heading += delta * Math.min(1, dt * 9)
      const moving = pedestrian.state === 'walking' || pedestrian.state === 'crossing'
      if (moving) pedestrian.phase += desiredDistance * 9
      const targetStride = moving ? pace : 0
      pedestrian.stride += (targetStride - pedestrian.stride) * Math.min(1, dt * 8)
    }
  }

  function update(dt: number, traffic: boolean) {
    enabled = traffic
    if (!Number.isFinite(dt) || dt <= 0) return
    for (let remaining = dt; remaining > 1e-8;) {
      const step = Math.min(remaining, MAX_STEP)
      remaining -= step
      time += step
      for (let side = 0; side < signals.length; side++) signals[side] = signalAt(side, time)
      if (enabled) updateCars(step)
      findBlockedCrossings()
      updatePedestrians(step)
    }
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
          state: pedestrian.state,
          stride: pedestrian.stride,
          phase: pedestrian.phase,
          umbrella: pedestrian.umbrella,
        }
      }),
      signals: signals.map((signal) => ({ ...signal })),
      carCount: cars.length,
      pedestrianCount: pedestrians.length,
      time,
      enabled,
    }
  }

  return { snapshot, update }
}

function pedestrianPose(pedestrian: Pedestrian) {
  const route = SIDEWALKS[pedestrian.sidewalk]
  const position = route.sample(pedestrian.distance)
  const direction = pedestrian.direction < 0 ? Math.PI : 0
  if (pedestrian.state === 'visiting' && pedestrian.visit) return { ...position, y: 0.12, heading: pedestrian.visit.heading }
  if (pedestrian.state === 'walking') {
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
