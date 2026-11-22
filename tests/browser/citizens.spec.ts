import { expect, test, type Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { CityEvent } from '../../src/traffic/events'

async function exportedEvents(download: Download): Promise<CityEvent[]> {
  expect(download.suggestedFilename()).toBe('nox-citizen-events.json')
  const path = await download.path()
  if (!path) throw Error('The event export did not finish')
  return JSON.parse(await readFile(path, 'utf8'))
}

test('inspector presents the live decision, searches events and exports the exact filtered JSON', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./?debug=events')
  await page.waitForFunction(() => window.nox?.snapshot().ready)
  // Simulate in a small framebuffer to keep CPU-only CI responsive.
  await page.addStyleTag({ content: '.viewport {width:160px; height:120px; min-height:0; flex:none}' })
  const inspector = page.getByRole('region', { name: 'Citizen Inspector' })
  await expect(inspector).toBeVisible()
  await page.locator('#pause').click()
  await page.waitForFunction(() => {
    const { events } = window.nox.snapshot() as unknown as { events: CityEvent[] }
    if (!events.some(e => e.npcId === 6 && e.type === 'decision_made')) return false
    document.getElementById('pause')!.click()
    return true
  })
  const all = await page.evaluate(() => (window.nox.snapshot() as unknown as { events: CityEvent[] }).events)
  await page.locator('#citizen-select').selectOption('6')
  await expect(page.locator('#citizen-select option:checked')).toContainText('Рэн')
  for (const need of ['hunger','energy','leisure']) await expect(page.locator('#citizen-needs')).toContainText(new RegExp(need, 'i'))
  await expect(page.locator('#citizen-goal')).not.toBeEmpty()
  await expect(page.locator('#citizen-reason')).not.toBeEmpty()
  await expect(page.locator('#citizen-scores li').first()).toBeVisible()
  await page.locator('#citizen-scope').selectOption('citizen')
  await page.locator('#citizen-search').fill('decision_made')
  const expected = all.filter(e => e.npcId === 6 && e.type === 'decision_made').reverse()
  await expect(page.locator('#citizen-events li')).toHaveCount(expected.length)
  await page.getByRole('button', { name: 'Copy JSON' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"decision_made"')
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(expected)
  const file = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  expect(await exportedEvents(await file)).toEqual(expected)
  await page.locator('#citizen-search').fill('missing-event-xyz')
  await expect(page.locator('#citizen-events li')).toHaveCount(0)
  await expect(page.locator('#citizen-events-empty')).toBeVisible()
  await page.locator('#citizen-search').fill('')
  await page.locator('#citizen-scope').selectOption('all')
  await expect(page.locator('#citizen-events li').first()).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await inspector.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('#citizen-select').selectOption('12')
  await expect(page.locator('#citizen-select option:checked')).toContainText('Акира')
  await page.setViewportSize({ width: 844, height: 390 })
  await inspector.scrollIntoViewIfNeeded()
  await page.locator('#citizen-select').selectOption('2')
  await expect(page.locator('#citizen-select option:checked')).toContainText('Харуто')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('ordinary viewer keeps the inspector out of its interface', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await page.waitForFunction(() => window.nox?.snapshot().ready)
  await expect(page.locator('#citizen-inspector')).toHaveCount(0)
})
