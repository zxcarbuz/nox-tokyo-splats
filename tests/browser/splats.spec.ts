import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { build } from 'vite'

test('GPU footprint, opaque occlusion and camera-dependent alpha ordering', async ({ page }) => {
  const fixture = await build({
    configFile: false,
    logLevel: 'error',
    build: { write: false, lib: { entry: 'tests/browser/fixtures/compositing.ts', formats: ['iife'], name: 'SplatDiagnostic' } },
  })
  const bundle = Array.isArray(fixture) ? fixture[0] : fixture
  if (!('output' in bundle)) throw new Error('Vite did not produce the diagnostic bundle')
  const chunk = bundle.output.find(item => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing diagnostic JavaScript')
  await page.goto('about:blank')
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.addScriptTag({ content: chunk.code })
  await expect(page.locator('body')).toHaveAttribute('data-samples', /"frontRed"/)
  const samples = JSON.parse((await page.locator('body').getAttribute('data-samples'))!)
  expect(errors).toEqual([])
  expect(samples.center).toBeGreaterThan(140)
  expect(samples.majorAxis).toBeLessThan(samples.center)
  expect(samples.majorAxis).toBeGreaterThan(70)
  expect(samples.minorAxis).toBeLessThan(40)
  expect(samples.background).toBe(0)
  expect(samples.occluded).toEqual([0, 255, 0])
  expect(samples.frontBlue[2]).toBeGreaterThan(samples.frontBlue[0] * 2)
  expect(samples.frontRed[0]).toBeGreaterThan(samples.frontRed[2] * 2)
  if (process.env.QA_CAPTURE === '1') writeFileSync('docs/qa-compositing.json', JSON.stringify(samples, null, 2) + '\n')
})
