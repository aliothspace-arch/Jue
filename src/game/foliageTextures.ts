import * as THREE from 'three';

export interface FoliageAtlasSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  translucencyMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface TerrainLayerPBR {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  heightMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface EnvironmentTextures {
  pineBough: FoliageAtlasSet;
  fernFrond: FoliageAtlasSet;
  meadow: TerrainLayerPBR;
  dirt: TerrainLayerPBR;
  cliffRock: TerrainLayerPBR;
  forestDuff: TerrainLayerPBR;
  bark: TerrainLayerPBR;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return [canvas, ctx];
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function periodicSmoothNoise(x: number, y: number, seed: number, period: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (n: number) => ((n % period) + period) % period;
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function periodicFbm(x: number, y: number, seed: number, octaves: number, basePeriod: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * periodicSmoothNoise(x * freq, y * freq, seed + i * 29, Math.round(basePeriod * freq));
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return val / norm;
}

function periodicVoronoi(x: number, y: number, seed: number, period: number): [number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let d1 = 9;
  let d2 = 9;
  let cellId = 0;
  const wrap = (n: number) => ((n % period) + period) % period;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = wrap(ix + ox);
      const cy = wrap(iy + oy);
      const px = ox + hash2(cx, cy, seed) - fx;
      const py = oy + hash2(cx, cy, seed + 19) - fy;
      const d = px * px + py * py;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        cellId = hash2(cx, cy, seed + 71);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  const sd1 = Math.sqrt(d1);
  const sd2 = Math.sqrt(d2);
  return [sd1, sd2 - sd1, cellId];
}

function configTex(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAniso: number,
  wrapMode: THREE.Wrapping = THREE.RepeatWrapping,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = wrapMode;
  tex.wrapT = wrapMode;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAniso;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildNormalFromHeight(
  heightBuf: Float32Array,
  size: number,
  strength: number,
  tileable: boolean,
): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const sample = (x: number, y: number) => {
    const sx = tileable ? ((x % size) + size) % size : Math.min(size - 1, Math.max(0, x));
    const sy = tileable ? ((y % size) + size) % size : Math.min(size - 1, Math.max(0, y));
    return heightBuf[sy * size + sx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;

      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Dilates RGB colors into transparent neighbors so mipmaps NEVER bleed black fringes
 * around alpha-tested foliage needles and fern leaflets.
 */
function dilateAlphaEdgeColors(ctx: CanvasRenderingContext2D, size: number, passes = 5): void {
  const img = ctx.getImageData(0, 0, size, size);
  const src = new Uint8ClampedArray(img.data);
  const dst = new Uint8ClampedArray(img.data);

  for (let pass = 0; pass < passes; pass++) {
    src.set(dst);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (src[idx + 3] > 20) continue;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= size) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= size) continue;
            const nIdx = (ny * size + nx) * 4;
            if (src[nIdx + 3] > 20 || (pass > 0 && (src[nIdx] + src[nIdx + 1] + src[nIdx + 2] > 0))) {
              rSum += src[nIdx];
              gSum += src[nIdx + 1];
              bSum += src[nIdx + 2];
              count++;
            }
          }
        }
        if (count > 0) {
          dst[idx] = Math.round(rSum / count);
          dst[idx + 1] = Math.round(gSum / count);
          dst[idx + 2] = Math.round(bSum / count);
        }
      }
    }
  }

