import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const standalone = resolve('dist/NOX-Tokyo.html')
const fileUrl = pathToFileURL(standalone).href
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
  timeout: 15000,
})
try {
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 1024, height: 720 },
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const errors = []
  const requests = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('request', (request) => {
    const url = request.url()
    if (url !== fileUrl && !url.startsWith('data:') && !url.startsWith('blob:'))
      requests.push(url)
  })
  await page.goto(fileUrl, { timeout: 30000 })
  await page.waitForFunction(() => window.nox?.snapshot().ready, undefined, {
    timeout: 30000,
  })
  await page.evaluate(() => document.fonts.ready)
  const scene = page.locator('#scene')
  assert.ok(await scene.isVisible())
  const renderer = await scene.evaluate((canvas) => {
    const gl = canvas.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      webgl2: Boolean(gl),
      gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
    }
  })
  assert.ok(renderer.webgl2)
  const snapshot = () => page.evaluate(() => window.nox.snapshot())
  const initial = (await snapshot()).camera
  const canvas = await scene.boundingBox()
  const x = canvas.x + canvas.width * 0.55
  const y = canvas.y + canvas.height * 0.53
  const diff = (a, b) => Math.max(...a.map((n, i) => Math.abs(n - b[i])))
  const colors = async () => {
    const png = await scene.screenshot({ timeout: 30000 })
    return page.evaluate(async (data) => {
      const sample = document.createElement('canvas')
      sample.width = 96
      sample.height = 64
      const ctx = sample.getContext('2d')
      const image = new Image()
      image.src = 'data:image/png;base64,' + data
      await image.decode()
      ctx.drawImage(image, 0, 0, sample.width, sample.height)
      const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data
      let vivid = 0
      let bright = 0
      for (let i = 0; i < rgba.length; i += 4) {
        const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]]
        if (Math.max(r, g, b) > 80) bright++
        if (
          Math.max(r, g, b) > 80 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 20
        )
          vivid++
      }
      return { vivid, bright }
    }, png.toString('base64'))
  }
  async function waitUntilCameraRelocates(camera) {
    await page.waitForFunction(
      (last) =>
        Math.max(
          ...window.nox.snapshot().camera.map((n, i) => Math.abs(n - last[i])),
        ) > 0.15,
      camera,
    )
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    return (await snapshot()).camera
  }
  const views = { initial: { camera: initial, ...(await colors()) } }
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 104, y - 18, { steps: 4 })
  await page.mouse.up()
  let previous = await waitUntilCameraRelocates(initial)
  for (const name of ['Street level', 'Rooftops']) {
    await page.getByRole('button', { name, exact: true }).click()
    const camera = await waitUntilCameraRelocates(previous)
    assert.ok(diff(camera, initial) > 0.15)
    views[name] = { camera, ...(await colors()) }
    previous = camera
  }
  await page.locator('#reset').click()
  await page.waitForFunction(
    (start) =>
      Math.max(
        ...window.nox.snapshot().camera.map((n, i) => Math.abs(n - start[i])),
      ) < 0.15,
    initial,
  )
  assert.ok(diff((await snapshot()).camera, initial) < 0.15)
  assert.ok(
    Object.values(views).every(({ vivid }) => vivid > 30),
    JSON.stringify(views),
  )
  assert.deepEqual(requests, [])
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        protocol: new URL(page.url()).protocol,
        bytes: (await stat(standalone)).size,
        chromium: browser.version(),
        ...renderer,
        viewport: page.viewportSize(),
        views,
        orbitAndReset: true,
        externalRequests: requests.length,
        errors: errors.length,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
