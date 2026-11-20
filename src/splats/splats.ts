import * as THREE from 'three'

export type SplatQuality = 'low' | 'medium' | 'high'

const sampling: Record<SplatQuality, number> = { low: 0.34, medium: 0.64, high: 1 }
const texelsPerSplat = 3
const floatsPerSplat = texelsPerSplat * 4
const radixSize = 2048

const vertexShader = /* glsl */ `
  uniform sampler2D uSplats;
  uniform int uSplatsPerRow;
  uniform vec2 uViewport;
  uniform float uNear;
  uniform float uFar;
  uniform float uOpacityScale;

  in float aSplatIndex;
  out vec2 vGaussian;
  flat out vec4 vColor;

  void main() {
    int index = int(aSplatIndex);
    ivec2 texel = ivec2((index % uSplatsPerRow) * 3, index / uSplatsPerRow);
    vec4 centerAndOpacity = texelFetch(uSplats, texel, 0);
    vec3 center = (viewMatrix * vec4(centerAndOpacity.xyz, 1.0)).xyz;
    float depth = -center.z;
    vGaussian = position.xy * 3.0;

    if (depth <= uNear || depth >= uFar) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec4(0.0);
      return;
    }

    vec3 scale = texelFetch(uSplats, texel + ivec2(1, 0), 0).xyz;
    vec2 focalPx = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * uViewport * 0.5;
    vec2 slope = center.xy / depth;
    vec3 jacobianX = vec3(1.0, 0.0, slope.x) * (focalPx.x / depth);
    vec3 jacobianY = vec3(0.0, 1.0, slope.y) * (focalPx.y / depth);

    // Columns of the square root of the world covariance in view space.
    mat3 viewRotation = mat3(viewMatrix);
    vec3 jacobianScaleX = (jacobianX * viewRotation) * scale;
    vec3 jacobianScaleY = (jacobianY * viewRotation) * scale;
    float xy = dot(jacobianScaleX, jacobianScaleY);
    vec2 variance = vec2(dot(jacobianScaleX, jacobianScaleX), dot(jacobianScaleY, jacobianScaleY));

    // Pad the footprint before culling to keep splats that cross a viewport edge.
    float filterVariance = 0.22;
    vec4 clip = projectionMatrix * vec4(center, 1.0);
    vec2 ndcRadius = 6.0 * sqrt(variance + filterVariance) / uViewport;
    if (any(greaterThan(abs(clip.xy), (1.0 + ndcRadius) * clip.w))) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec4(0.0);
      return;
    }

    vec3 covarianceArea = cross(jacobianScaleX, jacobianScaleY);
    float determinant = dot(covarianceArea, covarianceArea);

    // Smooth subpixel splats and preserve their integrated opacity.
    float filteredDeterminant = determinant + filterVariance * (variance.x + variance.y + filterVariance);
    variance += filterVariance;
    float delta = variance.x - variance.y;
    float discriminant = length(vec2(delta, 2.0 * xy));
    vec2 major = discriminant == 0.0 ? vec2(1.0, 0.0) : normalize(delta >= 0.0
      ? vec2(discriminant + delta, 2.0 * xy)
      : vec2(2.0 * xy, discriminant - delta));
    vec2 minor = vec2(-major.y, major.x);
    float majorVariance = 0.5 * (variance.x + variance.y + discriminant);
    float minorVariance = max(filterVariance, filteredDeterminant / majorVariance);
    vec2 offsetPx = major * (vGaussian.x * sqrt(majorVariance)) + minor * (vGaussian.y * sqrt(minorVariance));
    float opacity = centerAndOpacity.w * uOpacityScale * sqrt(determinant / filteredDeterminant);
    vec3 color = texelFetch(uSplats, texel + ivec2(2, 0), 0).xyz;
    vColor = vec4(color, clamp(opacity, 0.0, 0.995));

    clip.xy += (2.0 * offsetPx / uViewport) * clip.w;
    gl_Position = clip;
  }
`

const fragmentShader = /* glsl */ `
  in vec2 vGaussian;
  flat in vec4 vColor;
  out vec4 outputColor;

  void main() {
    float radiusSquared = dot(vGaussian, vGaussian);
    float alpha = vColor.a * exp(-0.5 * radiusSquared);
    if (radiusSquared > 9.0 || alpha < 0.001) discard;
    outputColor = linearToOutputTexel(vec4(vColor.rgb, alpha));
  }
`