  // Restore original crisp alpha while keeping dilated RGB
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = dst[i];
    img.data[i + 1] = dst[i + 1];
    img.data[i + 2] = dst[i + 2];
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Generates a high-resolution botanical Conifer / Alpine Spruce bough atlas (512x512):
 * woody central stem + branching lateral twigs + ~700 individual pine needles
 * with natural depth layering, waxy needle roughness, normal map, and backlit translucency.
 */
function generatePineBoughAtlas(size: number, maxAniso: number): FoliageAtlasSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cTrn, ctxTrn] = makeCanvas(size);
  const [cHgt, ctxHgt] = makeCanvas(size);

  ctxCol.clearRect(0, 0, size, size);
  ctxRgh.fillStyle = 'rgb(236,236,236)';
  ctxRgh.fillRect(0, 0, size, size);
  ctxTrn.fillStyle = 'rgb(0,0,0)';
  ctxTrn.fillRect(0, 0, size, size);
  ctxHgt.fillStyle = 'rgb(0,0,0)';
  ctxHgt.fillRect(0, 0, size, size);

  let rng = 918273;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  // Draws crisp, finely separated serrated conifer needle clusters along a shootlet
  const drawNeedleFan = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    density: number,
    needleLen: number,
    widthPx: number,
    depthShade: number,
  ) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const baseAngle = Math.atan2(dy, dx);

    for (let i = 0; i < density; i++) {
      const t = i / Math.max(1, density - 1);
      const px = x0 + dx * t + (rand() - 0.5) * 2.0;
      const py = y0 + dy * t + (rand() - 0.5) * 2.0;
      const tipFactor = Math.sin(Math.min(1, t * 1.04) * Math.PI * 0.88 + 0.12);

      for (const side of [-1, 1]) {
        const spread = side * (0.36 + rand() * 0.58) * (1.0 - t * 0.34);
        const ang = baseAngle + spread;
        const len = needleLen * (0.48 + 0.62 * tipFactor) * (0.72 + rand() * 0.52);
        const ex = px + Math.cos(ang) * len;
        const ey = py + Math.sin(ang) * len;
        const mx = (px + ex) * 0.5 + Math.cos(ang + side * 0.45) * len * 0.06;
        const my = (py + ey) * 0.5 + Math.sin(ang + side * 0.45) * len * 0.06;

        // Deep rich alpine spruce & Douglas fir palette (zero pale chalkiness!)
        const sunTip = t * 0.55 + rand() * 0.32;
        const r = Math.round((15 + sunTip * 28) * depthShade);
        const g = Math.round((38 + sunTip * 46) * depthShade);
        const b = Math.round((16 + (1 - sunTip) * 10 + sunTip * 9) * depthShade);

        const grad = ctxCol.createLinearGradient(px, py, ex, ey);
        grad.addColorStop(0, `rgb(${Math.max(8, r - 9)}, ${Math.max(20, g - 16)}, ${Math.max(8, b - 7)})`);
        grad.addColorStop(1, `rgb(${Math.min(115, r + 14)}, ${Math.min(138, g + 20)}, ${Math.min(68, b + 6)})`);

        ctxCol.strokeStyle = grad;
        ctxCol.lineWidth = widthPx * (0.78 + rand() * 0.42);
        ctxCol.lineCap = 'round';
        ctxCol.beginPath();
        ctxCol.moveTo(px, py);
        ctxCol.quadraticCurveTo(mx, my, ex, ey);
        ctxCol.stroke();

        // Matte-waxy needle cuticle (0.85..0.96 so needles never glare chalky white!)
        const rVal = Math.round(218 + (1 - sunTip) * 24 + rand() * 10);
        ctxRgh.strokeStyle = `rgb(${rVal},${rVal},${rVal})`;
        ctxRgh.lineWidth = widthPx * 1.1;
        ctxRgh.lineCap = 'round';
        ctxRgh.beginPath();
        ctxRgh.moveTo(px, py);
        ctxRgh.quadraticCurveTo(mx, my, ex, ey);
        ctxRgh.stroke();

        // Backlit translucency focused on fine outer needle tips
        const trVal = Math.round((95 + sunTip * 135) * (0.65 + 0.35 * depthShade));
        ctxTrn.strokeStyle = `rgb(${trVal},${trVal},${trVal})`;
        ctxTrn.lineWidth = widthPx;
        ctxTrn.lineCap = 'round';
        ctxTrn.beginPath();
        ctxTrn.moveTo(px, py);
        ctxTrn.quadraticCurveTo(mx, my, ex, ey);
        ctxTrn.stroke();

        // Height for crisp needle-bundle normal relief
        const hVal = Math.round(85 + depthShade * 125 + sunTip * 35);
        ctxHgt.strokeStyle = `rgb(${hVal},${hVal},${hVal})`;
        ctxHgt.lineWidth = widthPx * 1.15;
        ctxHgt.lineCap = 'round';
        ctxHgt.beginPath();
        ctxHgt.moveTo(px, py);
        ctxHgt.quadraticCurveTo(mx, my, ex, ey);
        ctxHgt.stroke();
      }
    }
  };

  const drawTwig = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) => {
    const grad = ctxCol.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, '#362417');
    grad.addColorStop(1, '#4c3420');
    ctxCol.strokeStyle = grad;
    ctxCol.lineWidth = (w0 + w1) * 0.5;
    ctxCol.lineCap = 'round';
    ctxCol.beginPath();
    ctxCol.moveTo(x0, y0);
    ctxCol.lineTo(x1, y1);
    ctxCol.stroke();

    ctxRgh.strokeStyle = 'rgb(240,240,240)';
    ctxRgh.lineWidth = (w0 + w1) * 0.55;
    ctxRgh.beginPath();
    ctxRgh.moveTo(x0, y0);
    ctxRgh.lineTo(x1, y1);
    ctxRgh.stroke();

    ctxTrn.strokeStyle = 'rgb(16,16,16)';
    ctxTrn.lineWidth = (w0 + w1) * 0.55;
    ctxTrn.beginPath();
    ctxTrn.moveTo(x0, y0);
    ctxTrn.lineTo(x1, y1);
    ctxTrn.stroke();

    ctxHgt.strokeStyle = 'rgb(225,225,225)';
    ctxHgt.lineWidth = (w0 + w1) * 0.6;
    ctxHgt.beginPath();
    ctxHgt.moveTo(x0, y0);
    ctxHgt.lineTo(x1, y1);
    ctxHgt.stroke();
  };

  // Main bough skeleton: root at bottom center (0.5, 0.96) -> feathery forked spire at top (0.5, 0.07)
  const cx = size * 0.5;
  const yStart = size * 0.96;
  const yEnd = size * 0.07;

  // Distinct asymmetric spruce lateral shoots with open airy negative space between shoots
  const sideBranches: Array<[number, number, number, number]> = [
    [0.12, -1, 0.36, -0.84],
    [0.19, 1, 0.37, 0.80],
    [0.31, -1, 0.40, -0.72],
    [0.39, 1, 0.39, 0.68],
    [0.52, -1, 0.36, -0.60],
    [0.59, 1, 0.34, 0.56],
    [0.71, -1, 0.28, -0.48],
    [0.77, 1, 0.26, 0.45],
    [0.86, -1, 0.19, -0.36],
    [0.89, 1, 0.18, 0.34],
  ];

  // Pass 1: deep shadowed under-needles on sub-shoots (thin crisp needles -> genuine jagged conifer outline!)
  for (const [t, side, lenN, angOff] of sideBranches) {
    const bx = cx + (rand() - 0.5) * size * 0.014;
    const by = yStart + (yEnd - yStart) * t;
    const ang = -Math.PI * 0.5 + angOff;
    const ex = bx + Math.cos(ang) * lenN * size;
    const ey = by + Math.sin(ang) * lenN * size;
    drawNeedleFan(bx, by, ex, ey, 22, size * 0.068, size * 0.0044, 0.68);

    // Forked tertiary shootlet (creates authentic multi-fingered pine silhouette)
    const mx = (bx + ex) * 0.46;
    const my = (by + ey) * 0.46;
    const subAng = ang + side * 0.42;
    const sx = mx + Math.cos(subAng) * lenN * size * 0.54;
    const sy = my + Math.sin(subAng) * lenN * size * 0.54;
    drawNeedleFan(mx, my, sx, sy, 14, size * 0.056, size * 0.0038, 0.74);
  }

  // Pass 2: dark woody central spine & lateral twigs
  drawTwig(cx, yStart, cx, yEnd + size * 0.05, size * 0.018, size * 0.005);
  for (const [t, side, lenN, angOff] of sideBranches) {
    const bx = cx;
    const by = yStart + (yEnd - yStart) * t;
    const ang = -Math.PI * 0.5 + angOff;
    const ex = bx + Math.cos(ang) * lenN * size * 0.86;
    const ey = by + Math.sin(ang) * lenN * size * 0.86;
    drawTwig(bx, by, ex, ey, size * 0.009 * (1.1 - t * 0.5), size * 0.003);
    const mx = (bx + ex) * 0.48;
    const my = (by + ey) * 0.48;
    const subAng = ang + side * 0.42;
    drawTwig(
      mx,
      my,
      mx + Math.cos(subAng) * lenN * size * 0.42,
      my + Math.sin(subAng) * lenN * size * 0.42,
      size * 0.005,
      size * 0.0025,
    );
  }

  // Pass 3: crisp sunlit foreground pine needles
  drawNeedleFan(cx, yStart - size * 0.06, cx, yEnd, 38, size * 0.072, size * 0.0042, 1.0);
  for (const [t, side, lenN, angOff] of sideBranches) {
    const bx = cx;
    const by = yStart + (yEnd - yStart) * t;
    const ang = -Math.PI * 0.5 + angOff;
    const ex = bx + Math.cos(ang) * lenN * size;
    const ey = by + Math.sin(ang) * lenN * size;
    drawNeedleFan(bx, by, ex, ey, 24, size * 0.062, size * 0.0038, 0.96 + t * 0.14);
    const mx = (bx + ex) * 0.56;
    const my = (by + ey) * 0.56;
    const subAng = ang - side * 0.34;
    const sx = mx + Math.cos(subAng) * lenN * size * 0.48;
    const sy = my + Math.sin(subAng) * lenN * size * 0.48;
    drawNeedleFan(mx, my, sx, sy, 14, size * 0.052, size * 0.0035, 1.02 + t * 0.14);
  }

  dilateAlphaEdgeColors(ctxCol, size, 6);

  // Extract height buffer for Sobel normal map
  const hData = ctxHgt.getImageData(0, 0, size, size).data;
  const hBuf = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    hBuf[i] = hData[i * 4] / 255;
  }
  const cNrm = buildNormalFromHeight(hBuf, size, 2.6, false);

  const map = configTex(cCol, true, maxAniso, THREE.ClampToEdgeWrapping);
  const normalMap = configTex(cNrm, false, maxAniso, THREE.ClampToEdgeWrapping);
  const roughnessMap = configTex(cRgh, false, maxAniso, THREE.ClampToEdgeWrapping);
  const translucencyMap = configTex(cTrn, false, maxAniso, THREE.ClampToEdgeWrapping);

  return {
    map,
    normalMap,
    roughnessMap,
    translucencyMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      translucencyMap.dispose();
    },
  };
}

