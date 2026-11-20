import * as THREE from 'three'
export function createRain(scene: THREE.Scene, covers: THREE.Vector4[]) {
  const count = 1100,
    data = new Float32Array(count * 6)
  let seed = 98124
  const random = () =>
    ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296
  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 32,
      z = (random() - 0.5) * 32,
      y = random() * 22
    data.set([x, y, z, x - 0.042, y + 0.34, z + 0.015], i * 6)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data, 3))
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, covers: { value: covers } },
    vertexShader: `uniform float time;varying float fade; varying vec3 drop; void main(){
    float tail=float(gl_VertexID%2); float y0=position.y-tail*.34;
    float y=mod(y0-time*9.5,22.); vec3 p=position;
    p.y=y+tail*.34; p.x+=(y0-y)*.12;
    drop=p;
    fade=(1.-smoothstep(17.,22.,y))*min(1.,y*2.);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }`,
    fragmentShader: `varying float fade;
    varying vec3 drop;
    uniform vec4 covers[2];
    void main(){
      if(drop.y < 1.97) {
        for(int i=0; i<2; i++){
          vec4 c=covers[i];
          if(all(greaterThanEqual(drop.xz,c.xy)) && all(lessThanEqual(drop.xz,c.zw))) discard;
        }
      }
      gl_FragColor=vec4(.57,.69,.82,.22*fade);
    }`,
  })
  const drops = new THREE.LineSegments(geo, material)
  drops.renderOrder = 5
  drops.frustumCulled = false
  scene.add(drops)
  return {
    update: (time: number) => {
      material.uniforms.time.value = time
    },
    enable: (on: boolean) => {
      drops.visible = on
    },
    quality: (q: string) =>
      geo.setDrawRange(
        0,
        (q === 'high' ? 1100 : q === 'medium' ? 680 : 320) * 2,
      ),
  }
}
