import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

type Position = number[] | { x: number, y?: number, z: number }

interface Snapshot {
  ready: boolean
  quality: string
  rain: boolean
  paused: boolean
  traffic: boolean
  light: boolean | string
  camera: number[]
  splats: number
  fps: number
  mobility: { cars: Position[], pedestrians: Position[] }
  renderer: string
}

function snapshot(page: Page) {
  return page.evaluate(() => (window as unknown as { nox: { snapshot(): Snapshot } }).nox.snapshot())
}

async function positions(page: Page) {
  const { mobility } = await snapshot(page)
  const xyz = (p: Position) => Array.isArray(p) ? p.slice(0, 3) : [p.x, p.y ?? 0, p.z]
  return { cars: mobility.cars.map(xyz), pedestrians: mobility.pedestrians.map(xyz) }
}

const capture = process.env.QA_CAPTURE === '1'

async function openScene(page: Page, path = './') {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url() + ' ' + response.status()) })
  await page.goto(path)
  await page.waitForFunction(() => (window as unknown as { nox?: { snapshot(): Snapshot } }).nox?.snapshot().ready, undefined, { timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('#scene')).toBeVisible()
  return errors
}

async function showInspector(page: Page) {
  if (!(await page.locator('#quality').isVisible())) await page.locator('#settings').click()
  await expect(page.locator('#quality')).toBeVisible()
}

function saveEvidence(name: string, data: unknown) {
  if (capture) {
    mkdirSync('docs', { recursive: true })
    writeFileSync('docs/qa-' + name + '.json', JSON.stringify(data, null, 2) + '\n')
  }
}

async function frame(page: Page, name: string) {
  if (capture) {
    mkdirSync('screenshots', { recursive: true })
    await page.screenshot({ path: 'screenshots/' + name + '.png', animations: 'disabled', timeout: 35_000 })
  }
}

// Read the actual composited canvas pixels, including opaque and translucent passes.
async function canvasSample(page: Page) {
  const png = await page.locator('#scene').screenshot({ timeout: 35_000 })
  return page.evaluate(async base64 => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + base64
    await img.decode()
    const small = document.createElement('canvas')
    small.width = 128
    small.height = 96
    const ctx = small.getContext('2d')!
    ctx.drawImage(img, 0, 0, small.width, small.height)
    return [...ctx.getImageData(0, 0, small.width, small.height).data]
  }, png.toString('base64'))
}

async function colorfulPixels(page: Page) {
  const data = await canvasSample(page)
  let count = 0
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2]
    if (Math.max(r, g, b) > 80 && Math.max(r, g, b) - Math.min(r, g, b) > 20) count++
  }
  return count
}

async function drag(page: Page, dx: number, dy: number, button: 'left' | 'right' = 'left') {
  const rect = (await page.locator('#scene').boundingBox())!
  const x = rect.x + rect.width * 0.5, y = rect.y + rect.height * 0.51
  await page.mouse.move(x, y)
  await page.mouse.down({ button })
  await page.mouse.move(x + dx, y + dy, { steps: 6 })
  await page.mouse.up({ button })
}

test('WebGL2 content, quality, rain, lighting and keyboard activation', async ({ page }) => {
  const errors = await openScene(page)
  await page.locator('#pause').click()
  const context = await page.locator('#scene').evaluate(el => (el as HTMLCanvasElement).getContext('webgl2') !== null)
  expect(context).toBe(true)
  expect(await colorfulPixels(page)).toBeGreaterThan(60)
  await showInspector(page)
  await page.locator('#quality').selectOption('low')
  await expect.poll(async () => (await snapshot(page)).quality).toBe('low')
  const low = (await snapshot(page)).splats
  expect(low).toBeGreaterThan(0)
  await page.locator('#quality').selectOption('high')
  await expect.poll(async () => (await snapshot(page)).splats).toBeGreaterThan(low)
  await page.locator('#quality').selectOption('medium')
  await expect.poll(async () => (await snapshot(page)).quality).toBe('medium')
  for (const key of ['rain', 'light'] as const) {
    const original = (await snapshot(page))[key]
    const pixelsBefore = await canvasSample(page)
    await page.locator('#' + key).focus()
    await page.keyboard.press('Space')
    await expect.poll(async () => (await snapshot(page))[key]).not.toEqual(original)
    const pixelsAfter = await canvasSample(page)
    const changedChannels = pixelsBefore.filter((value, index) => Math.abs(value - pixelsAfter[index]) >= 2).length
    expect(changedChannels).toBeGreaterThan(20)
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await snapshot(page))[key]).toEqual(original)
  }
  expect(errors).toEqual([])
})