/**
 * Generates an alpine woodland fern frond atlas (256x256) with pinnate leaflets.
 */
function generateFernFrondAtlas(size: number, maxAniso: number): FoliageAtlasSet {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const [cTrn, ctxTrn] = makeCanvas(size);
  const [cHgt, ctxHgt] = makeCanvas(size);

  ctxCol.clearRect(0, 0, size, size);
  ctxRgh.fillStyle = 'rgb(165,165,165)';
  ctxRgh.fillRect(0, 0, size, size);
  ctxTrn.fillStyle = 'rgb(0,0,0)';
  ctxTrn.fillRect(0, 0, size, size);
  ctxHgt.fillStyle = 'rgb(0,0,0)';
  ctxHgt.fillRect(0, 0, size, size);

  const cx = size * 0.5;
  const y0 = size * 0.96;
  const y1 = size * 0.06;

  // Stem (rachis)
  ctxCol.strokeStyle = '#3d5e24';
  ctxCol.lineWidth = size * 0.018;
  ctxCol.lineCap = 'round';
  ctxCol.beginPath();
  ctxCol.moveTo(cx, y0);
  ctxCol.lineTo(cx, y1);
  ctxCol.stroke();

  const pairs = 15;
  for (let i = 0; i < pairs; i++) {
    const t = (i + 0.6) / (pairs + 0.5);
    const py = y0 + (y1 - y0) * t;
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const pinnaLen = size * (0.08 + 0.34 * env);

    for (const side of [-1, 1]) {
      const ang = -Math.PI * 0.5 + side * (1.22 - t * 0.42);
      const ex = cx + Math.cos(ang) * pinnaLen;
      const ey = py + Math.sin(ang) * pinnaLen;

      // Draw scalloped fern leaflets along pinna
      const subLobes = Math.max(3, Math.round(env * 8));
      for (let s = 0; s < subLobes; s++) {
        const st = (s + 0.5) / subLobes;
        const lx = cx + (ex - cx) * st;
        const ly = py + (ey - py) * st;
        const lobeR = size * 0.026 * (1 - st * 0.55) * (0.65 + 0.45 * env);

        const gCol = Math.round(92 + t * 44 + st * 22);
        const rCol = Math.round(46 + t * 28 + st * 14);
        const bCol = Math.round(24 + (1 - t) * 10);

        ctxCol.fillStyle = `rgb(${rCol},${gCol},${bCol})`;
        ctxCol.beginPath();
        ctxCol.ellipse(lx, ly, lobeR * 1.4, lobeR * 0.72, ang + side * 0.5, 0, Math.PI * 2);
        ctxCol.fill();

        const tr = Math.round(165 + st * 75);
        ctxTrn.fillStyle = `rgb(${tr},${tr},${tr})`;
        ctxTrn.beginPath();
        ctxTrn.ellipse(lx, ly, lobeR * 1.35, lobeR * 0.7, ang + side * 0.5, 0, Math.PI * 2);
        ctxTrn.fill();

        const hv = Math.round(135 + (1 - st) * 70);
        ctxHgt.fillStyle = `rgb(${hv},${hv},${hv})`;
        ctxHgt.beginPath();
        ctxHgt.ellipse(lx, ly, lobeR * 1.4, lobeR * 0.72, ang + side * 0.5, 0, Math.PI * 2);
        ctxHgt.fill();
      }
    }
  }

  dilateAlphaEdgeColors(ctxCol, size, 5);

  const hData = ctxHgt.getImageData(0, 0, size, size).data;
  const hBuf = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) hBuf[i] = hData[i * 4] / 255;
  const cNrm = buildNormalFromHeight(hBuf, size, 2.2, false);

  const map = configTex(cCol, true, maxAniso, THREE.ClampToEdgeWrapping);
  const normalMap = configTex(cNrm, false, maxAniso, THREE.ClampToEdgeWrapping);
  const roughnessMap = configTex(cRgh, false, maxAniso, THREE.ClampToEdgeWrapping);
  const translucencyMap = configTex(cTrn, false, maxAniso, THREE.ClampToEdgeWrapping);

  return {
    map,
    normalMap,
    roughnessMap,
    translucencyMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      translucencyMap.dispose();
    },
  };
}

