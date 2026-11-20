# Gaussian projection and compositing check

On 2026-11-20 an independent review bundled the production Splats class and the compositing fixture with Vite. Headless system Chromium 156 rendered the fixture in a 144 × 144 WebGL2 framebuffer. The values below are bytes read from that framebuffer with WebGL readPixels.

| Sample | Result | Interpretation |
| --- | --- | --- |
| White Gaussian center | 227 | Peak opacity below full coverage |
| 12 px from center along major axis | 175 | Smooth elliptical falloff |
| 12 px from center along minor axis | 4 | Faster falloff along the shorter axis |
| Clear background | 0 | No coverage outside the footprint |
| Green wall in front of the Gaussian | RGB (0, 255, 0) | Opaque scene depth occludes the Gaussian |
| Overlapping Gaussians, blue in front | RGB (19, 0, 234) | Both splats contribute, with blue dominant |
| Same Gaussians, viewed from the opposite side | RGB (234, 0, 19) | Camera-dependent sorting reverses the dominant color |

The fixture specifies world-space standard deviations of 0.60, 0.15 and 0.12 for the white Gaussian. The two depth-order samples use the same pair of splats and materials. To rerun the assertions after a production build, use `npm run test:browser -- splats.spec.ts`. These measurements describe this fixture and Chromium rendering path.

[Browser assertions](../tests/browser/splats.spec.ts) · [Diagnostic scene](../tests/browser/fixtures/compositing.ts)
