import * as THREE from 'three';
import signAtlasUrl from './tokyo-signs.jpg?inline';

type AddSplat = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, opacity: number) => void;
type Face = 0 | 1 | 2 | 3;
type Paint = 'wall' | 'metal' | 'glass' | 'light' | 'street' | 'mark';
type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
  trim: number;
  accent: number;
  floors: number;
  style: 'tower' | 'office' | 'shop' | 'service';
};
type Box = { x: number; y: number; z: number; w: number; h: number; d: number; color: number; ry: number; power: number };

const cyan = 0x48efff;
const pink = 0xff348e;
const amber = 0xffaf62;
const violet = 0x8c79ff;
const blue = 0x588eff;
const red = 0xff4359;
const lime = 0xb6f270;
const facades: Face[] = [0, 1, 2, 3];
const signStyles = ['v', 'h', 'v', 'v', 'h', 'h', 'v', 's', 'h', 'h', 'v', 's', 'h', 'h', 'v', 'h', 'h', 'v', 'h', 'h'];
const signColors = [pink, cyan, cyan, red, pink, lime, amber, cyan, cyan, amber, blue, pink, cyan, red, violet, blue, amber, pink, violet, cyan];

const blocks: Building[] = [
  { x: -4.64, z: -5.02, w: 4.60, d: 4.24, h: 13.52, color: 0x24293c, trim: 0x3f475e, accent: cyan, floors: 10, style: 'tower' },
  { x: 0.16, z: -5.38, w: 3.68, d: 4.18, h: 9.30, color: 0x283443, trim: 0x51617a, accent: pink, floors: 7, style: 'office' },
  { x: 5.22, z: -5.40, w: 4.56, d: 4.32, h: 10.85, color: 0x253140, trim: 0x3c5763, accent: cyan, floors: 8, style: 'office' },
  { x: -6.48, z: -0.94, w: 2.96, d: 3.15, h: 7.45, color: 0x302941, trim: 0x504b62, accent: violet, floors: 5, style: 'office' },
  { x: -2.72, z: -0.84, w: 3.66, d: 3.25, h: 8.12, color: 0x203a43, trim: 0x3b5860, accent: cyan, floors: 6, style: 'service' },
  { x: 1.25, z: -0.72, w: 3.35, d: 3.30, h: 7.21, color: 0x372637, trim: 0x67465b, accent: pink, floors: 5, style: 'office' },
  { x: 5.76, z: -0.78, w: 3.71, d: 3.46, h: 7.91, color: 0x363141, trim: 0x625166, accent: red, floors: 5, style: 'shop' },
  { x: -5.94, z: 3.40, w: 3.55, d: 3.63, h: 6.91, color: 0x37414a, trim: 0x636b6b, accent: amber, floors: 5, style: 'service' },
  { x: -1.74, z: 3.23, w: 3.79, d: 3.87, h: 6.18, color: 0x402d45, trim: 0x705272, accent: pink, floors: 4, style: 'shop' },
  { x: 2.71, z: 3.37, w: 3.45, d: 3.76, h: 5.52, color: 0x263c44, trim: 0x426972, accent: cyan, floors: 4, style: 'shop' },
  { x: 6.52, z: 3.22, w: 2.75, d: 3.65, h: 5.36, color: 0x352d40, trim: 0x65506a, accent: violet, floors: 4, style: 'shop' },
  { x: -6.38, z: 6.68, w: 2.83, d: 2.34, h: 3.37, color: 0x3b353a, trim: 0x7a5d5b, accent: red, floors: 2, style: 'shop' },
  { x: -3.41, z: 6.70, w: 2.73, d: 2.31, h: 3.06, color: 0x353b42, trim: 0x605a56, accent: amber, floors: 2, style: 'shop' },
  { x: 1.28, z: 6.88, w: 4.06, d: 2.27, h: 3.06, color: 0x253c45, trim: 0x406473, accent: cyan, floors: 2, style: 'service' },
  { x: 5.84, z: 6.71, w: 3.93, d: 2.53, h: 3.78, color: 0x433340, trim: 0x755c6c, accent: pink, floors: 2, style: 'shop' },
];

const object = new THREE.Object3D();
const color = new THREE.Color();