function finalizeTerrainLayer(
  cCol: HTMLCanvasElement,
  cRgh: HTMLCanvasElement,
  heightBuf: Float32Array,
  size: number,
  normalStrength: number,
  maxAniso: number,
): TerrainLayerPBR {
  const [cHgt, ctxHgt] = makeCanvas(size);
  const imgH = ctxHgt.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.min(255, Math.max(0, Math.round(heightBuf[i] * 255)));
    imgH.data[i * 4] = v;
    imgH.data[i * 4 + 1] = v;
    imgH.data[i * 4 + 2] = v;
    imgH.data[i * 4 + 3] = 255;
  }
  ctxHgt.putImageData(imgH, 0, 0);
  const cNrm = buildNormalFromHeight(heightBuf, size, normalStrength, true);

  const map = configTex(cCol, true, maxAniso);
  const normalMap = configTex(cNrm, false, maxAniso);
  const roughnessMap = configTex(cRgh, false, maxAniso);
  const heightMap = configTex(cHgt, false, maxAniso);

  return {
    map,
    normalMap,
    roughnessMap,
    heightMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      heightMap.dispose();
    },
  };
}

/**
 * 512x512 High-detail alpine meadow turf: interwoven micro grass blades, soil pockets, clover, dry thatch.
 */
function generateMeadowLayer(size: number, maxAniso: number): TerrainLayerPBR {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;

      const macro = periodicFbm(nx * 4, ny * 4, 19, 4, 4);
      const tuft = periodicFbm(nx * 16, ny * 16, 53, 3, 16);
      // Anisotropic grass blade micro-strokes in two crossed orientations
      const bladeA = periodicFbm(nx * 56, ny * 18, 97, 3, 56);
      const bladeB = periodicFbm(nx * 20, ny * 54, 131, 3, 54);
      const blade = Math.max(bladeA, bladeB * 0.92);

      const soilMask = Math.max(0, 0.34 - macro * 0.82 - tuft * 0.25) * 2.4;
      const dryMask = Math.max(0, tuft - 0.62) * 1.65;

      // Deep natural photographic olive-emerald meadow greens
      const gR = 38 + blade * 28 + dryMask * 44;
      const gG = 62 + macro * 22 + blade * 28 + dryMask * 16;
      const gB = 20 + blade * 10 + macro * 6;

      const sR = 54 + blade * 16;
      const sG = 42 + blade * 12;
      const sB = 27 + blade * 8;

      const sm = Math.min(1, soilMask);
      imgCol.data[idx] = Math.min(255, Math.round(gR * (1 - sm) + sR * sm));
      imgCol.data[idx + 1] = Math.min(255, Math.round(gG * (1 - sm) + sG * sm));
      imgCol.data[idx + 2] = Math.min(255, Math.round(gB * (1 - sm) + sB * sm));
      imgCol.data[idx + 3] = 255;

      const hVal = Math.min(1, Math.max(0, (0.28 + blade * 0.56 + tuft * 0.16) * (1 - sm * 0.45)));
      hBuf[y * size + x] = hVal;

      const rgh = Math.round((0.84 + (1 - blade) * 0.12 + sm * 0.04) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rgh);
      imgRgh.data[idx + 3] = 255;
    }
  }
  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);

  return finalizeTerrainLayer(cCol, cRgh, hBuf, size, 3.1, maxAniso);
}

