# Browser verification

The Playwright suite runs the Vite production build in Chromium, with one worker and a 1× device pixel ratio. The four viewport captures use CSS pixel dimensions. A separate mobile context enables touch input and reduced motion. The test launches a real browser and exercises the canvas with mouse, wheel, keyboard, and CDP touch events.

```sh
npm ci
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

The local runner can use system Chromium at `/usr/bin/chromium`. CI uses the Playwright-managed build. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to test a specific executable. To refresh the checked-in visual and numerical evidence on Linux, run `QA_CAPTURE=1 npm run test:browser`.

## Verification methods

- **Gaussian compositing.** A dedicated 144 × 144 WebGL2 fixture uses the production renderer. A pixel readback checks the intensity along two axes of one ellipsoid, its center and the background. A solid green mesh covers its center in a second frame. Finally the camera moves to opposite sides of a red/blue translucent pair to verify that the nearest Gaussian dominates in both views. [Measured RGB values](qa-compositing.json)
- **Viewer.** The tests verify WebGL2 initialization, rendered color variation, quality-dependent Gaussian counts, and changes in composited pixels when toggling rain or lighting with the simulation paused. They also exercise camera presets, orbit, zoom, pan and reset.
- **Motion.** Each car and pedestrian has a position in the simulation snapshot. Samples taken over multiple animation frames verify travel, a global pause, and independent pedestrian movement while the driver simulation is stopped. [Position samples](qa-motion.json)
- **Performance.** The 1440 × 900 test records 24 successive browser animation-frame intervals with Medium selected. It reports the render buffer size and the GPU renderer string. This short active-view sample includes browser scheduling and CPU and GPU work. [Frame intervals](qa-performance.json)
- **Recovery and hosting.** The suite denies WebGL2 to test the initial error UI, injects a corrupt sign image to exercise the production retry flow and serves the built site under the repository path to catch broken resource URLs.
- **Screenshots.** The suite captures four initial layouts, two camera presets, two free-camera views and narrow controls. [Original captures](../screenshots/)

The standalone viewer was also opened directly from a local file in an offline Playwright Chromium 159 context. WebGL2 initialized, the orbit gesture and camera reset responded, and all three presets displayed scene pixels. The page issued zero external requests and logged zero errors. [Offline observations](qa-offline.json)
