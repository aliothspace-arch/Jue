import * as THREE from 'three';

export interface ProceduralPBRSet {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

export interface TextureLibrary {
  wood: ProceduralPBRSet;
  stone: ProceduralPBRSet;
  glass: ProceduralPBRSet;
  slate: ProceduralPBRSet;
  iron: ProceduralPBRSet;
  grass: ProceduralPBRSet;
  dirt: ProceduralPBRSet;
  slingshotWood: ProceduralPBRSet;
  leather: ProceduralPBRSet;
  bark: ProceduralPBRSet;
  pineNeedles: ProceduralPBRSet;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function hash2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number) => (period > 0 ? ((n % period) + period) % period : n);
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = hash2d(x0, y0, seed);
  const b = hash2d(x1, y0, seed);
  const c = hash2d(x0, y1, seed);
  const d = hash2d(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves = 4, basePeriod = 0): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const p = basePeriod > 0 ? Math.round(basePeriod * freq) : 0;
    val += amp * smoothNoise(x * freq, y * freq, seed + i * 19, p);
    freq *= 2;
    amp *= 0.5;
  }
  return val;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a tileable tangent-space normal map using a 3x3 Sobel filter
 * over a normalized height buffer [0..1].
 */
function buildNormalCanvasFromHeight(
  heightBuf: Float32Array,
  size: number,
  strength: number,
): HTMLCanvasElement {
  const [cNrm, ctxNrm] = makeCanvas(size);
  const imgNrm = ctxNrm.createImageData(size, size);

  const sampleH = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heightBuf[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;

      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      imgNrm.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      imgNrm.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      imgNrm.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      imgNrm.data[idx + 3] = 255;
    }
  }

  ctxNrm.putImageData(imgNrm, 0, 0);
  return cNrm;
}

function finalizePBRSet(
  cCol: HTMLCanvasElement,
  cRgh: HTMLCanvasElement,
  cBmp: HTMLCanvasElement,
  heightBuf: Float32Array,
  size: number,
  normalStrength: number,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1,
): ProceduralPBRSet {
  const cNrm = buildNormalCanvasFromHeight(heightBuf, size, normalStrength);
  return {
    map: configureTexture(cCol, true, maxAniso, repeatX, repeatY),
    roughnessMap: configureTexture(cRgh, false, maxAniso, repeatX, repeatY),
    bumpMap: configureTexture(cBmp, false, maxAniso, repeatX, repeatY),
    normalMap: configureTexture(cNrm, false, maxAniso, repeatX, repeatY),
  };
}

