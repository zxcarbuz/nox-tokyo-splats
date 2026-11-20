import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildMobility } from '../src/traffic/mobility'
import { createRingRoute } from '../src/traffic/routes'
import { createMobilitySimulation } from '../src/traffic/simulation'

const XZ = ({ x, z }: { x: number; z: number }) => [x, z]

function crossingSide(x: number, z: number) {
  if (Math.abs(x) < 2.18) return z < 0 ? 0 : 2
  if (Math.abs(z) < 2.18) return x > 0 ? 1 : 3
  return -1
}

describe('rounded traffic routes', () => {
  it('places every crossing on its road and aligns the lane direction', () => {
    const route = createRingRoute(11.86, 2.24)
    const target = [[0, -11.86], [11.86, 0], [0, 11.86], [-11.86, 0]]
    for (let side = 0; side < target.length; side++) {
      const gate = route.gate(side)
      const { x, z, heading } = route.sample(gate)
      const next = route.sample(gate + .001)
      expect(x).toBeCloseTo(target[side][0])
      expect(z).toBeCloseTo(target[side][1])
      expect((next.x - x) / .001).toBeCloseTo(Math.sin(heading), 5)
      expect((next.z - z) / .001).toBeCloseTo(Math.cos(heading), 5)
    }
  })

  it('turns smoothly across each straight-to-curve seam', () => {
    const edge = 10.14
    const radius = 1.02
    const route = createRingRoute(edge, radius)
    const curveStart = 2 * (edge - radius)
    for (const position of [0, curveStart, route.length / 4, route.length / 4 + curveStart]) {
      const before = route.sample(position - .001)
      const after = route.sample(position + .001)
      expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(.0021)
      expect(Math.cos(after.heading - before.heading)).toBeGreaterThan(.99999)
    }
  })
})

describe('traffic, pedestrians and signals', () => {
  it('advances real instance positions and freezes only cars when traffic is disabled', () => {
    const scene = new THREE.Scene()
    const mobility = buildMobility(scene)
    const start = mobility.snapshot()
    expect(start.carCount).toBe(start.cars.length)
    expect(start.pedestrianCount).toBe(start.pedestrians.length)
    expect(start.pedestrians.some(({ umbrella }) => umbrella)).toBe(true)

    const group = scene.children[0] as THREE.Group
    const firstCar = group.children[0] as THREE.InstancedMesh
    const modelPosition = new THREE.Vector3()
    const matrix = new THREE.Matrix4()
    firstCar.getMatrixAt(0, matrix)
    modelPosition.setFromMatrixPosition(matrix)
    expect(modelPosition.x).toBeCloseTo(start.cars[0].x)
    expect(modelPosition.z).toBeCloseTo(start.cars[0].z)

    mobility.update(2, false)
    const trafficOff = mobility.snapshot()
    expect(trafficOff.cars.map(XZ)).toEqual(start.cars.map(XZ))
    expect(trafficOff.pedestrians.map(XZ)).not.toEqual(start.pedestrians.map(XZ))
    expect(trafficOff.enabled).toBe(false)
    mobility.update(0, false)
    expect(mobility.snapshot()).toEqual(trafficOff)
    mobility.update(2, true)
    const resumed = mobility.snapshot()
    expect(resumed.cars.map(XZ)).not.toEqual(trafficOff.cars.map(XZ))
    firstCar.getMatrixAt(0, matrix)
    modelPosition.setFromMatrixPosition(matrix)
    expect(modelPosition.x).toBeCloseTo(resumed.cars[0].x)
    expect(modelPosition.z).toBeCloseTo(resumed.cars[0].z)
  })

  it('brakes for queues and gives the crosswalk to one mode at a time', () => {
    const simulation = createMobilitySimulation()
    const visited: number[] = []
    let stopped = false
    let moving = false
    let nearest = Infinity
    let waited = false

    for (let tick = 0; tick < 1800; tick++) {
      simulation.update(0.1, true)
      const { cars, pedestrians, signals } = simulation.snapshot()
      for (const car of cars) {
        stopped ||= car.speed < 0.01
        moving ||= car.speed > 2
        for (const other of cars) {
          if (car.id <= other.id || car.lane !== other.lane) continue
          nearest = Math.min(nearest, Math.hypot(car.x - other.x, car.z - other.z))
        }
      }
      for (const pedestrian of pedestrians) {
        waited ||= pedestrian.state === 'waiting'
        if (pedestrian.state !== 'crossing') continue
        const side = crossingSide(pedestrian.x, pedestrian.z)
        if (!visited.includes(side)) visited.push(side)
        expect(signals[side].vehicle).toBe('red')
        expect(cars.some((car) => crossingSide(car.x, car.z) === side)).toBe(false)
      }
    }
    expect(visited.sort()).toEqual([0, 1, 2, 3])
    expect(waited).toBe(true)
    expect(stopped).toBe(true)
    expect(moving).toBe(true)
    expect(nearest).toBeGreaterThan(2)
  })

  it('holds pedestrians back from a crossing occupied by a paused car', () => {
    const simulation = createMobilitySimulation()
    const paused = simulation.snapshot().cars
    expect(paused.some((car) => crossingSide(car.x, car.z) === 0)).toBe(true)
    for (let tick = 0; tick < 250; tick++) {
      simulation.update(.15, false)
      const { pedestrians } = simulation.snapshot()
      expect(pedestrians.some((pedestrian) => pedestrian.state === 'crossing' && crossingSide(pedestrian.x, pedestrian.z) === 0)).toBe(false)
    }
  })
})