/**
 * 512x512 Compacted alpine clay & loam dirt trail with subtle muted river stones (no terrazzo noise).
 */
function generateDirtLayer(size: number, maxAniso: number): TerrainLayerPBR {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;

      const earth = periodicFbm(nx * 5, ny * 5, 223, 4, 5);
      const clay = periodicFbm(nx * 14, ny * 14, 241, 3, 14);
      const grit = periodicFbm(nx * 36, ny * 36, 269, 3, 36);
      const [vd1, vEdge, cellId] = periodicVoronoi(nx * 20, ny * 20, 313, 20);
      // Sparse natural earth-toned pebbles embedded in soil (only ~18% of cells)
      const pebbleMask = cellId > 0.80 ? Math.max(0, 1 - vd1 * 2.4) : 0;
      const pebbleEdge = Math.min(1, vEdge * 5.0);

      const pebbleHeight = pebbleMask * pebbleEdge * 0.34;
      const hVal = Math.min(1, Math.max(0, 0.28 + earth * 0.22 + clay * 0.2 + grit * 0.18 + pebbleHeight));
      hBuf[y * size + x] = hVal;

      const baseShade = 0.68 + earth * 0.24 + (clay - 0.5) * 0.18 + (grit - 0.5) * 0.14;
      let r = 104 * baseShade;
      let g = 78 * baseShade;
      let b = 52 * baseShade;

      if (pebbleMask > 0.06) {
        const pTone = 92 + cellId * 32;
        const mixP = Math.min(0.85, pebbleMask * 1.15);
        r = r * (1 - mixP) + pTone * mixP;
        g = g * (1 - mixP) + (pTone - 5) * mixP;
        b = b * (1 - mixP) + (pTone - 12) * mixP;
      }

      imgCol.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
      imgCol.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      imgCol.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      imgCol.data[idx + 3] = 255;

      const rgh = Math.round((0.90 - pebbleMask * 0.16 + (1 - grit) * 0.06) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, Math.max(150, rgh));
      imgRgh.data[idx + 3] = 255;
    }
  }
  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);

  return finalizeTerrainLayer(cCol, cRgh, hBuf, size, 3.0, maxAniso);
}