function random(seed: number) {
  let state = seed % 2147483647;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function facePoint(building: Building, face: Face, u: number, y: number, out: number): [number, number, number] {
  switch (face) {
    case 0: return [building.x + u, y, building.z + building.d / 2 + out];
    case 1: return [building.x + building.w / 2 + out, y, building.z - u];
    case 2: return [building.x - u, y, building.z - building.d / 2 - out];
    case 3: return [building.x - building.w / 2 - out, y, building.z + u];
  }
}

function cable(points: THREE.Vector3[], curve: THREE.Curve<THREE.Vector3>, segments = 13) {
  let previous = curve.getPoint(0);
  for (let i = 1; i <= segments; i++) {
    const next = curve.getPoint(i / segments);
    points.push(previous, next);
    previous = next;
  }
}

export function buildCity(scene: THREE.Scene, addSplat: AddSplat) {
  const city = new THREE.Group();
  city.name = 'Tokyo city geometry';
  scene.add(city);

  const batches: Record<Paint, Box[]> = { wall: [], metal: [], glass: [], light: [], street: [], mark: [] };
  const signVertices: number[] = [];
  const signUvs: number[] = [];
  const wires: THREE.Vector3[] = [];
  const fixtures: THREE.Vector3[] = [];
  const rain = random(41172);
  const details = random(847321);
  const reflections: { x: number; z: number; w: number; d: number; angle: number; color: number; opacity: number; seed: number }[] = [];

  function box(paint: Paint, x: number, y: number, z: number, w: number, h: number, d: number, hex: number, ry = 0, power = 1) {
    batches[paint].push({ x, y, z, w, h, d, color: hex, ry, power });
  }

  function panel(paint: Paint, b: Building, face: Face, u: number, y: number, w: number, h: number, depth: number, hex: number, out = depth / 2, power = 1) {
    const [x, ay, z] = facePoint(b, face, u, y, out);
    box(paint, x, ay, z, w, h, depth, hex, face * Math.PI / 2, power);
  }

  function facadeSplat(b: Building, face: Face, u: number, y: number, sx: number, sy: number, hex: number, opacity: number, out = 0.10) {
    const [x, ay, z] = facePoint(b, face, u, y, out);
    addSplat(x, ay, z, face % 2 ? 0.11 : sx, sy, face % 2 ? sx : 0.11, hex, opacity);
  }

  function reflection(x: number, z: number, w: number, d: number, angle: number, hex: number, opacity: number) {
    reflections.push({ x, z, w, d, angle, color: hex, opacity, seed: rain() });
  }

  function spill(x: number, z: number, direction: Face, hex: number, length: number, strength: number) {
    const normalX = direction === 1 ? 1 : direction === 3 ? -1 : 0;
    const normalZ = direction === 0 ? 1 : direction === 2 ? -1 : 0;
    for (let i = 0; i < 16; i++) {
      const reach = rain() * length;
      const spread = (rain() - 0.5) * (0.75 + reach * 0.27);
      const dx = x + normalX * reach + normalZ * spread;
      const dz = z + normalZ * reach + normalX * spread;
      if (Math.abs(dx) > 15.9 || Math.abs(dz) > 15.9) continue;
      const fade = 1 - reach / length;
      reflection(dx, dz, 0.11 + rain() * 0.42, 0.29 + rain() * 1.95, direction * Math.PI / 2, hex, strength * (0.28 + fade * 0.72));
      if (i % 3 === 0) {
        addSplat(dx, 0.115, dz, normalX ? 0.68 : 0.22, 0.035, normalZ ? 0.68 : 0.22, hex, strength * fade * 0.75);
      }
    }
  }

  function sign(b: Building, face: Face, id: number, u: number, y: number, w: number, h: number, depth = 0.15, neon = true) {
    const [x, py, z] = facePoint(b, face, u, y, depth);
    const hex = signColors[id];
    panel('metal', b, face, u, y, w + 0.12, h + 0.12, 0.11, 0x1c2630, depth - 0.075);
    panel('metal', b, face, u - w * 0.34, y, 0.075, h * 0.85, depth, b.trim, depth * 0.35);
    panel('metal', b, face, u + w * 0.34, y, 0.075, h * 0.85, depth, b.trim, depth * 0.35);
    const aspect = signStyles[id];
    const pixelsW = aspect === 'v' ? 84 : 244;
    const pixelsH = aspect === 'h' ? 82 : 244;
    const left = (id % 8) * 256 + (256 - pixelsW) / 2 + 0.5;
    const top = Math.floor(id / 8) * 256 + (256 - pixelsH) / 2 + 0.5;
    const leftUv = left / 2048;
    const rightUv = (left + pixelsW - 1) / 2048;
    const topUv = 1 - top / 1024;
    const bottomUv = 1 - (top + pixelsH - 1) / 1024;
    const corners = [
      facePoint(b, face, u - w / 2, py - h / 2, depth),
      facePoint(b, face, u + w / 2, py - h / 2, depth),
      facePoint(b, face, u + w / 2, py + h / 2, depth),
      facePoint(b, face, u - w / 2, py + h / 2, depth),
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) signVertices.push(...corners[index]);
    signUvs.push(leftUv, bottomUv, rightUv, bottomUv, rightUv, topUv, leftUv, bottomUv, rightUv, topUv, leftUv, topUv);
    if (neon) {
      const vertical = h > w;
      if (vertical) {
        for (const side of [-1, 1]) {
          panel('light', b, face, u + side * (w / 2 + 0.035), y, 0.028, h * 0.91, 0.031, hex, depth + 0.008, 1.65);
        }
      } else {
        panel('light', b, face, u, y + h / 2 + 0.03, w * 0.94, 0.028, 0.032, hex, depth + 0.008, 1.50);
      }
      facadeSplat(b, face, u, y, w * 0.65, h * 0.58, hex, 0.32, depth + 0.18);
      if (y < 6.5 && (Math.abs(x) > 6.85 || Math.abs(z) > 7.4)) {
        spill(x, z, face, hex, 5.5, vertical ? 0.31 : 0.27);
      }
    }
  }

  function roof(b: Building, idx: number) {
    const top = b.h;
    const roofX = b.x + (details() - 0.5) * b.w * 0.45;
    const roofZ = b.z + (details() - 0.5) * b.d * 0.43;
    box('wall', b.x, top + 0.027, b.z, b.w + 0.15, 0.14, b.d + 0.15, b.trim);
    box('metal', b.x, top + 0.108, b.z, b.w - 0.13, 0.035, b.d - 0.13, 0x252838);
    for (const face of facades) {
      panel('wall', b, face, 0, top + 0.17, (face % 2 ? b.d : b.w) + 0.055, 0.25, 0.115, b.trim, -0.015);
      panel('metal', b, face, 0, top + 0.305, (face % 2 ? b.d : b.w) + 0.14, 0.045, 0.13, 0x6c646d, -0.013);
      panel('metal', b, face, 0, top - 0.26, (face % 2 ? b.d : b.w) + 0.04, 0.065, 0.078, 0x151922);
      if ((face === 0 || face === 1) && (b.style === 'tower' || idx % 3 === 0)) {
        panel('light', b, face, 0, top - 0.14, (face % 2 ? b.d : b.w) - 0.13, 0.019, 0.024, b.accent, 0.05, 1.42);
      }
    }
    const hvacW = b.w * (0.24 + details() * 0.15);
    const hvacD = b.d * (0.22 + details() * 0.18);
    box('metal', roofX, top + 0.30, roofZ, hvacW, 0.38, hvacD, 0x616575);
    box('metal', roofX, top + 0.49, roofZ, hvacW + 0.08, 0.085, hvacD + 0.08, 0x878a92);
    for (let i = 0; i < 5; i++) {
      box('metal', roofX, top + 0.545, roofZ + (i - 2) * hvacD * 0.14, hvacW * 0.81, 0.023, 0.049, 0x232a36);
    }
    for (let i = 0; i < 4; i++) {
      box('metal', roofX, top + 0.21 + i * 0.052, roofZ + hvacD / 2 + 0.006, hvacW * 0.76, 0.019, 0.028, 0x2b303d);
    }
    if (idx % 2 === 0) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.55, 10), tankMaterial);
      tank.position.set(b.x - b.w * 0.31, top + 0.47, b.z + b.d * 0.28);
      city.add(tank);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.29, 0.12, 10), tankCapMaterial);
      cap.position.copy(tank.position);
      cap.position.y += 0.31;
      city.add(cap);
      for (const dx of [-0.14, 0.14]) {
        box('metal', tank.position.x + dx, top + 0.17, tank.position.z, 0.05, 0.24, 0.49, 0x686b73);
      }
    }
    const lines = idx % 5 === 0 ? 3 : idx % 3 === 0 ? 2 : 1;
    for (let i = 0; i < lines; i++) {
      const poleX = b.x + b.w * (0.30 - i * 0.27);
      const poleZ = b.z - b.d * 0.28 + i * 0.27;
      const mast = 0.46 + details() * (b.style === 'tower' ? 1.45 : 0.75);
      box('metal', poleX, top + 0.13, poleZ, 0.14, 0.25, 0.14, 0x3c4756);
      box('metal', poleX, top + mast / 2, poleZ, 0.032, mast, 0.032, 0x8b9aaa);
      for (let j = 1; j < 4; j++) {
        const level = top + mast * (0.47 + j * 0.105);
        box('metal', poleX, level, poleZ, 0.44 - j * 0.07, 0.018, 0.019, 0x899aaa, j % 2 ? 0.15 : 1.5);
      }
      if (b.h > 7 && i === 0) {
        box('light', poleX, top + mast + 0.025, poleZ, 0.10, 0.065, 0.10, red, 0, 1.8);
        addSplat(poleX, top + mast + 0.045, poleZ, 0.22, 0.16, 0.22, red, 0.74);
      }
    }
    for (let i = 0; i < 7; i++) {
      const dx = b.x + (details() - 0.5) * b.w * 0.90;
      const dz = b.z + (details() - 0.5) * b.d * 0.90;
      addSplat(dx, top + 0.17, dz, 0.17 + details() * 0.28, 0.027, 0.16 + details() * 0.33, i % 3 ? 0x7e879a : b.accent, 0.11);
    }
  }

  const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x6c707b, roughness: 0.61, metalness: 0.55 });
  const tankCapMaterial = new THREE.MeshStandardMaterial({ color: 0x969294, roughness: 0.57, metalness: 0.39 });

  function facade(b: Building, face: Face, index: number) {
    const width = face % 2 ? b.d : b.w;
    const streetFace = face < 2;
    const bays = b.style === 'tower' ? Math.floor(width * 2.0) : Math.max(3, Math.floor(width * (b.style === 'office' ? 1.55 : 1.35)));
    const bay = (width - 0.43) / bays;
    const upper = b.h < 4 ? 1.90 : 2.07;
    const floor = (b.h - upper - 0.30) / (b.floors - 1);
    panel('wall', b, face, 0, 1.02, width + 0.10, 1.78, 0.095, b.style === 'service' ? 0x1f363e : 0x2c2735);
    panel('metal', b, face, 0, upper - 0.14, width + 0.17, 0.10, 0.21, b.trim);
    panel('metal', b, face, 0, 0.16, width + 0.14, 0.17, 0.12, 0x4d4751);
    for (const u of [-width / 2 + 0.09, width / 2 - 0.09]) {
      panel('wall', b, face, u, b.h / 2, 0.20, b.h, 0.115, b.trim);
      panel('metal', b, face, u, b.h / 2, 0.032, b.h - 0.22, 0.025, 0x767182, 0.086);
    }
    if (b.style === 'tower') {
      for (const u of [-1, 1]) {
        panel('wall', b, face, u * width * 0.27, b.h / 2 + 0.8, 0.135, b.h - 1.55, 0.12, b.trim, 0.10);
        panel('light', b, face, u * (width / 2 - 0.13), b.h / 2 + 0.95, 0.033, b.h - 3.45, 0.03, b.accent, 0.091, 1.52);
      }
    }
    for (let level = 0; level < b.floors - 1; level++) {
      const base = upper + level * floor;
      const wh = floor * (b.style === 'tower' ? 0.59 : b.style === 'shop' ? 0.45 : 0.53);
      const y = base + floor * 0.55;
      const rim = level % 3 === 0 ? b.trim : 0x3a3f4d;
      panel('metal', b, face, 0, base + 0.035, width - 0.18, 0.052, 0.087, rim);
      if (b.style !== 'tower') {
        panel('wall', b, face, 0, y - wh * 0.52, width - 0.33, 0.064, 0.14, b.trim, 0.077);
      }
      for (let i = 0; i < bays; i++) {
        const u = (i - (bays - 1) / 2) * bay;
        const ww = bay * (b.style === 'tower' ? 0.78 : b.style === 'office' ? 0.72 : 0.62);
        const p = details();
        const lit = p > (streetFace ? 0.46 : 0.68);
        const hue = p > 0.88 ? amber : p > 0.66 ? b.accent : 0x78acd1;
        panel('metal', b, face, u, y, ww + 0.066, wh + 0.077, 0.060, b.trim);
        panel('glass', b, face, u, y, ww, wh, 0.044, lit ? 0x324251 : 0x111c2a, 0.043);
        if (lit) {
          panel('light', b, face, u, y + wh * 0.025, ww * (0.84 + details() * 0.10), wh * 0.83, 0.014, hue, 0.073, 0.25 + details() * 0.65);
          for (let j = 0; j < 2 + Number(p > 0.62); j++) {
            const yy = y + j * wh * 0.125;
            panel('metal', b, face, u, yy, ww * 0.96, 0.014, 0.012, p > 0.72 ? 0x635065 : 0x324653, 0.085);
          }
          if (streetFace && (p > 0.72 || i % 2 === 0)) {
            facadeSplat(b, face, u, y, ww * 0.80, wh * 0.79, hue, p > 0.88 ? 0.29 : 0.18);
          }
        }
        if (ww > 0.20) panel('metal', b, face, u, y, 0.022, wh, 0.026, 0x2a3342, 0.082);
        if (i % 3 === index % 3 && (level + i) % 3 === 0 && b.style !== 'tower') {
          const acY = y - wh * 0.65;
          panel('wall', b, face, u + ww * 0.15, acY, ww * 0.71, 0.165, 0.15, 0x979397, 0.11);
          panel('metal', b, face, u + ww * 0.15, acY, ww * 0.54, 0.112, 0.034, 0x35404a, 0.19);
          for (let j = -1; j < 2; j++) {
            panel('metal', b, face, u + ww * 0.15, acY + j * 0.024, ww * 0.51, 0.010, 0.014, 0x86868b, 0.212);
          }
        }
      }
    }
    if (b.style === 'service' || index % 3 === 1) {
      const u = -width / 2 + 0.26;
      panel('metal', b, face, u, b.h * 0.46, 0.065, b.h * 0.87, 0.077, 0x77717d, 0.094);
      for (let p = 0.8; p < b.h * 0.9; p += 1.02) {
        panel('metal', b, face, u, p, 0.115, 0.032, 0.105, 0x303540, 0.099);
      }
    }
    if (!streetFace && b.style === 'shop') {
      panel('metal', b, face, -width * 0.17, 0.81, width * 0.38, 1.26, 0.032, 0x55535e, 0.084);
      for (let i = 0; i < 12; i++) {
        panel('wall', b, face, -width * 0.17, 0.23 + 0.105 * i, width * 0.38, 0.024, 0.025, 0x383746, 0.11);
      }
    }
    const stores = b.w < 3 ? 2 : 3;
    const storeW = (width - 0.32) / stores;
    for (let i = 0; i < stores; i++) {
      const u = (i - (stores - 1) / 2) * storeW;
      const lit = streetFace && (i > 0 || index % 3 !== 0);
      const hue = b.style === 'service' ? cyan : i % 2 ? b.accent : amber;
      panel('wall', b, face, u, 0.97, storeW * 0.89, 1.42, 0.082, 0x161d2a, 0.096);
      panel('glass', b, face, u, 0.98, storeW * 0.82, 1.32, 0.046, 0x284255, 0.15);
      if (lit) {
        panel('light', b, face, u, 1.48, storeW * 0.74, 0.074, 0.022, hue, 0.18, 1.17);
        panel('light', b, face, u + storeW * 0.07, 1.03, storeW * 0.66, 0.84, 0.018, hue, 0.173, i === 1 ? 0.22 : 0.31);
        facadeSplat(b, face, u, 1.12, storeW * 0.58, 0.60, hue, 0.30, 0.19);
      }
      panel('metal', b, face, u, 0.92, 0.045, 1.44, 0.052, 0x424453, 0.201);
      panel('metal', b, face, u, 0.66, storeW * 0.87, 0.038, 0.052, 0x373a49, 0.202);
      panel('metal', b, face, u + storeW * 0.12, 0.85, 0.04, 0.13, 0.037, 0xa9b3b7, 0.224);
      for (let j = 0; j < 3; j++) {
        panel('metal', b, face, u - storeW * 0.26 + j * storeW * 0.12, 0.44 + details() * 0.13, storeW * 0.08, 0.15, 0.052, j % 2 ? 0x6c5763 : 0x48626b, 0.21);
      }
    }
  }

  function awning(b: Building, face: Face, u: number, width: number, hex: number, striped: boolean) {
    const reach = 0.52;
    panel('metal', b, face, u, 1.97, width, 0.055, reach, 0x4a4148, reach / 2 + 0.04);
    for (let i = 0; i < 8; i++) {
      const strip = width / 8;
      const shade = striped && i % 2 ? 0xaaa1a1 : hex;
      panel('wall', b, face, u - width / 2 + (i + 0.5) * strip, 1.94, strip - 0.008, 0.042, reach, shade, reach / 2 + 0.10);
      panel('wall', b, face, u - width / 2 + (i + 0.5) * strip, 1.88 - (i % 2) * 0.009, strip - 0.008, 0.125, 0.052, shade, reach + 0.08);
    }
    panel('light', b, face, u, 1.833, width * 0.86, 0.026, 0.027, b.accent, reach + 0.054, 1.34);
    for (const position of [-0.38, 0.38]) {
      panel('metal', b, face, u + width * position, 1.86, 0.045, 0.055, reach + 0.06, 0x979097, 0.31);
    }
    facadeSplat(b, face, u, 1.832, width * 0.74, 0.22, b.accent, 0.37, reach + 0.10);
  }

  const posters: [number, Face, number, number, number, number, number, number?][] = [
    [0, 0, 0, 0.69, 9.56, 1.09, 5.06, 0.42],
    [0, 1, 1, 0.03, 12.52, 3.43, 1.05, 0.24],
    [0, 1, 10, -1.32, 7.99, 0.65, 3.12, 0.24],
    [0, 2, 17, -1.46, 8.22, 0.78, 3.22],
    [1, 0, 2, -0.94, 6.70, 0.72, 3.12, 0.24],
    [1, 1, 15, 0.09, 8.60, 3.24, 0.88, 0.21],
    [2, 0, 7, 0.62, 8.74, 2.28, 2.28, 0.26],
    [2, 1, 10, 1.0, 7.64, 0.78, 3.35, 0.31],
    [2, 1, 1, -0.20, 10.23, 3.32, 0.92, 0.21],
    [2, 1, 17, -1.90, 3.55, 0.56, 2.39, 0.36],
    [3, 0, 14, -0.89, 5.46, 0.58, 2.44, 0.19],
    [3, 1, 18, 0.04, 6.90, 2.47, 0.65, 0.17],
    [4, 0, 11, 0.48, 6.18, 2.10, 2.10, 0.26],
    [4, 1, 2, 1.07, 5.62, 0.64, 2.63, 0.27],
    [5, 0, 18, -0.48, 6.59, 2.53, 0.67, 0.20],
    [5, 0, 0, 1.19, 4.65, 0.65, 3.02, 0.39],
    [5, 1, 14, -1.05, 4.95, 0.59, 2.50, 0.28],
    [6, 0, 3, 0.98, 5.11, 0.69, 3.08, 0.29],
    [6, 1, 11, 0.37, 6.38, 2.06, 2.06, 0.25],
    [6, 1, 6, -1.28, 4.13, 0.65, 2.60, 0.38],
    [6, 1, 13, 0.00, 2.19, 2.12, 0.64, 0.24],
    [7, 0, 9, 0.30, 5.97, 2.44, 0.67, 0.19],
    [7, 0, 6, -1.09, 4.40, 0.62, 2.33, 0.28],
    [8, 0, 0, 0.86, 4.48, 0.82, 2.96, 0.28],
    [8, 0, 18, -0.59, 5.50, 1.95, 0.58, 0.21],
    [8, 1, 2, 1.05, 4.62, 0.62, 2.55, 0.25],
    [9, 0, 7, 0.29, 4.11, 1.77, 1.77, 0.23],
    [9, 1, 12, 0.51, 4.65, 2.00, 0.61, 0.25],
    [10, 0, 14, -0.84, 3.76, 0.66, 2.54, 0.25],
    [10, 1, 2, 0.92, 3.62, 0.64, 2.43, 0.35],
    [10, 1, 5, -0.61, 2.39, 1.60, 0.48, 0.29],
    [11, 0, 4, 0.0, 2.32, 2.34, 0.76, 0.34],
    [11, 0, 3, 1.15, 2.00, 0.43, 1.56, 0.54],
    [12, 0, 9, 0.0, 2.33, 2.34, 0.66, 0.27],
    [12, 0, 16, -0.31, 1.16, 0.57, 0.19, 0.27],
    [13, 0, 8, 0.0, 2.39, 3.77, 0.73, 0.29],
    [13, 1, 19, 0.09, 1.51, 1.24, 0.38, 0.28],
    [14, 0, 18, 0.0, 2.48, 3.44, 0.77, 0.29],
    [14, 1, 0, -0.48, 2.18, 0.58, 2.13, 0.48],
    [14, 1, 16, 0.54, 1.23, 0.57, 0.20, 0.27],
  ];

  for (let index = 0; index < blocks.length; index++) {
    const b = blocks[index];
    box('wall', b.x, b.h / 2 + 0.09, b.z, b.w, b.h - 0.05, b.d, b.color);
    box('metal', b.x, 0.16, b.z, b.w + 0.09, 0.27, b.d + 0.09, 0x35323c);
    for (const face of facades) facade(b, face, index);
    roof(b, index);
    if (b.style === 'shop' || index > 10) {
      awning(b, 0, 0, b.w * 0.87, [0x992946, 0x326f7d, 0x80436d, 0x315e60][index % 4], index % 2 === 0);
      if (b.x > 3) awning(b, 1, 0, b.d * 0.74, 0x643f65, index % 2 === 0);
    }
  }
  for (const [index, face, id, u, y, w, h, out] of posters) {
    sign(blocks[index], face, id, u, y, w, h, out);
  }

  // Communications crown and the narrow emergency rails on the landmark tower.
  const tower = blocks[0];
  box('wall', tower.x - 0.13, tower.h + 0.39, tower.z - 0.19, 3.31, 0.72, 2.83, 0x33465b);
  box('metal', tower.x - 0.13, tower.h + 0.764, tower.z - 0.19, 3.48, 0.12, 3.02, 0x557084);
  box('wall', tower.x - 0.47, tower.h + 0.98, tower.z - 0.31, 2.37, 0.51, 2.09, 0x2a344c);
  box('metal', tower.x - 0.47, tower.h + 1.24, tower.z - 0.31, 2.48, 0.08, 2.20, 0x657186);
  box('metal', tower.x - 0.67, tower.h + 2.00, tower.z - 0.51, 0.052, 1.66, 0.052, 0x99a9b8);
  box('metal', tower.x - 0.67, tower.h + 2.29, tower.z - 0.51, 0.52, 0.025, 0.025, 0x8098a6);
  box('light', tower.x - 0.67, tower.h + 2.86, tower.z - 0.51, 0.09, 0.075, 0.09, red, 0, 2.1);
  addSplat(tower.x - 0.67, tower.h + 2.86, tower.z - 0.51, 0.21, 0.18, 0.21, red, 0.76);
  for (const edge of [-1, 1]) {
    box('light', tower.x - 0.13, tower.h + 0.731, tower.z - 0.19 + edge * 1.524, 3.49, 0.036, 0.035, cyan, 0, 1.76);
    box('light', tower.x - 0.13 + edge * 1.751, tower.h + 0.731, tower.z - 0.19, 0.035, 0.036, 3.05, cyan, 0, 1.76);
    for (let i = 0; i < 14; i++) {
      box('light', tower.x - 1.57 + i * 0.22, tower.h + 0.39, tower.z - 0.19 + edge * 1.42, 0.165, 0.21, 0.027, i % 3 ? cyan : blue, 0, 0.56);
    }
  }
  for (let i = 0; i < 68; i++) {
    const y = 0.74 + i * 0.185;
    box('metal', tower.x - tower.w / 2 - 0.12, y, tower.z + 1.11, 0.056, 0.020, 0.25, 0x728592);
  }
  for (const z of [tower.z + 0.98, tower.z + 1.23]) {
    box('metal', tower.x - tower.w / 2 - 0.13, 6.97, z, 0.052, 12.55, 0.045, 0x83939e);
  }

  // Slabs, utility cavities and cable runs under the wet city block.
  box('street', 0, -0.15, 0, 31.95, 0.28, 31.95, 0x303341);
  box('metal', 0, -0.36, 0, 31.67, 0.17, 31.67, 0x575d6e);
  box('wall', 0, -0.52, 0, 31.43, 0.23, 31.43, 0x151d2a);
  box('metal', 0, -0.75, 0, 31.04, 0.31, 31.04, 0x222a3a);
  box('wall', 0, -0.99, 0, 30.49, 0.23, 30.49, 0x293145);
  box('metal', 0, -1.19, 0, 29.88, 0.22, 29.88, 0x171f2f);
  for (const side of facades) {
    const angle = side * Math.PI / 2;
    const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    function platformBox(paint: Paint, along: number, y: number, reach: number, w: number, h: number, d: number, hex: number, power = 1) {
      box(paint, normal.x * reach + tangent.x * along, y, normal.z * reach + tangent.z * along, w, h, d, hex, angle, power);
    }
    platformBox('metal', 0, -0.52, 15.76, 31.45, 0.055, 0.11, 0x626b7b);
    platformBox('metal', 0, -0.783, 15.55, 30.98, 0.045, 0.13, 0x556476);
    for (let i = -10; i <= 10; i++) {
      const x = i * 1.47;
      platformBox('metal', x, -0.72, 15.58, 1.27, 0.25, 0.075, i % 2 ? 0x3d495b : 0x454d5f);
      platformBox('wall', x, -0.76, 15.63, 1.17, 0.115, 0.044, 0x121927);
      platformBox('metal', x - 0.56, -0.75, 15.67, 0.08, 0.14, 0.052, 0x5a6371);
      if (i % 3 === 0) {
        const hue = side % 2 ? pink : cyan;
        platformBox('light', x - 0.19, -0.74, 15.67, 0.37, 0.021, 0.03, hue, 1.16);
        addSplat(normal.x * 15.8 + tangent.x * x, -0.74, normal.z * 15.8 + tangent.z * x, 0.13, 0.06, 0.16, hue, 0.24);
      }
      if (i % 4 === 1 || i % 4 === -1) {
        platformBox('metal', x, -1.35, 14.70, 0.45, 0.39, 0.38, 0x394251);
        platformBox('metal', x, -1.56, 14.70, 0.30, 0.08, 0.34, 0x666c78);
        platformBox('light', x, -1.61, 14.70, 0.10, 0.052, 0.10, side % 2 ? pink : cyan, 1.20);
      }
    }
    for (const x of [-11, 0, 10]) {
      for (let i = 0; i < 3; i++) {
        const mid = normal.clone().multiplyScalar(15.15 - i * 0.075).addScaledVector(tangent, x + i * 0.22);
        mid.y = -2.0 - i * 0.15;
        const a = normal.clone().multiplyScalar(15.45).addScaledVector(tangent, x - 1.27 + i * 0.08);
        const b = normal.clone().multiplyScalar(15.45).addScaledVector(tangent, x + 1.27 + i * 0.08);
        a.y = b.y = -0.89;
        cable(fixtures, new THREE.QuadraticBezierCurve3(a, mid, b), 12);
      }
    }
  }
  for (const x of [-12.7, 12.7]) {
    for (const z of [-12.7, 12.7]) {
      box('metal', x, -1.49, z, 2.05, 0.55, 2.05, 0x2c3447);
      box('wall', x, -1.79, z, 1.72, 0.13, 1.71, 0x1d2b41);
      box('light', x, -1.867, z, 1.29, 0.037, 1.29, cyan, 0, 0.93);
      addSplat(x, -2.01, z, 1.14, 0.35, 1.14, blue, 0.29);
    }
  }

  const asphalt = document.createElement('canvas');
  asphalt.width = asphalt.height = 512;
  const asphaltContext = asphalt.getContext('2d')!;
  const asphaltRand = random(217691);
  const grit = asphaltContext.createImageData(512, 512);
  for (let i = 0; i < grit.data.length; i += 4) {
    const value = asphaltRand() * asphaltRand() * 44;
    grit.data[i] = 27 + value * 0.8;
    grit.data[i + 1] = 28 + value;
    grit.data[i + 2] = 39 + value;
    grit.data[i + 3] = 255;
  }
  asphaltContext.putImageData(grit, 0, 0);
  for (let i = 0; i < 450; i++) {
    const x = asphaltRand() * 512;
    const y = asphaltRand() * 512;
    asphaltContext.strokeStyle = asphaltRand() > 0.4 ? '#080f2336' : '#8898bd27';
    asphaltContext.lineWidth = 0.6 + asphaltRand() * 0.8;
    asphaltContext.beginPath();
    asphaltContext.moveTo(x, y);
    asphaltContext.lineTo(x + 8 * asphaltRand(), y + 4 * asphaltRand());
    asphaltContext.stroke();
  }
  const asphaltMap = new THREE.CanvasTexture(asphalt);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(3, 3);
  asphaltMap.anisotropy = 4;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(31.94, 31.94),
    new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.62, metalness: 0.28 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.008;
  city.add(road);

  box('street', 0, 0.066, 0, 17.94, 0.125, 17.94, 0x4c4b58);
  for (const side of [-1, 1]) {
    box('street', side * 14.47, 0.062, 0, 2.96, 0.12, 31.95, 0x424655);
    box('street', 0, 0.061, side * 14.47, 26.03, 0.12, 2.96, 0x414552);
    box('street', side * 13.00, 0.091, 0, 0.13, 0.17, 26.10, 0x77727d);
    box('street', 0, 0.091, side * 13.00, 26.10, 0.17, 0.13, 0x77727d);
    box('street', side * 8.98, 0.097, 0, 0.14, 0.17, 17.94, 0x837d88);
    box('street', 0, 0.097, side * 8.98, 17.94, 0.17, 0.14, 0x837d88);
    box('mark', side * 9.22, 0.019, 0, 0.040, 0.012, 17.91, 0x6b5365);
    box('mark', 0, 0.019, side * 9.22, 17.91, 0.012, 0.040, 0x6b5365);
    box('mark', side * 12.74, 0.019, 0, 0.065, 0.012, 25.48, 0x938078);
    box('mark', 0, 0.019, side * 12.74, 25.48, 0.012, 0.065, 0x938078);
    box('street', side * 15.88, 0.130, 0, 0.15, 0.17, 31.94, 0x717883);
    box('street', 0, 0.130, side * 15.88, 31.66, 0.17, 0.15, 0x717883);
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue;
      const along = i * 1.45;
      box('mark', side * 10.99, 0.023, along, 0.062, 0.013, 0.68, 0xa28c75);
      box('mark', along, 0.023, side * 10.99, 0.68, 0.013, 0.062, 0xa28c75);
    }
    for (let i = 0; i < 8; i++) {
      const reach = side * (9.47 + i * 0.44);
      box('mark', 0, 0.025, reach, 1.86, 0.015, 0.249, i % 2 ? 0x9d9eaa : 0xb0b2bc);
      box('mark', reach, 0.025, 0, 0.249, 0.015, 1.86, i % 2 ? 0xa3a4b0 : 0xb1b2bb);
    }
    for (const across of [-1.30, 1.30]) {
      box('mark', across, 0.019, side * 11.89, 0.104, 0.013, 1.78, 0x9b98a1);
      box('mark', side * 11.89, 0.019, across, 1.78, 0.013, 0.104, 0x9b98a1);
    }
    for (let i = -16; i <= 16; i++) {
      const along = i * 0.96;
      box('metal', along, 0.128, side * 14.63, 0.017, 0.010, 2.44, 0x292d3a);
      box('metal', side * 14.63, 0.129, along, 2.44, 0.010, 0.017, 0x292d3a);
      if (Math.abs(i) < 10) {
        box('metal', along, 0.137, side * 8.65, 0.018, 0.013, 0.61, 0x313542);
        box('metal', side * 8.65, 0.137, along, 0.61, 0.013, 0.018, 0x313542);
      }
    }
    for (const row of [13.37, 14.00, 14.63, 15.24]) {
      box('metal', 0, 0.128, side * row, 31.48, 0.012, 0.018, 0x2f3341);
      box('metal', side * row, 0.129, 0, 0.018, 0.012, 31.48, 0x2f3341);
    }
    for (let i = -13; i <= 13; i++) {
      if (Math.abs(i) > 1) continue;
      box('mark', i * 0.38, 0.186, side * 8.86, 0.355, 0.018, 0.16, 0x877442);
      box('mark', i * 0.38, 0.177, side * 13.12, 0.355, 0.018, 0.17, 0x786c44);
      box('mark', side * 8.86, 0.186, i * 0.38, 0.16, 0.018, 0.355, 0x877442);
      box('mark', side * 13.12, 0.177, i * 0.38, 0.17, 0.018, 0.355, 0x786c44);
    }
  }
  for (let j = 0; j < 180; j++) {
    const surfaceX = (rain() * 2 - 1) * 15.7;
    const surfaceZ = (rain() * 2 - 1) * 15.7;
    const reach = Math.max(Math.abs(surfaceX), Math.abs(surfaceZ));
    if (reach < 9.2 || reach > 12.88) continue;
    reflection(surfaceX, surfaceZ, 0.14 + rain() * 0.65, 0.31 + rain() * 1.30, rain() * Math.PI, rain() > 0.75 ? blue : 0x879fb9, 0.09 + rain() * 0.14);
  }
  for (const [x, z, finish, hex] of [
    [-7.4, 8.95, 0, red], [-4.03, 8.95, 0, amber], [1.40, 8.95, 0, cyan], [4.65, 8.95, 0, violet], [7.67, 8.95, 0, pink],
    [8.95, 6.34, 1, pink], [8.95, 3.75, 1, violet], [8.95, -2.7, 1, red], [8.95, -4.53, 1, cyan], [8.95, -7.5, 1, blue],
    [-8.95, -5.7, 3, cyan], [2.62, -8.95, 2, pink],
  ]) {
    spill(x, z, finish as Face, hex, 5.3, hex === amber ? 0.24 : 0.37);
  }

  function vending(x: number, z: number, angle: number, shell: number, hex: number) {
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    function piece(paint: Paint, u: number, y: number, d: number, w: number, h: number, depth: number, tint: number, power = 1) {
      box(paint, x + cosine * u + sine * d, y, z - sine * u + cosine * d, w, h, depth, tint, angle, power);
    }
    piece('wall', 0, 0.712, 0, 0.68, 1.16, 0.47, shell);
    piece('metal', 0, 0.126, 0.012, 0.708, 0.09, 0.48, 0x434651);
    piece('glass', -0.068, 0.849, 0.24, 0.45, 0.56, 0.044, 0x243048);
    piece('light', -0.065, 1.169, 0.252, 0.55, 0.085, 0.03, hex, 1.36);
    piece('light', 0.213, 0.740, 0.260, 0.093, 0.073, 0.025, hex, 0.78);
    piece('metal', -0.02, 0.363, 0.25, 0.44, 0.127, 0.030, 0x161d29);
    for (let i = 0; i < 3; i++) {
      const y = 0.641 + i * 0.18;
      piece('metal', -0.072, y, 0.265, 0.43, 0.022, 0.019, 0x838a99);
      for (let j = 0; j < 5; j++) {
        piece('light', -0.239 + j * 0.085, y + 0.072, 0.260, 0.046, 0.084, 0.018, [cyan, pink, amber, lime, violet][(j * 2 + i) % 5], 0.90);
      }
    }
    addSplat(x + sine * 0.35, 0.87, z + cosine * 0.35, 0.32, 0.44, 0.32, hex, 0.36);
  }

  vending(-5.12, 8.31, 0, 0x992e43, pink);
  vending(-2.45, 8.30, 0, 0x476084, cyan);
  vending(3.20, 8.23, 0, 0x2e596b, cyan);
  vending(7.79, 5.11, Math.PI / 2, 0x593967, violet);
  vending(8.24, -6.00, Math.PI / 2, 0x325c67, cyan);
  vending(8.12, -5.19, Math.PI / 2, 0x693c57, pink);
  vending(-8.27, -0.20, -Math.PI / 2, 0x4d466a, violet);
  vending(4.61, -8.12, Math.PI, 0x465f7c, cyan);

  function lightPole(x: number, z: number, side: Face, hex: number, height: number) {
    const angle = side * Math.PI / 2;
    const normalX = Math.sin(angle);
    const normalZ = Math.cos(angle);
    box('metal', x, 0.24, z, 0.22, 0.25, 0.22, 0x656775);
    box('wall', x, height / 2, z, 0.070, height, 0.070, 0x333f4c);
    box('metal', x + normalX * 0.31, height - 0.05, z + normalZ * 0.31, 0.055, 0.075, 0.66, 0x4b5965, angle);
    box('metal', x + normalX * 0.63, height - 0.055, z + normalZ * 0.63, 0.23, 0.111, 0.38, 0x596775, angle);
    box('light', x + normalX * 0.63, height - 0.115, z + normalZ * 0.63, 0.168, 0.032, 0.29, hex, angle, 1.85);
    addSplat(x + normalX * 0.65, height - 0.13, z + normalZ * 0.65, 0.24, 0.16, 0.25, hex, 0.58);
  }
  for (const side of facades) {
    const angle = side * Math.PI / 2;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    for (let i = -2; i <= 2; i++) {
      const along = i * 5.22 + 1.76;
      const x = nx * 13.47 + nz * along;
      const z = nz * 13.47 - nx * along;
      lightPole(x, z, ((side + 2) % 4) as Face, i === 0 ? amber : 0xa5d4ff, 2.66 + details() * 0.26);
    }
    for (let i = -8; i <= 8; i++) {
      const along = i * 1.61 + 0.22;
      if (Math.abs(along) < 1.43 || Math.abs(along) > 12.9) continue;
      const x = nx * 13.15 + nz * along;
      const z = nz * 13.15 - nx * along;
      box('metal', x, 0.278, z, 0.083, 0.31, 0.083, 0x92939b);
      box('mark', x, 0.393, z, 0.086, 0.049, 0.086, i % 2 ? 0x9c714c : 0x9a91a0);
    }
  }
  for (const [x, z, angle] of [[6.2, 14.25, 0], [-6.3, 14.33, 0], [14.30, 6.28, Math.PI / 2], [14.36, -6.2, Math.PI / 2], [-14.36, -5.28, -Math.PI / 2]]) {
    box('metal', x, 0.34, z, 1.22, 0.12, 0.42, 0x64515c, angle);
    box('wall', x, 0.47, z, 1.22, 0.20, 0.08, 0x73616a, angle);
    for (const side of [-1, 1]) {
      box('metal', x + Math.cos(angle) * side * 0.42, 0.235, z - Math.sin(angle) * side * 0.42, 0.077, 0.24, 0.38, 0x383b4d, angle);
    }
  }
  for (const [x, z] of [[-8.27, 8.35], [8.28, 8.42], [8.52, -8.49], [-8.27, -8.42], [13.55, 12.97], [-13.48, 12.8], [13.55, -12.97]]) {
    box('wall', x, 0.41, z, 0.46, 0.58, 0.43, 0x51555e);
    box('metal', x, 0.71, z, 0.49, 0.075, 0.47, 0x777780);
    box('metal', x, 0.49, z + 0.23, 0.29, 0.26, 0.03, 0x2e3744);
    box('light', x + 0.10, 0.49, z + 0.25, 0.038, 0.045, 0.03, lime, 0, 0.86);
  }

  for (const [first, second, height] of [
    [0, 1, 7.51], [1, 2, 7.34], [0, 4, 6.08], [3, 7, 5.0], [5, 9, 4.86], [6, 10, 4.67], [7, 8, 4.21], [8, 9, 4.39], [9, 10, 3.97], [10, 14, 3.14],
  ]) {
    const a = blocks[first];
    const b = blocks[second];
    for (let i = 0; i < 3; i++) {
      const aPoint = new THREE.Vector3(a.x + a.w * 0.18, height + i * 0.12, a.z + a.d * 0.28 + i * 0.11);
      const bPoint = new THREE.Vector3(b.x - b.w * 0.19, height + 0.27 + i * 0.12, b.z - b.d * 0.27 + i * 0.11);
      const mid = aPoint.clone().lerp(bPoint, 0.5);
      mid.y -= 0.53 + i * 0.17;
      cable(wires, new THREE.QuadraticBezierCurve3(aPoint, mid, bPoint));
    }
  }
  for (const [a, b, height, side] of [[-7.16, -2.21, 3.77, 0], [1.98, 7.92, 3.82, 0], [-5.75, -0.94, 4.67, 1], [1.89, 7.89, 4.40, 1], [-6.2, -1.94, 4.90, 2]]) {
    const angle = side * Math.PI / 2;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    const pointAt = (line: number, y: number, n: number) => new THREE.Vector3(nx * n + nz * line, y, nz * n - nx * line);
    for (const v of [a, b]) {
      const pole = pointAt(v, height / 2, 8.64);
      box('metal', pole.x, pole.y, pole.z, 0.076, height, 0.076, 0x626974);
      box('metal', pole.x, height - 0.041, pole.z, 0.59, 0.04, 0.045, 0x626974, angle);
      for (const offset of [-0.22, 0, 0.22]) {
        const top = pointAt(v + offset, height + 0.055, 8.64);
        box('metal', top.x, top.y, top.z, 0.045, 0.115, 0.045, 0x808c96);
      }
    }
    for (const offset of [-0.22, 0, 0.22]) {
      const start = pointAt(a + offset, height + 0.105, 8.64);
      const end = pointAt(b + offset, height + 0.105, 8.64);
      const mid = pointAt((a + b) / 2 + offset, height - 0.58 - offset * 0.7, 8.70);
      cable(wires, new THREE.QuadraticBezierCurve3(start, mid, end), 19);
    }
  }
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0x5c6479, transparent: true, opacity: 0.67 });
  city.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), wireMaterial));
  city.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fixtures), new THREE.LineBasicMaterial({ color: 0x45526a })));

  // The rooftop advertisement is drawn with splats across a vertical plane.
  const holo = new THREE.Group();
  holo.name = 'Projected koi rings';
  holo.position.set(5.18, 11.09, -5.42);
  city.add(holo);
  const projectionMaterial = new THREE.MeshBasicMaterial({ color: 0x47cddd, transparent: true, opacity: 0.67, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const koiPoint = (u: number, v: number, jitter = 0) => [5.10 + u * 0.76 + jitter, 12.87 + v, -5.19 - u * 0.65 + jitter] as const;
  function koiSplat(u: number, v: number, tint: number, size: number, opacity: number) {
    const [x, y, z] = koiPoint(u, v, (details() - 0.5) * 0.09);
    addSplat(x, y, z, size, size * 0.91, size, tint, opacity);
  }
  const koiOutline = new THREE.SplineCurve([
    new THREE.Vector2(-1.43, -0.38), new THREE.Vector2(-0.82, -0.04), new THREE.Vector2(-0.50, 0.54),
    new THREE.Vector2(0.02, 0.91), new THREE.Vector2(0.64, 0.88), new THREE.Vector2(1.22, 0.48),
    new THREE.Vector2(1.01, 0.15), new THREE.Vector2(0.54, 0.07), new THREE.Vector2(0.11, -0.05),
    new THREE.Vector2(-0.44, -0.39), new THREE.Vector2(-1.43, -0.38),
  ]);
  const fin = new THREE.SplineCurve([
    new THREE.Vector2(-0.72, -0.28), new THREE.Vector2(-1.22, -0.08), new THREE.Vector2(-1.76, 0.02),
    new THREE.Vector2(-2.03, -0.24), new THREE.Vector2(-1.58, -0.46), new THREE.Vector2(-1.82, -0.88),
    new THREE.Vector2(-1.37, -0.82), new THREE.Vector2(-0.91, -0.48), new THREE.Vector2(-0.49, -0.32),
  ]);
  const dorsalFin = new THREE.SplineCurve([
    new THREE.Vector2(0.17, 0.85), new THREE.Vector2(-0.23, 1.14), new THREE.Vector2(-0.67, 1.23),
    new THREE.Vector2(-0.71, 1.03), new THREE.Vector2(-0.49, 0.61),
  ]);
  const pelvicFin = new THREE.SplineCurve([
    new THREE.Vector2(0.45, 0.19), new THREE.Vector2(0.23, -0.25), new THREE.Vector2(-0.06, -0.47),
    new THREE.Vector2(-0.10, -0.27), new THREE.Vector2(-0.22, 0.02),
  ]);
  for (const [curve, count, tint] of [[koiOutline, 130, cyan], [fin, 65, blue], [dorsalFin, 48, cyan], [pelvicFin, 42, cyan]] as const) {
    for (let step = 0; step <= count; step++) {
      const p = curve.getPoint(step / count);
      koiSplat(p.x, p.y, step % 9 === 0 ? 0xc9fbff : tint, 0.048 + details() * 0.043, 0.73);
    }
  }
  for (let i = 0; i < 220; i++) {
    const u = -0.93 + details() * 2.02;
    const center = u * 0.38 + 0.28;
    const radius = Math.sqrt(Math.max(0, 1 - ((u - 0.10) / 1.11) ** 2)) * 0.49;
    const v = center + (details() * 2 - 1) * radius;
    const tint = Math.sin(4.5 * u + 8 * v) > 0.18 ? cyan : 0x487eef;
    koiSplat(u, v, tint, 0.037 + details() * 0.053, 0.49 + details() * 0.25);
  }
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    koiSplat(0.84 + Math.cos(angle) * 0.106, 0.54 + Math.sin(angle) * 0.106, 0xe9fdff, 0.076, 0.96);
  }
  for (let i = 0; i < 38; i++) {
    koiSplat(-2.05 + details() * 3.55, -0.98 + details() * 2.41, i % 3 === 0 ? pink : cyan, 0.027 + details() * 0.025, 0.31);
  }
  const emitter = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.13, 0.18, 32), tankMaterial);
  emitter.position.y = 0.27;
  holo.add(emitter);
  const rings = [0.61, 0.82, 1.06, 1.27].map((radius, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 2 ? 0.024 : 0.012, 5, 44), projectionMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.39 + index * 0.16;
    holo.add(ring);
    return ring;
  });
  for (let i = 0; i < 36; i++) {
    const angle = Math.PI * 2 * i / 36;
    addSplat(5.18 + Math.cos(angle) * 1.055, 11.52, -5.42 + Math.sin(angle) * 1.055, 0.13, 0.06, 0.13, cyan, 0.33);
  }
  const projector = new THREE.Mesh(
    new THREE.CylinderGeometry(1.53, 0.78, 1.91, 32, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 tex; void main() { tex = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 tex; void main() { float striation = pow(max(0.0, sin(tex.x * 201.06)), 12.0); float fade = 1.0 - smoothstep(0.0, 1.0, tex.y); gl_FragColor = vec4(0.11, 0.68, 1.0, (0.019 + striation * 0.025) * fade); }`,
    }),
  );
  projector.position.y = 1.29;
  holo.add(projector);

  const materials: Record<Paint, THREE.Material> = {
    wall: new THREE.MeshStandardMaterial({ roughness: 0.81, metalness: 0.14 }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.66, metalness: 0.31 }),
    glass: new THREE.MeshStandardMaterial({ roughness: 0.29, metalness: 0.49 }),
    light: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    street: new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.24 }),
    mark: new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.09, emissive: 0x24232d, emissiveIntensity: 0.25 }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (const paint of Object.keys(batches) as Paint[]) {
    const list = batches[paint];
    const mesh = new THREE.InstancedMesh(unitBox, materials[paint], list.length);
    mesh.name = `City ${paint}`;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      object.position.set(item.x, item.y, item.z);
      object.scale.set(item.w, item.h, item.d);
      object.rotation.set(0, item.ry, 0);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.setHex(item.color).multiplyScalar(item.power));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    city.add(mesh);
  }

  const signTexture = new THREE.TextureLoader().load(signAtlasUrl);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  signTexture.anisotropy = 8;
  const signGeometry = new THREE.BufferGeometry();
  signGeometry.setAttribute('position', new THREE.Float32BufferAttribute(signVertices, 3));
  signGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(signUvs, 2));
  const signs = new THREE.Mesh(signGeometry, new THREE.MeshBasicMaterial({ map: signTexture, color: new THREE.Color(1.21, 1.21, 1.21), side: THREE.DoubleSide }));
  signs.name = 'Japanese neon and illuminated signs';
  city.add(signs);

  const puddleGeometry = new THREE.PlaneGeometry(1, 1);
  const tints = new Float32Array(reflections.length * 3);
  const weights = new Float32Array(reflections.length * 2);
  const puddleMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 tint;
      attribute vec2 weight;
      varying vec3 vTint;
      varying vec2 tex;
      varying vec2 vWeight;
      void main() {
        tex = uv;
        vTint = tint;
        vWeight = weight;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vTint;
      varying vec2 tex;
      varying vec2 vWeight;
      void main() {
        vec2 centered = abs(tex * 2.0 - 1.0);
        float edge = 1.0 - smoothstep(0.24, 1.0, length(centered * vec2(1.25, 0.94)));
        float ripple = 0.68 + 0.27 * sin(92.0 * tex.y + 3.9 * tex.x + vWeight.y * 73.0 + time * 1.65);
        float streak = 0.80 + 0.19 * sin(29.0 * tex.x - 10.0 * tex.y + vWeight.y * 23.0);
        float alpha = edge * ripple * streak * vWeight.x;
        gl_FragColor = vec4(vTint, alpha);
      }
    `,
  });
  const puddles = new THREE.InstancedMesh(puddleGeometry, puddleMaterial, reflections.length);
  puddles.name = 'Broken pools of neon reflection';
  const turns = new THREE.Quaternion();
  const ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < reflections.length; i++) {
    const patch = reflections[i];
    const reach = Math.max(Math.abs(patch.x), Math.abs(patch.z));
    object.position.set(patch.x, reach < 9.04 || reach > 13.03 ? 0.146 : 0.041, patch.z);
    object.scale.set(patch.w, patch.d, 1);
    object.quaternion.copy(turns.setFromAxisAngle(up, patch.angle)).multiply(ground);
    object.updateMatrix();
    puddles.setMatrixAt(i, object.matrix);
    color.setHex(patch.color);
    tints.set([color.r, color.g, color.b], i * 3);
    weights.set([patch.opacity, patch.seed], i * 2);
  }
  puddleGeometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tints, 3));
  puddleGeometry.setAttribute('weight', new THREE.InstancedBufferAttribute(weights, 2));
  puddles.instanceMatrix.needsUpdate = true;
  puddles.computeBoundingSphere();
  puddles.renderOrder = 1;
  city.add(puddles);

  return {
    update(t: number) {
      puddleMaterial.uniforms.time.value = t;
      const scan = 1.16 + 0.055 * Math.sin(t * 2.7) + 0.025 * Math.sin(t * 5.2);
      signs.material.color.setScalar(scan);
      projectionMaterial.opacity = 0.52 + 0.15 * Math.sin(t * 2.33);
      for (let i = 0; i < rings.length; i++) {
        const pace = 0.72 + i * 0.16;
        const pulse = Math.sin(t * pace + i * 0.8);
        rings[i].scale.set(1 + pulse * 0.115, 1 + pulse * 0.115, 1);
        rings[i].position.y = 0.39 + i * 0.16 + pulse * 0.055;
      }
      projector.rotation.y = t * 0.23;
    },
  };
}
