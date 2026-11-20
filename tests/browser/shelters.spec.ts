import { test, expect } from '@playwright/test'
import { build } from 'vite'

interface WeatherSnapshot {
  ready: boolean
  rain: boolean
  sourceSplats: number
  drawCalls: number
  weather: { raining: boolean; shelters: { id: number; state: string; remaining: number; completed: number }[] }
  visits: Record<string, {assigned: number[]}>
}
declare global { interface Window { nox: { snapshot(): WeatherSnapshot } } }

test('Rainfall drives both the rendered rain batch and the live shelter simulation', async ({ page }) => {
  test.setTimeout(180_000) // SwiftShader still renders each simulation frame.
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('requestfailed', r => errors.push(r.url()))
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => raf(time => callback(time * 8))
  })
  await page.goto('./?debug=visits')
  await page.waitForFunction(() => window.nox?.snapshot().ready)
  await page.addStyleTag({content: '.viewport {width:160px; height:120px; min-height:0; flex:none}'})
  const snapshot = () => page.evaluate(() => window.nox.snapshot())
  const settle = () => page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  expect((await snapshot()).sourceSplats).toBe(1330)
  expect((await snapshot()).weather.shelters.map(p => p.id)).toEqual([0,10])
  expect((await snapshot()).visits['Aoba Mart'].assigned).toEqual([4,5])
  for (const quality of ['high','medium','low']) {
    await page.locator('#quality').selectOption(quality)
    await settle()
    const wet = (await snapshot()).drawCalls
    await page.locator('#rain').click()
    await settle()
    expect((await snapshot()).weather.raining).toBe(false)
    expect((await snapshot()).drawCalls).toBe(wet-1)
    await page.locator('#rain').click()
  }
  await page.locator('#pause').click()
  await page.waitForFunction(() => window.nox.snapshot().weather.shelters[0].state === 'sheltered', undefined, {timeout:120_000})
  await page.locator('#pause').click()
  const held = (await snapshot()).weather.shelters
  expect(held[0].state).toBe('sheltered')
  await page.locator('#rain').click()
  await settle()
  expect((await snapshot()).weather).toEqual({raining:false, shelters:held})
  await page.locator('#pause').click()
  await expect.poll(async () => (await snapshot()).weather.shelters[0].completed).toBe(1)
  expect(errors).toEqual([])
})

test('checks both walking corridors and canopy footprints against the generated city meshes', async ({ page }) => {
  const result = await build({
    configFile: false, logLevel: 'error',
    build: { write: false, lib: { entry: 'tests/browser/fixtures/shelter-geometry.ts', formats: ['iife'], name: 'ShelterGeometry' } },
  })
  const bundle = Array.isArray(result) ? result[0] : result
  if (!('output' in bundle)) throw Error('Missing geometry fixture')
  const chunk = bundle.output.find(item=>item.type==='chunk')
  if (!chunk || chunk.type !== 'chunk') throw Error('Missing JavaScript fixture')
  await page.goto('about:blank')
  await page.addScriptTag({content:chunk.code})
  const audit = await page.evaluate(()=>JSON.parse(document.body.dataset.audit!))
  expect(audit.buildings).toBe(15)
  expect(audit.splats).toBe(1330)
  expect(audit.signs).toBeGreaterThanOrEqual(35)
  expect(audit.obstructions).toEqual([0,0])
  for (const y of audit.roofHeights.flat()) {
    expect(y).toBeGreaterThan(1.80)
    expect(y).toBeLessThan(2)
  }
})