test('mobility positions advance, pause and resume independently of traffic', async ({ page }) => {
  const errors = await openScene(page)
  await showInspector(page)
  const before = await positions(page)
  expect(before.cars.length).toBeGreaterThan(1)
  expect(before.pedestrians.length).toBeGreaterThan(1)
  for (const p of [...before.cars, ...before.pedestrians]) expect(p.every(Number.isFinite)).toBe(true)
  await expect.poll(async () => (await positions(page)).cars).not.toEqual(before.cars)
  await expect.poll(async () => (await positions(page)).pedestrians).not.toEqual(before.pedestrians)
  await page.locator('#pause').click()
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true)
  const paused = await positions(page)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await positions(page)).toEqual(paused)
  await page.locator('#traffic').click()
  await page.locator('#pause').click()
  await expect.poll(async () => (await positions(page)).pedestrians).not.toEqual(paused.pedestrians)
  const stoppedCars = (await positions(page)).cars
  expect(stoppedCars).toEqual(paused.cars)
  await page.locator('#traffic').click()
  await expect.poll(async () => (await positions(page)).cars).not.toEqual(stoppedCars)
  saveEvidence('motion', { before, paused, after: await positions(page) })
  expect(errors).toEqual([])
})

test('rotate, pan, zoom and reset the camera', async ({ page }) => {
  if (!capture) await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = await openScene(page)
  const initial = (await snapshot(page)).camera
  await drag(page, 150, -25)
  await expect.poll(async () => (await snapshot(page)).camera).not.toEqual(initial)
  await frame(page, 'orbit')
  const rotated = (await snapshot(page)).camera
  await drag(page, -80, 55, 'right')
  await expect.poll(async () => (await snapshot(page)).camera).not.toEqual(rotated)
  const panned = (await snapshot(page)).camera
  await page.mouse.wheel(0, -280)
  await expect.poll(async () => (await snapshot(page)).camera).not.toEqual(panned)
  await frame(page, 'street-detail')
  await page.getByRole('button', { name: 'Street level', exact: true }).click()
  await frame(page, 'street-level')
  await page.getByRole('button', { name: 'Rooftops', exact: true }).click()
  await frame(page, 'rooftops')
  const overhead = (await snapshot(page)).camera
  await page.locator('#scene').focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await snapshot(page)).camera).not.toEqual(overhead)
  await page.locator('#reset').click()
  await expect.poll(async () => Math.max(...(await snapshot(page)).camera.map((v, i) => Math.abs(v - initial[i])))).toBeLessThan(0.15)
  expect(errors).toEqual([])
})

for (const [width, height] of [[1920, 1080], [1440, 900], [390, 844], [375, 812]]) {
  test('composition and resize ' + width + 'x' + height, async ({ page }) => {
    if (!capture) await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height })
    const errors = await openScene(page)
    await frame(page, width + 'x' + height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await colorfulPixels(page)).toBeGreaterThan(60)
    await showInspector(page)
    await expect(page.locator('#rain')).toBeInViewport()
    if (width < 500) {
      await page.locator('#quality').selectOption('low')
      await frame(page, 'controls-' + width)
    }
    await page.setViewportSize({ width: Math.max(320, width - 80), height })
    await expect(page.locator('#scene')).toBeVisible()
    expect((await snapshot(page)).ready).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

test('browser without WebGL2 gets a readable recovery state', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (args[0] === 'webgl2') return null
      return Reflect.apply(original, this, args)
    } as typeof original
  })
  await page.goto('./')
  await expect(page.locator('#notice')).toBeVisible()
  await expect(page.locator('#notice')).toContainText(/WebGL ?2/i)
  await expect(page.locator('#notice button')).toBeEnabled()
})

