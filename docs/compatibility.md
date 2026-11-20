# Dependency compatibility

The npm registry metadata below was checked on November 20, 2026. The workspace reported Node.js `24.22.1`, npm `11.9.0`, and Debian 13 on x86-64. System Chromium `156.0.8078.79` was available at `/usr/bin/chromium`.

| Package | Compatible pin | License | Compatibility metadata |
| --- | --- | --- | --- |
| [three](https://www.npmjs.com/package/three/v/0.187.0) | 0.187.0 | MIT | No Node engine specified |
| [@types/three](https://www.npmjs.com/package/@types/three/v/0.187.0) | 0.187.0 | MIT | Matches the Three.js release |
| [vite](https://www.npmjs.com/package/vite/v/8.3.8) | 8.3.8 | MIT | Node `^20.19.0 \|\| >=22.12.0` |
| [vitest](https://www.npmjs.com/package/vitest/v/5.1.1) | 5.1.1 | MIT | Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`, Vite peer includes `^8.0.0` |
| [typescript](https://www.npmjs.com/package/typescript/v/6.0.3) | 6.0.3 | Apache-2.0 | Node `>=14.17`, satisfies the typescript-eslint peer range |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test/v/1.65.1) | 1.65.1 | Apache-2.0 | Node `>=20` |
| [eslint](https://www.npmjs.com/package/eslint/v/10.15.0) | 10.15.0 | MIT | Node `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| [@eslint/js](https://www.npmjs.com/package/@eslint/js/v/10.0.1) | 10.0.1 | MIT | ESLint peer `^10.0.0` |
| [typescript-eslint](https://www.npmjs.com/package/typescript-eslint/v/8.73.0) | 8.73.0 | MIT | Node `^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0`. Supports ESLint 8.57, 9, and 10, and TypeScript `>=4.8.4 <6.1.0` |
| [@types/node](https://www.npmjs.com/package/@types/node/v/24.19.2) | 24.19.2 | MIT | Targets Node 24 and satisfies the Vite and Vitest peer ranges |
| [globals](https://www.npmjs.com/package/globals/v/17.4.0) | 17.4.0 | MIT | Node `>=18` |

TypeScript 7 falls outside the typescript-eslint peer range. Playwright 1.65.1 declares Chrome for Testing 159.0.8154.6, including the headless shell. Its managed browser provides a versioned test target, and system Chromium requires a custom executable path if selected. [Playwright browser installation](https://playwright.dev/docs/browsers) · [Browser versions for Playwright 1.65.1](https://github.com/microsoft/playwright/blob/v1.65.1/packages/playwright-core/browsers.json)

## Gaussian splat rendering

The original 3D Gaussian Splatting method fits oriented, translucent 3D Gaussians to images. Its renderer projects their covariance into the camera plane to produce elliptical footprints, orders splats by depth, and composites their opacity and color. A procedural Three.js scene can use this rendering principle with authored Gaussian positions and colors. It does not require image reconstruction or trained scene data. [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)

Three.js `WebGLRenderer` requires a WebGL 2 context. A headless screenshot test should check context creation and rendered pixels since launching Chromium alone leaves the graphics path unverified. [Three.js WebGLRenderer documentation](https://threejs.org/docs/#api/en/renderers/WebGLRenderer)