/**
 * 512x512 Angular Fractured Alpine Granite: Voronoi cleavage blocks, fine mineral grain, warm lichen.
 */
function generateCliffRockLayer(size: number, maxAniso: number): TerrainLayerPBR {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;

      const warpX = (periodicFbm(nx * 4, ny * 4, 401, 3, 4) - 0.5) * 0.18;
      const warpY = (periodicFbm(nx * 4, ny * 4, 419, 3, 4) - 0.5) * 0.18;
      const [, edge1, id1] = periodicVoronoi((nx + warpX) * 5, (ny + warpY) * 5, 439, 5);
      const [, edge2, id2] = periodicVoronoi((nx + warpY * 0.5) * 13, (ny + warpX * 0.5) * 13, 479, 13);
      const grit = periodicFbm(nx * 36, ny * 36, 521, 3, 36);
      const macroTone = periodicFbm(nx * 6, ny * 6, 547, 3, 6);

      const crackBig = Math.min(1, edge1 * 11.0);
      const crackFine = Math.min(1, edge2 * 8.5);
      const hVal = Math.min(
        1,
        Math.max(0, (0.32 + id1 * 0.24 + id2 * 0.14 + grit * 0.26) * (0.34 + 0.66 * crackBig) * (0.76 + 0.24 * crackFine)),
      );
      hBuf[y * size + x] = hVal;

      // Natural deep alpine slate-granite with subtle warm feldspar & dark fissures
      const fleck = hash2(x, y, 563) > 0.95 ? 16 : 0;
      const lum = (0.36 + hVal * 0.56) * (0.42 + 0.58 * crackBig);
      const warmShift = (macroTone - 0.5) * 16;
      imgCol.data[idx] = Math.min(255, Math.round((112 + warmShift) * lum + fleck));
      imgCol.data[idx + 1] = Math.min(255, Math.round((110 + warmShift * 0.65) * lum + fleck));
      imgCol.data[idx + 2] = Math.min(255, Math.round((112 - warmShift * 0.35) * lum + fleck));
      imgCol.data[idx + 3] = 255;

      const rgh = Math.round((0.82 + (1 - hVal) * 0.16 - (fleck > 0 ? 0.12 : 0)) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, Math.max(130, rgh));
      imgRgh.data[idx + 3] = 255;
    }
  }
  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);

  return finalizeTerrainLayer(cCol, cRgh, hBuf, size, 3.8, maxAniso);
}

