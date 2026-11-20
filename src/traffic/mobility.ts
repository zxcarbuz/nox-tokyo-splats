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
    if (dt === 0 && lastTraffic === traffic) return
    lastTraffic = traffic
    simulation.update(dt, traffic)
    const state = simulation.snapshot()
    moveVehicles(state.cars)
    movePedestrians(state.pedestrians, state.time)
    changeSignals(state.signals)
  }

  update(0, true)
  return { update, snapshot: simulation.snapshot }
}