function generateWoodSet(
  size: number,
  maxAniso: number,
  baseR: number,
  baseG: number,
  baseB: number,
  seed: number,
): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  const knots = [
    { x: size * 0.24, y: size * 0.36, r: size * 0.068 },
    { x: size * 0.72, y: size * 0.68, r: size * 0.055 },
    { x: size * 0.52, y: size * 0.14, r: size * 0.044 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      // 4 distinct weathered oak planks with per-plank tonal & vertical shift
      const plankIdx = Math.floor(ny * 4);
      const plankLocalY = (ny * 4) % 1;
      const plankRand = hash2d(plankIdx * 13.7, seed, 71);
      const xShift = plankRand * 0.85;

      // Deep beveled chamfer seam between boards + end-butt joint
      const seamDist = Math.min(plankLocalY, 1 - plankLocalY);
      const seamMask = seamDist < 0.024 ? 0.26 + (seamDist / 0.024) * 0.74 : 1.0;
      const buttX = ((nx + plankIdx * 0.37) % 1);
      const buttMask = Math.abs(buttX - 0.5) < 0.007 ? 0.48 : 1.0;

      let warp = fbm((nx + xShift) * 5, ny * 16, seed, 4) * 0.38;
      let knotDark = 1.0;
      for (const k of knots) {
        const dx = x - k.x;
        const dy = (y - k.y) * 0.42;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < k.r * 2.8) {
          const g = Math.exp((-d * d) / (k.r * k.r));
          warp += g * 1.65;
          knotDark *= 1.0 - g * 0.34;
        }
      }

      // Authentic cathedral rings + fine fibrous adze-hewn streaks + weathering checks
      const ringVal = Math.sin(((nx + xShift) * 18 + warp * 5.2) * Math.PI * 2) * 0.5 + 0.5;
      const fineFiber = fbm(nx * 64, ny * 12, seed + 5, 3);
      const weatherCheck = fbm(nx * 28, ny * 6, seed + 23, 3);
      const checkGroove = weatherCheck < 0.27 ? 0.62 : 1.0;
      const weatherVar = 0.86 + plankRand * 0.22 + (fbm(nx * 4, ny * 4, seed + 41, 3) - 0.5) * 0.16;

      // Subtle iron-tannin darkening near plank joints
      const jointStain = seamDist < 0.07 ? 0.88 + (seamDist / 0.07) * 0.12 : 1.0;

      const shade =
        (0.64 + ringVal * 0.30 + (fineFiber - 0.5) * 0.18) *
        weatherVar *
        seamMask *
        buttMask *
        knotDark *
        checkGroove *
        jointStain;

      imgCol.data[idx] = Math.min(255, Math.max(0, Math.round(baseR * shade)));
      imgCol.data[idx + 1] = Math.min(255, Math.max(0, Math.round(baseG * shade * 0.96)));
      imgCol.data[idx + 2] = Math.min(255, Math.max(0, Math.round(baseB * shade * 0.9)));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round(
        Math.min(
          0.98,
          0.62 + (1 - ringVal) * 0.18 + (1 - seamMask) * 0.28 + (1 - checkGroove) * 0.2,
        ) * 255,
      );
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = rVal;
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(
        1,
        Math.max(
          0,
          (0.42 + ringVal * 0.32 + (fineFiber - 0.5) * 0.24) * seamMask * buttMask * checkGroove,
        ),
      );
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 3.1, maxAniso);
}

function generateBarkSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const ridge = Math.abs(fbm(nx * 14, ny * 4, 241, 4, 14) - 0.5) * 2.0;
      const plates = fbm(nx * 24, ny * 9, 263, 3, 24);
      const lichen = fbm(nx * 8, ny * 8, 281, 3, 8);
      const mossMix = Math.max(0, lichen - 0.62) * 2.2;

      const hVal = Math.min(1, Math.max(0, ridge * 0.65 + plates * 0.35));
      heightBuf[y * size + x] = hVal;

      const shade = 0.45 + hVal * 0.62;
      const r = 92 * shade * (1 - mossMix) + 68 * mossMix;
      const g = 66 * shade * (1 - mossMix) + 92 * mossMix;
      const b = 46 * shade * (1 - mossMix) + 46 * mossMix;

      imgCol.data[idx] = Math.min(255, Math.round(r));
      imgCol.data[idx + 1] = Math.min(255, Math.round(g));
      imgCol.data[idx + 2] = Math.min(255, Math.round(b));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round((0.84 + (1 - hVal) * 0.14) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 3.4, maxAniso, 1, 2);
}

function generatePineNeedlesSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const cluster = fbm(nx * 10, ny * 10, 311, 4, 10);
      const needles = fbm(nx * 44, ny * 22, 331, 3, 44);
      const streak = Math.sin((nx * 36 + needles * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const hVal = Math.min(1, Math.max(0, cluster * 0.45 + needles * 0.35 + streak * 0.2));
      heightBuf[y * size + x] = hVal;

      const tip = Math.max(0, hVal - 0.55) * 1.1;
      imgCol.data[idx] = Math.min(255, Math.round(28 + cluster * 24 + tip * 32));
      imgCol.data[idx + 1] = Math.min(255, Math.round(58 + cluster * 38 + tip * 42));
      imgCol.data[idx + 2] = Math.min(255, Math.round(24 + cluster * 18 + tip * 14));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round((0.76 + (1 - hVal) * 0.18) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 2.8, maxAniso, 2, 2);
}

function generateStoneSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  // Authentic medieval coursed alpine ashlar masonry (5 courses x 3 staggered blocks)
  const rows = 5;
  const cols = 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      // Subtle hand-hewn organic wobble on mortar lines
      const wobbleU = (fbm(nx * 10, ny * 10, 31, 3, 10) - 0.5) * 0.022;
      const wobbleV = (fbm(nx * 10, ny * 10, 53, 3, 10) - 0.5) * 0.018;

      const wy = ((ny + wobbleV) % 1 + 1) % 1;
      const row = Math.floor(wy * rows);
      const rowFrac = (wy * rows) % 1;

      const stagger = (row % 2) * 0.5 + (row === 2 ? 0.16 : 0);
      const wx = ((nx + stagger / cols + wobbleU) % 1 + 1) % 1;
      const col = Math.floor(wx * cols);
      const colFrac = (wx * cols) % 1;

      // Per-ashlar-block mineral identity (warm alpine limestone + cool granite variation)
      const blockTone = hash2d(col + 17, row + 29, 137);
      const blockWarm = hash2d(col + 43, row + 11, 211);

      const dHoriz = Math.min(rowFrac, 1 - rowFrac);
      const dVert = Math.min(colFrac, 1 - colFrac) * (rows / cols);
      const edgeD = Math.min(dHoriz, dVert);

      // Recessed lime mortar joint + hand-chiseled beveled ashlar edge
      const mortarWidth = 0.048;
      const bevelWidth = 0.14;
      const isMortar = edgeD < mortarWidth;
      const bevelFactor = isMortar
        ? 0.0
        : Math.min(1.0, (edgeD - mortarWidth) / (bevelWidth - mortarWidth));

      const macro = fbm(nx * 6, ny * 6, 11, 4, 6);
      const grit = fbm(nx * 36, ny * 36, 47, 3, 36);
      const chisel = Math.sin((nx * 54 + ny * 18 + macro * 2.5) * Math.PI) * 0.5 + 0.5;
      const pores = hash2d(x, y, 91) > 0.96 ? 0.65 : 1.0;
      const crackNoise = Math.abs(fbm(nx * 12, ny * 12, 77, 3, 12) - 0.5);
      const crack = crackNoise < 0.016 ? 0.55 : 1.0;

      // Subtle olive moss/lichen flecks tucked into weathered crevices
      const mossNoise = fbm(nx * 14, ny * 14, 307, 3, 14);
      const creviceMoss =
        Math.max(0, mossNoise - 0.58) * (isMortar ? 1.8 : 0.45 * (1 - bevelFactor));

      let r: number;
      let g: number;
      let b: number;
      let hVal: number;
      let rough: number;

      if (isMortar) {
        // Warm recessed lime mortar
        const mLum = 0.48 + grit * 0.2;
        r = 128 * mLum;
        g = 122 * mLum;
        b = 112 * mLum;
        hVal = 0.12 + grit * 0.14;
        rough = 0.95;
      } else {
        // Dressed alpine granite-limestone face
        const faceLum =
          (0.62 + blockTone * 0.24 + (macro - 0.5) * 0.18 + (grit - 0.5) * 0.16 + chisel * 0.05) *
          (0.76 + bevelFactor * 0.24) *
          pores *
          crack;
        const warmShift = (blockWarm - 0.5) * 18;
        r = (164 + warmShift) * faceLum;
        g = (159 + warmShift * 0.72) * faceLum;
        b = (149 - warmShift * 0.35) * faceLum;
        hVal = Math.min(
          1,
          Math.max(0.24, (0.34 + bevelFactor * 0.44 + grit * 0.18 + chisel * 0.06) * pores * crack),
        );
        rough = Math.min(0.95, 0.72 + (1 - macro) * 0.18 + (1 - bevelFactor) * 0.12);
      }

      if (creviceMoss > 0.02) {
        const mm = Math.min(0.75, creviceMoss);
        r = r * (1 - mm) + 58 * mm;
        g = g * (1 - mm) + 84 * mm;
        b = b * (1 - mm) + 42 * mm;
        rough = Math.min(0.98, rough + mm * 0.15);
      }

      imgCol.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
      imgCol.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      imgCol.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round(rough * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 4.2, maxAniso);
}

function generateGlassSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      // Subtle leaded diamond quarry pattern + hand-blown medieval crown glass waviness
      const d1 = Math.abs((((nx + ny) * 3.0) % 1 + 1) % 1 - 0.5);
      const d2 = Math.abs((((nx - ny) * 3.0) % 1 + 1) % 1 - 0.5);
      const leadLine = d1 < 0.028 || d2 < 0.028 ? 1.0 : 0.0;
      const bevelHalo = !leadLine && (d1 < 0.065 || d2 < 0.065) ? 1.0 : 0.0;

      const wave = fbm(nx * 8, ny * 8, 123, 3, 8);
      const dust = fbm(nx * 22, ny * 22, 167, 3, 22);
      const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
      const edgeDust = edgeDist < 0.1 ? (0.1 - edgeDist) * 4.5 : 0;

      if (leadLine > 0.5) {
        // Dark weathered lead came strip
        imgCol.data[idx] = 52;
        imgCol.data[idx + 1] = 58;
        imgCol.data[idx + 2] = 64;
        imgCol.data[idx + 3] = 255;

        imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = 135;
        imgRgh.data[idx + 3] = 255;

        heightBuf[y * size + x] = 0.92;
        imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = 235;
        imgBmp.data[idx + 3] = 255;
      } else {
        // Subtle natural greenish-crystal alpine glass (never neon cyan)
        const baseR = 205 + wave * 20 + bevelHalo * 18 + edgeDust * 12;
        const baseG = 224 + wave * 16 + bevelHalo * 16 + edgeDust * 10;
        const baseB = 228 + wave * 14 + bevelHalo * 14 + edgeDust * 6;
        imgCol.data[idx] = Math.min(255, Math.round(baseR));
        imgCol.data[idx + 1] = Math.min(255, Math.round(baseG));
        imgCol.data[idx + 2] = Math.min(255, Math.round(baseB));
        imgCol.data[idx + 3] = 255;

        const rVal = Math.round(
          Math.min(0.45, 0.045 + dust * 0.075 + edgeDust * 0.22 + bevelHalo * 0.08) * 255,
        );
        imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = rVal;
        imgRgh.data[idx + 3] = 255;

        const hVal = Math.min(1, Math.max(0, 0.45 + (wave - 0.5) * 0.22 + bevelHalo * 0.18));
        heightBuf[y * size + x] = hVal;
        const bVal = Math.round(hVal * 255);
        imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
        imgBmp.data[idx + 3] = 255;
      }
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 1.8, maxAniso);
}

function generateSlateRoofSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  const rows = 8;
  const cols = 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const row = Math.floor(ny * rows);
      const rowFrac = (ny * rows) % 1;
      const shiftX = (nx + (row % 2) * (0.5 / cols)) % 1;
      const col = Math.floor(shiftX * cols);
      const colFrac = (shiftX * cols) % 1;

      const tileTone = hash2d(col + 31, row + 17, 409);
      const grain = fbm(nx * 28, ny * 18, 421, 3, 28);
      const moss = fbm(nx * 10, ny * 10, 443, 3, 10);

      const bottomEdge = rowFrac < 0.08 ? rowFrac / 0.08 : 1.0;
      const sideSeam = Math.min(colFrac, 1 - colFrac) < 0.04 ? 0.35 : 1.0;
      const overlapShadow = rowFrac > 0.88 ? 0.72 : 1.0;

      // Alpine dark blue-charcoal slate with subtle lichen specks
      const lum = (0.42 + tileTone * 0.28 + (grain - 0.5) * 0.14) * bottomEdge * sideSeam * overlapShadow;
      let r = 92 * lum;
      let g = 100 * lum;
      let b = 112 * lum;

      const mossPatch = Math.max(0, moss - 0.64) * 2.1;
      if (mossPatch > 0.02) {
        const m = Math.min(0.65, mossPatch);
        r = r * (1 - m) + 64 * m;
        g = g * (1 - m) + 88 * m;
        b = b * (1 - m) + 46 * m;
      }

      imgCol.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
      imgCol.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      imgCol.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      imgCol.data[idx + 3] = 255;

      const rough = Math.min(0.95, 0.58 + (1 - tileTone) * 0.18 + mossPatch * 0.25);
      const rVal = Math.round(rough * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = rVal;
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, (0.28 + (1 - rowFrac) * 0.55 + grain * 0.14) * sideSeam));
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 3.6, maxAniso, 2, 2);
}

function generateForgedIronSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const hammer = fbm(nx * 18, ny * 18, 503, 4, 18);
      const patina = fbm(nx * 8, ny * 8, 521, 3, 8);
      const rustMix = Math.max(0, patina - 0.62) * 1.9;

      const base = 52 + hammer * 34;
      const r = base * (1 - rustMix) + 116 * rustMix;
      const g = (base + 2) * (1 - rustMix) + 64 * rustMix;
      const b = (base + 6) * (1 - rustMix) + 38 * rustMix;

      imgCol.data[idx] = Math.min(255, Math.round(r));
      imgCol.data[idx + 1] = Math.min(255, Math.round(g));
      imgCol.data[idx + 2] = Math.min(255, Math.round(b));
      imgCol.data[idx + 3] = 255;

      const rough = Math.min(0.92, 0.34 + (1 - hammer) * 0.22 + rustMix * 0.42);
      const rVal = Math.round(rough * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = rVal;
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, 0.35 + hammer * 0.55));
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 2.5, maxAniso);
}

function generateGrassSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const patch = fbm(nx * 4, ny * 4, 31, 4, 4);
      const blade = fbm(nx * 36, ny * 36, 67, 3, 36);
      const clover = fbm(nx * 14, ny * 14, 199, 3, 14);
      const soilMix = Math.max(0, 0.36 - patch) * 1.45;
      const dryTip = Math.max(0, clover - 0.62) * 1.3;

      const r = (48 + blade * 28 + dryTip * 52) * (1 - soilMix) + 88 * soilMix;
      const g = (88 + patch * 38 + blade * 22 + dryTip * 20) * (1 - soilMix) + 70 * soilMix;
      const b = (30 + blade * 12) * (1 - soilMix) + 42 * soilMix;

      imgCol.data[idx] = Math.min(255, Math.round(r));
      imgCol.data[idx + 1] = Math.min(255, Math.round(g));
      imgCol.data[idx + 2] = Math.min(255, Math.round(b));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round((0.82 + (1 - blade) * 0.14) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, 0.3 + blade * 0.55 + clover * 0.15));
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 2.5, maxAniso, 18, 18);
}

function generateDirtSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const earth = fbm(nx * 6, ny * 6, 103, 4, 6);
      const grit = fbm(nx * 28, ny * 28, 151, 3, 28);
      // Subtle wheel rut compaction along Z edges of path
      const rut = Math.exp(-Math.pow((ny - 0.25) * 6, 2)) + Math.exp(-Math.pow((ny - 0.75) * 6, 2));
      const pebbleNoise = smoothNoise(nx * 44, ny * 44, 179, 44);
      const pebble = pebbleNoise > 0.78 ? 1.2 : 1.0;
      const shade = (0.74 + earth * 0.28 + (grit - 0.5) * 0.18 - rut * 0.08) * pebble;

      imgCol.data[idx] = Math.min(255, Math.round(134 * shade));
      imgCol.data[idx + 1] = Math.min(255, Math.round(104 * shade));
      imgCol.data[idx + 2] = Math.min(255, Math.round(72 * shade));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round((0.84 + (1 - grit) * 0.14 - rut * 0.06) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, 0.35 + grit * 0.42 + (pebble > 1 ? 0.24 : 0) - rut * 0.1));
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 2.7, maxAniso, 8, 2);
}

function generateLeatherSet(size: number, maxAniso: number): ProceduralPBRSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cBmp, ctxBmp] = makeCanvas(size);

  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const imgBmp = ctxBmp.createImageData(size, size);
  const heightBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      const grain = fbm(nx * 28, ny * 28, 211, 3);
      const wear = fbm(nx * 6, ny * 6, 223, 3);
      const shade = 0.65 + grain * 0.25 + wear * 0.22;

      imgCol.data[idx] = Math.min(255, Math.round(92 * shade));
      imgCol.data[idx + 1] = Math.min(255, Math.round(54 * shade));
      imgCol.data[idx + 2] = Math.min(255, Math.round(34 * shade));
      imgCol.data[idx + 3] = 255;

      const rVal = Math.round((0.66 + (1 - wear) * 0.22) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rVal);
      imgRgh.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, 0.4 + grain * 0.5));
      heightBuf[y * size + x] = hVal;
      const bVal = Math.round(hVal * 255);
      imgBmp.data[idx] = imgBmp.data[idx + 1] = imgBmp.data[idx + 2] = bVal;
      imgBmp.data[idx + 3] = 255;
    }
  }

  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);
  ctxBmp.putImageData(imgBmp, 0, 0);

  return finalizePBRSet(cCol, cRgh, cBmp, heightBuf, size, 2.0, maxAniso);
}

function generateContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(10, 10, 8, 0.72)');
  grad.addColorStop(0.55, 'rgba(10, 10, 8, 0.28)');
  grad.addColorStop(1, 'rgba(10, 10, 8, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createTextureLibrary(renderer: THREE.WebGLRenderer): TextureLibrary {
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 1);
  // Rich weathered alpine oak, forged iron, slate & dressed ashlar granite at 512px with 16x anisotropy for razor-sharp near & medium detail
  const wood = generateWoodSet(512, maxAniso, 152, 108, 66, 17);
  const slingshotWood = generateWoodSet(512, maxAniso, 112, 62, 34, 53);
  const stone = generateStoneSet(512, maxAniso);
  const glass = generateGlassSet(512, maxAniso);
  const slate = generateSlateRoofSet(512, maxAniso);
  const iron = generateForgedIronSet(512, maxAniso);
  const grass = generateGrassSet(512, maxAniso);
  const dirt = generateDirtSet(512, maxAniso);
  const leather = generateLeatherSet(256, maxAniso);
  const bark = generateBarkSet(512, maxAniso);
  const pineNeedles = generatePineNeedlesSet(512, maxAniso);
  const contactShadow = generateContactShadowTexture();

  const allSets = [
    wood,
    slingshotWood,
    stone,
    glass,
    slate,
    iron,
    grass,
    dirt,
    leather,
    bark,
    pineNeedles,
  ];

  return {
    wood,
    stone,
    glass,
    slate,
    iron,
    grass,
    dirt,
    slingshotWood,
    leather,
    bark,
    pineNeedles,
    contactShadow,
    dispose: () => {
      for (const s of allSets) {
        s.map.dispose();
        s.roughnessMap.dispose();
        s.bumpMap.dispose();
        s.normalMap.dispose();
      }
      contactShadow.dispose();
    },
  };
}