/**
 * 512x512 Shaded Forest Floor Pine-Needle Humus & Deep Woodland Moss under conifer canopy.
 */
function generateForestDuffLayer(size: number, maxAniso: number): TerrainLayerPBR {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;

      const humus = periodicFbm(nx * 6, ny * 6, 607, 4, 6);
      const needleA = periodicFbm(nx * 44, ny * 14, 641, 3, 44);
      const needleB = periodicFbm(nx * 14, ny * 44, 677, 3, 44);
      const mossPatch = Math.max(0, periodicFbm(nx * 7, ny * 7, 709, 3, 7) - 0.44) * 2.1;
      const litter = Math.max(needleA, needleB);

      const hVal = Math.min(1, Math.max(0, 0.24 + humus * 0.26 + litter * 0.5));
      hBuf[y * size + x] = hVal;

      const dR = 50 + litter * 30;
      const dG = 37 + litter * 20;
      const dB = 22 + litter * 11;

      const mR = 32 + litter * 18;
      const mG = 52 + litter * 24;
      const mB = 20 + litter * 9;

      const mm = Math.min(1, mossPatch);
      imgCol.data[idx] = Math.min(255, Math.round(dR * (1 - mm) + mR * mm));
      imgCol.data[idx + 1] = Math.min(255, Math.round(dG * (1 - mm) + mG * mm));
      imgCol.data[idx + 2] = Math.min(255, Math.round(dB * (1 - mm) + mB * mm));
      imgCol.data[idx + 3] = 255;

      const rgh = Math.round((0.88 + (1 - litter) * 0.1) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rgh);
      imgRgh.data[idx + 3] = 255;
    }
  }
  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);

  return finalizeTerrainLayer(cCol, cRgh, hBuf, size, 3.2, maxAniso);
}