test('measure medium frame intervals in the active Chromium renderer', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors = await openScene(page)
  await showInspector(page)
  await page.locator('#quality').selectOption('medium')
  const metrics = await page.evaluate(async () => {
    const gl = (document.querySelector('#scene') as HTMLCanvasElement).getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    const raf = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
    await raf()
    const intervals: number[] = []
    let last = await raf()
    for (let i = 0; i < 24; i++) {
      const next = await raf()
      intervals.push(next - last)
      last = next
    }
    const sorted = [...intervals].sort((a, b) => a - b)
    return { gpu, sampleFrames: intervals.length, renderBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      meanFps: intervals.length * 1000 / intervals.reduce((sum, dt) => sum + dt, 0),
      medianMs: (sorted[11] + sorted[12]) / 2, p95Ms: sorted[22], intervalsMs: intervals }
  })
  const state = await snapshot(page)
  saveEvidence('performance', { chromium: browser.version(), viewport: [1440, 900], quality: state.quality, splats: state.splats, hudFps: state.fps, ...metrics })
  expect(metrics.meanFps).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test.describe('mobile input', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })

  test('touch orbit and mobile controls with reduced motion', async ({ page }) => {
    const errors = await openScene(page)
    expect((await snapshot(page)).paused).toBe(true)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const initial = (await snapshot(page)).camera
    const box = (await page.locator('#scene').boundingBox())!
    const x = box.x + box.width * 0.45, y = box.y + box.height * 0.52
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 4; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 12 * i, y: y - 3 * i }] })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => (await snapshot(page)).camera).not.toEqual(initial)
    // Track camera radius and orbit target separately during a two-finger gesture.
    const getRadius = (v: number[]) => Math.hypot(v[0]-v[3], v[1]-v[4], v[2]-v[5])
    const beforePinch = (await snapshot(page)).camera
    const points = (spread: number, dy: number) => [
      { x: x-spread, y: y+dy, id: 1 }, { x: x+spread, y: y+dy, id: 2 },
    ]
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30, 0) })
    for (let i = 1; i <= 4; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(30+6*i, 4*i) })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
    await expect.poll(async () => getRadius((await snapshot(page)).camera)).toBeLessThan(getRadius(beforePinch)-1)
    expect((await snapshot(page)).camera.slice(3)).not.toEqual(beforePinch.slice(3))
    await page.setViewportSize({ width: 844, height: 390 })
    // The media-query change expands the inspector on the next rendering update.
    await expect(page.locator('#quality')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const rain = (await snapshot(page)).rain
    await page.locator('#rain').tap()
    await expect.poll(async () => (await snapshot(page)).rain).toBe(!rain)
    expect(errors).toEqual([])
  })
})

test('production resources resolve below the repository base path', async ({ page }) => {
  const prefix = '/nox-tokyo-splats/'
  const resources: string[] = []
  await page.route('http://127.0.0.1:4173/**', async route => {
    const url = new URL(route.request().url())
    resources.push(url.pathname)
    if (!url.pathname.startsWith(prefix)) {
      await route.fulfill({ status: 404, body: 'Missing repository prefix' })
      return
    }
    url.pathname = '/' + url.pathname.slice(prefix.length)
    await route.fulfill({ response: await route.fetch({ url: url.href }) })
  })
  const errors = await openScene(page, prefix)
  expect(await colorfulPixels(page)).toBeGreaterThan(60)
  expect(resources.some(path => path.endsWith('.js'))).toBe(true)
  expect(resources.every(path => path.startsWith(prefix))).toBe(true)
  expect(errors).toEqual([])
})

test('asset load failure exposes retry and successfully rebuilds', async ({ page }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set(src: string) {
        if (src.startsWith('data:image/jpeg') && !sessionStorage.getItem('qa-image-failed')) {
          sessionStorage.setItem('qa-image-failed', '1')
          descriptor.set!.call(this, 'data:image/jpeg;base64,AAAA')
        } else {
          descriptor.set!.call(this, src)
        }
      },
    })
  })
  await page.goto('./')
  await expect(page.locator('#notice')).toContainText(/asset could not be loaded/i)
  await expect(page.locator('#rain')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry' }).click()
  await page.waitForFunction(() => (window as unknown as { nox?: { snapshot(): Snapshot } }).nox?.snapshot().ready)
  await expect(page.locator('#rain')).toBeEnabled()
})
