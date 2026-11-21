import { expect, test } from '@playwright/test'
import type { createMobilitySimulation } from '../../src/traffic/simulation'

type Records = ReturnType<ReturnType<typeof createMobilitySimulation>['behavior']>
type LiveSnapshot = ReturnType<Window['nox']['snapshot']> & { behavior: Records; paused: boolean }

test('reports a live shop visit and two independent bench rests through the public snapshot', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    // Replay startup entropy so the first Aoba customer accepts the stop.
    let seed = 4
    Math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296)
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => raf(time => callback(time*8))
  })
  await page.goto('./?debug=visits')
  await page.waitForFunction(() => window.nox?.snapshot().ready)
  await page.addStyleTag({ content: '.viewport {width:160px;height:120px;min-height:0;flex:none}' })
  const records = () => page.evaluate(() => (window.nox.snapshot() as LiveSnapshot).behavior)
  const initial = await records()
  expect(initial.map(p=>p.id)).toEqual(Array.from({length:16},(_,i)=>i))
  expect(initial.every(p => p.action === 'walk' && p.state === 'walking' && p.reason === 'roaming' && p.actionSince === 0)).toBe(true)
  await page.locator('#pause').click()
  await page.waitForFunction(() => {
    const { behavior } = window.nox.snapshot() as LiveSnapshot
    if (behavior[4].state !== 'visiting' || behavior[1].state !== 'seated' || behavior[15].state !== 'seated') return false
    document.getElementById('pause')!.click()
    return true
  }, undefined, {timeout:30_000})
  const held = await records()
  expect(held[4]).toMatchObject({ action:'visit', reason:'shop_visit' })
  for (const id of [1,15]) expect(held[id]).toMatchObject({ action:'rest', reason:'bench_rest' })
  expect(held[4].actionSince).toBeLessThan(held[15].actionSince)
  await page.locator('#rain').click()
  expect(await records()).toEqual(held)
  expect(errors).toEqual([])
})