/**
 * 512x512 Deep-fissured Alpine Conifer Bark with vertical plates and subtle lichen.
 */
function generateDetailedBarkLayer(size: number, maxAniso: number): TerrainLayerPBR {
  const [cCol, ctxCol] = makeCanvas(size);
  const [cRgh, ctxRgh] = makeCanvas(size);
  const imgCol = ctxCol.createImageData(size, size);
  const imgRgh = ctxRgh.createImageData(size, size);
  const hBuf = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const idx = (y * size + x) * 4;

      const warp = periodicFbm(nx * 6, ny * 3, 809, 3, 6) * 0.08;
      const [, fissure] = periodicVoronoi((nx + warp) * 14, ny * 4, 827, 14);
      const plates = periodicFbm(nx * 28, ny * 10, 863, 3, 28);
      const lichen = Math.max(0, periodicFbm(nx * 9, ny * 9, 887, 3, 9) - 0.66) * 2.5;

      const ridge = Math.min(1, fissure * 4.2);
      const hVal = Math.min(1, Math.max(0, ridge * 0.72 + plates * 0.28));
      hBuf[y * size + x] = hVal;

      const shade = 0.34 + hVal * 0.72;
      const lm = Math.min(0.65, lichen);
      const r = 84 * shade * (1 - lm) + 88 * lm;
      const g = 62 * shade * (1 - lm) + 104 * lm;
      const b = 48 * shade * (1 - lm) + 64 * lm;

      imgCol.data[idx] = Math.min(255, Math.round(r));
      imgCol.data[idx + 1] = Math.min(255, Math.round(g));
      imgCol.data[idx + 2] = Math.min(255, Math.round(b));
      imgCol.data[idx + 3] = 255;

      const rgh = Math.round((0.86 + (1 - hVal) * 0.12) * 255);
      imgRgh.data[idx] = imgRgh.data[idx + 1] = imgRgh.data[idx + 2] = Math.min(255, rgh);
      imgRgh.data[idx + 3] = 255;
    }
  }
  ctxCol.putImageData(imgCol, 0, 0);
  ctxRgh.putImageData(imgRgh, 0, 0);

  return finalizeTerrainLayer(cCol, cRgh, hBuf, size, 4.4, maxAniso);
}

export function createEnvironmentTextures(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl = false,
): EnvironmentTextures {
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 1);
  // Strict Power-of-Two (512 / 256) with 16x anisotropy ensures crisp oblique near/medium detail & zero distant moire
  const terrainSize = isSoftwareGl ? 256 : 512;
  const pineBough = generatePineBoughAtlas(512, maxAniso);
  const fernFrond = generateFernFrondAtlas(terrainSize, maxAniso);
  const meadow = generateMeadowLayer(terrainSize, maxAniso);
  const dirt = generateDirtLayer(terrainSize, maxAniso);
  const cliffRock = generateCliffRockLayer(terrainSize, maxAniso);
  const forestDuff = generateForestDuffLayer(terrainSize, maxAniso);
  const bark = generateDetailedBarkLayer(terrainSize, maxAniso);

  return {
    pineBough,
    fernFrond,
    meadow,
    dirt,
    cliffRock,
    forestDuff,
    bark,
    dispose: () => {
      pineBough.dispose();
      fernFrond.dispose();
      meadow.dispose();
      dirt.dispose();
      cliffRock.dispose();
      forestDuff.dispose();
      bark.dispose();
    },
  };
}
