import { expect, it } from 'vitest'
import { Group, InstancedMesh, Matrix4 } from 'three'
import { buildPedestrians } from '../src/traffic/pedestrians'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('plants visiting feet while the upper body moves on simulation time', () => {
  const states = createMobilitySimulation(42).snapshot().pedestrians
  for (const p of states) Object.assign(p, { state: 'visiting', stride: 0, x: 0, z: 0, heading: 0 })
  const group = new Group()
  const pose = buildPedestrians(group, states)
  const matrix = (part: number, slot = 0) => {
    const value = new Matrix4()
    ;(group.children[part] as InstancedMesh).getMatrixAt(slot, value)
    return value
  }
  pose(states, 2)
  const feet = matrix(8), head = matrix(2), hand = matrix(5)
  const hairOffset = head.clone().invert().multiply(matrix(3))
  const sim = createMobilitySimulation(42)
  sim.update(2, true)
  sim.update(0, true)
  pose(states, sim.snapshot().time)
  expect(matrix(2)).toEqual(head)
  pose(states, 3.5)
  expect(matrix(8)).toEqual(feet)
  expect(matrix(2)).not.toEqual(head)
  expect(matrix(5)).not.toEqual(hand)
  expect(matrix(2).clone().invert().multiply(matrix(3)).elements)
    .toEqual(hairOffset.elements.map(n => expect.closeTo(n, 5)))
  // Remove differing character scales before comparing head directions.
  expect(new Matrix4().extractRotation(matrix(2, 0)))
    .not.toEqual(new Matrix4().extractRotation(matrix(2, 1)))
})
