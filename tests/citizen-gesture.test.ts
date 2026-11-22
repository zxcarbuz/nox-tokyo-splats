import { expect, it } from 'vitest'
import { Group, InstancedMesh, Matrix4, Vector3 } from 'three'
import { buildPedestrians } from '../src/traffic/pedestrians'
import { createMobilitySimulation } from '../src/traffic/simulation'

it('a real food interaction raises the free hand while the umbrella hand and shoes keep their poses', () => {
  const sim = createMobilitySimulation(42)
  let state = sim.snapshot()
  for (let i = 0; i < 600 && !state.pedestrians.some(p => p.eating && p.umbrella); i++) {
    sim.update(0.25, true)
    state = sim.snapshot()
  }
  const actor = state.pedestrians.find(p => p.eating && p.umbrella)!
  expect(actor.state).toBe('interacting')
  const group = new Group()
  const pose = buildPedestrians(group, state.pedestrians)
  const matrix = (part: number, limb: number) => {
    const transform = new Matrix4()
    ;(group.children[part] as InstancedMesh).getMatrixAt(actor.id * 2 + limb, transform)
    return transform
  }
  let raised = 0
  for (let i = 0; i < 24; i++) {
    const time = state.time + i / 8
    actor.eating = false
    pose(state.pedestrians, time)
    const neutralHand = new Vector3().setFromMatrixPosition(matrix(5, 0))
    const grip = matrix(5, 1), shoe = matrix(8, 0)
    actor.eating = true
    pose(state.pedestrians, time)
    raised = Math.max(raised, new Vector3().setFromMatrixPosition(matrix(5, 0)).y - neutralHand.y)
    expect(matrix(5, 1)).toEqual(grip)
    expect(matrix(8, 0)).toEqual(shoe)
  }
  expect(raised).toBeGreaterThan(0.15)
})