function hashIndex(index: number): number {
  let hash = Math.imul(index ^ (index >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  return (hash ^ (hash >>> 16)) >>> 0
}

export class Splats {
  private points = new Float32Array(0)
  private pointCount = 0
  private readonly color = new THREE.Color()
  private quality: SplatQuality = 'high'
  private mesh?: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>
  private texture?: THREE.DataTexture
  private instanceIndices?: THREE.InstancedBufferAttribute
  private sample = new Uint32Array(0)
  private sampleCount = 0
  private sortInput = new Uint32Array(0)
  private sortOutput = new Uint32Array(0)
  private depths = new Float32Array(0)
  private depthKeys = new Uint32Array(this.depths.buffer)
  private readonly bucketOffsets = new Uint32Array(radixSize)
  private readonly lastDepthAxis = new THREE.Vector3(NaN, NaN, NaN)

  get count(): number {
    return this.pointCount
  }

  get activeCount(): number {
    return this.sampleCount
  }

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, opacity: number): void {
    const offset = this.pointCount * floatsPerSplat
    if (offset + floatsPerSplat > this.points.length) {
      const grown = new Float32Array(Math.max(this.points.length * 2, 4096 * floatsPerSplat))
      grown.set(this.points)
      this.points = grown
    }
    this.color.setHex(color, THREE.SRGBColorSpace)
    const points = this.points
    points[offset] = x
    points[offset + 1] = y
    points[offset + 2] = z
    points[offset + 3] = opacity
    points[offset + 4] = sx
    points[offset + 5] = sy
    points[offset + 6] = sz
    points[offset + 8] = this.color.r
    points[offset + 9] = this.color.g
    points[offset + 10] = this.color.b
    this.pointCount++
  }

  build(scene: THREE.Scene): void {
    if (this.mesh) {
      this.mesh.removeFromParent()
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.texture?.dispose()
    }

    const splatsPerRow = Math.max(1, Math.ceil(Math.sqrt(this.count / texelsPerSplat)))
    const width = splatsPerRow * texelsPerSplat
    const height = Math.max(1, Math.ceil(this.count / splatsPerRow))
    const textureData = new Float32Array(width * height * 4)
    textureData.set(this.points.subarray(0, this.count * floatsPerSplat))
    this.points = textureData
    const texture = new THREE.DataTexture(textureData, width, height, THREE.RGBAFormat, THREE.FloatType)
    texture.needsUpdate = true
    this.texture = texture

    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    ], 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    this.instanceIndices = new THREE.InstancedBufferAttribute(new Float32Array(this.count), 1)
    this.instanceIndices.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSplatIndex', this.instanceIndices)

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uSplats: { value: texture },
        uSplatsPerRow: { value: splatsPerRow },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 2000 },
        uOpacityScale: { value: 1 },
      },
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.name = 'Gaussian splats'
    // The instance quads expand in camera space. Their base geometry cannot bound the cloud.
    this.mesh.frustumCulled = false
    scene.add(this.mesh)

    this.sample = new Uint32Array(this.count)
    this.sortInput = new Uint32Array(this.count)
    this.sortOutput = new Uint32Array(this.count)
    this.depths = new Float32Array(this.count)
    this.depthKeys = new Uint32Array(this.depths.buffer)
    this.selectSamples()
  }

  setQuality(quality: SplatQuality): void {
    if (quality === this.quality) return
    this.quality = quality
    this.selectSamples()
  }

  update(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    if (!this.mesh) return
    const uniforms = this.mesh.material.uniforms
    uniforms.uViewport.value.set(Math.max(1, width), Math.max(1, height))
    uniforms.uNear.value = camera.near
    uniforms.uFar.value = camera.far
    camera.updateWorldMatrix(true, false)
    const view = camera.matrixWorldInverse.elements
    // The translation adds a common depth offset and cannot change the order.
    const x = -view[2]
    const y = -view[6]
    const z = -view[10]
    if (this.lastDepthAxis.x === x && this.lastDepthAxis.y === y && this.lastDepthAxis.z === z) return
    this.lastDepthAxis.set(x, y, z)
    this.sortByDepth(x, y, z)
  }

  private selectSamples(): void {
    if (!this.mesh) return
    const fraction = sampling[this.quality]
    const threshold = fraction * 0x100000000
    this.sampleCount = 0
    for (let index = 0; index < this.sample.length; index++) {
      if (fraction === 1 || hashIndex(index) < threshold) this.sample[this.sampleCount++] = index
    }
    this.mesh.geometry.instanceCount = this.sampleCount
    this.mesh.material.uniforms.uOpacityScale.value = 1 / fraction
    this.lastDepthAxis.set(NaN, NaN, NaN)
    this.uploadIndices(this.sample)
  }

  private sortByDepth(x: number, y: number, z: number): void {
    if (this.sampleCount < 2) return
    for (let i = 0; i < this.sampleCount; i++) {
      const index = this.sample[i]
      const offset = index * floatsPerSplat
      const points = this.points
      this.depths[index] = -(points[offset] * x + points[offset + 1] * y + points[offset + 2] * z)
      const bits = this.depthKeys[index]
      // Convert the negated floats to unsigned sortable keys, preserving their ordering across zero.
      this.depthKeys[index] = bits ^ ((bits >>> 31) === 1 ? 0xffffffff : 0x80000000)
    }

    let input = this.sample
    let output = this.sortInput
    for (let shift = 0; shift < 32; shift += 11) {
      const offsets = this.bucketOffsets
      offsets.fill(0)
      for (let i = 0; i < this.sampleCount; i++) {
        const bucket = (this.depthKeys[input[i]] >>> shift) & (radixSize - 1)
        offsets[bucket]++
      }
      let next = 0
      for (let bucket = 0; bucket < radixSize; bucket++) {
        const size = offsets[bucket]
        offsets[bucket] = next
        next += size
      }
      for (let i = 0; i < this.sampleCount; i++) {
        const index = input[i]
        const bucket = (this.depthKeys[index] >>> shift) & (radixSize - 1)
        output[offsets[bucket]++] = index
      }
      input = output
      output = output === this.sortInput ? this.sortOutput : this.sortInput
    }
    this.uploadIndices(input)
  }

  private uploadIndices(indices: Uint32Array): void {
    if (!this.instanceIndices || this.sampleCount === 0) return
    this.instanceIndices.array.set(indices.subarray(0, this.sampleCount))
    this.instanceIndices.clearUpdateRanges()
    this.instanceIndices.addUpdateRange(0, this.sampleCount)
    this.instanceIndices.needsUpdate = true
  }
}
