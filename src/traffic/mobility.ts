import * as THREE from 'three'
import { buildPedestrians } from './pedestrians'
import { buildSignals } from './signals'
import { createMobilitySimulation } from './simulation'
import { buildVehicles } from './vehicles'

export function buildMobility(scene: THREE.Scene) {
  const simulation = createMobilitySimulation()
  const group = new THREE.Group()
  group.name = 'Traffic and pedestrian crossings'
  scene.add(group)

  const first = simulation.snapshot()
  const moveVehicles = buildVehicles(group, first.cars)
  const movePedestrians = buildPedestrians(group, first.pedestrians)
  const changeSignals = buildSignals(group)
  let lastTraffic: boolean | undefined

  function update(dt: number, traffic: boolean) {
    const advanced = simulation.update(dt, traffic)
    if (!advanced && lastTraffic === traffic) return
    lastTraffic = traffic
    const state = simulation.snapshot()
    moveVehicles(state.cars)
    movePedestrians(state.pedestrians, state.time)
    changeSignals(state.signals)
  }

  update(0, true)
  return { update, behavior: simulation.behavior, snapshot: simulation.snapshot, visits: simulation.visits, setRain: simulation.setRain,
    citizens: simulation.citizens, events: simulation.events,
    get eventSequence() { return simulation.eventSequence },
    weather: () => ({ raining: simulation.raining, shelters: simulation.shelterStatus() }) }
}
