export interface Vec3Simple {
  x: number;
  y: number;
  z: number;
}

/**
 * Deterministic 2D hash in [0, 1].
 */
function hash2(ix: number, iz: number, seed: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Quintic C2-smooth value noise in [0, 1].
 */
export function valueNoise2D(x: number, z: number, seed = 13): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Multi-octave fBm noise in [0, 1].
 */
export function fbm2D(x: number, z: number, seed = 17, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 31);
    norm += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Ridged multifractal noise in [0, 1] producing sharp alpine mountain ridges and eroded valleys.
 */
export function ridgedFbm2D(x: number, z: number, seed = 71, octaves = 4): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  let weight = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, z * freq, seed + i * 47);
    let signal = 1.0 - Math.abs(n * 2.0 - 1.0);
    signal = signal * signal * weight;
    weight = Math.min(1, Math.max(0.15, signal * 1.65));
    sum += signal * amp;
    norm += amp;
    freq *= 2.08;
    amp *= 0.48;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Smoothstep helper.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Natural gently curving centerline Z of the compacted earth trail between slingshot and fortress.
 */
export function pathCenterZ(x: number): number {
  return Math.sin(x * 0.115 + 0.25) * 0.52 + Math.cos(x * 0.055) * 0.18;
}

/**
 * Signed distance (in meters) to the compacted dirt & gravel trail.
 * Negative values are inside the trail; positive values are outside in the meadow.
 */
export function pathSdfAt(x: number, z: number): number {
  const halfLen = 22.8;
  const centerX = 1.2;
  const cx = pathCenterZ(x);

  // Subtle organic width variation along the path
  const widthNoise = (valueNoise2D(x * 0.16, z * 0.16, 409) - 0.5) * 0.55;
  const halfWidth = 3.25 + widthNoise;

  // Rounded capsule-like box distance in X/Z
  const dx = Math.max(0, Math.abs(x - centerX) - halfLen);
  const dz = Math.abs(z - cx);
  if (dx > 0) {
    // Round ends near slingshot & fortress
    const dEnd = Math.hypot(dx, Math.max(0, dz - halfWidth * 0.85));
    return dEnd - 0.5;
  }
  return dz - halfWidth;
}

/**
 * Dual wheel-rut compaction intensity in [0, 1] along the dirt trail.
 */
export function pathRutFactor(x: number, z: number): number {
  const sdf = pathSdfAt(x, z);
  if (sdf > 0.2) return 0;
  const relZ = z - pathCenterZ(x);
  const rutL = Math.exp(-Math.pow((relZ + 1.45) * 1.55, 2));
  const rutR = Math.exp(-Math.pow((relZ - 1.45) * 1.55, 2));
  const endFade = 1 - smoothstep(18.5, 22.8, Math.abs(x - 1.2));
  return Math.min(1, (rutL + rutR) * endFade);
}

/**
 * Geomorphological alpine valley heightfield.
 * GUARANTEES exact y = 0 inside the playable meadow strip (|x| <= 26, |z| <= 11.5)
 * so physics, fortresses, slingshot, and debris remain 100% deterministic.
 */
export function groundHeightAt(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - 26);
  const dz = Math.max(0, Math.abs(z) - 11.5);
  const distOut = Math.sqrt(dx * dx + dz * dz);
  if (distOut <= 0) return 0;

  // C1 smooth transition out of playable valley floor
  const blendNear = smoothstep(0, 15, distOut);
  const blendMid = smoothstep(12, 68, distOut);
  const blendFar = smoothstep(55, 165, distOut);

  // Domain-warped coordinates for realistic tectonic folds & erosion gullies
  const warpX = (fbm2D(x * 0.011, z * 0.011, 101, 3) - 0.5) * 24;
  const warpZ = (fbm2D(x * 0.011 + 31.7, z * 0.011 - 19.3, 137, 3) - 0.5) * 24;
  const wx = x + warpX;
  const wz = z + warpZ;

  // Rolling foothill swells near valley flanks
  const foothillNoise = fbm2D(wx * 0.026, wz * 0.026, 211, 4);
  const foothill = (0.35 + foothillNoise * 1.15) * (distOut * 0.21);

  // Sharp alpine ridged multifractal peaks behind & around the valley
  const ridgePrimary = ridgedFbm2D(wx * 0.0125, wz * 0.0125, 307, 4);
  const ridgeSecondary = ridgedFbm2D(x * 0.032, z * 0.032, 353, 3);

  // Erosional gully channels carved into slopes
  const gully = Math.pow(1 - Math.abs(fbm2D(x * 0.048, z * 0.048, 419, 3) * 2 - 1), 2.2);

  // Frame a dramatic alpine peak backdrop on the -Z / +X side (behind fortress)
  const vistaBoost =
    1.0 +
    0.42 * smoothstep(-10, -90, z) +
    0.28 * smoothstep(20, 120, x);

  const midElevation =
    (ridgePrimary * 19.5 + ridgeSecondary * 4.2 - gully * 2.1) * blendMid * vistaBoost;

  // Distant monumental alpine cordillera ring
  const farPeak =
    (ridgedFbm2D(wx * 0.0085 + 4.2, wz * 0.0085 - 2.7, 509, 4) * 38.0 + 9.0) *
    blendFar *
    vistaBoost;

  // Micro terrain undulation on slopes
  const microUndulation = (fbm2D(x * 0.095, z * 0.095, 613, 2) - 0.5) * 0.85 * blendNear;

  const rawHeight = blendNear * (foothill + microUndulation) + midElevation + farPeak;
  return Math.max(0, rawHeight);
}

/**
 * Computes surface unit normal of the terrain via central finite differences.
 */
export function groundNormalAt(x: number, z: number, eps = 0.45): Vec3Simple {
  const hL = groundHeightAt(x - eps, z);
  const hR = groundHeightAt(x + eps, z);
  const hD = groundHeightAt(x, z - eps);
  const hU = groundHeightAt(x, z + eps);

  const nx = hL - hR;
  const ny = 2 * eps;
  const nz = hD - hU;
  const invLen = 1 / Math.hypot(nx, ny, nz);
  return { x: nx * invLen, y: ny * invLen, z: nz * invLen };
}

/**
 * Ecological forest density mask in [0, 1].
 * Strictly 0 in the playable meadow strip and camera sightline corridor;
 * high in hillside groves and valley flanks.
 */
export function forestDensityAt(x: number, z: number): number {
  // Keep playable valley and immediate slingshot/fortress arena completely clear
  if (Math.abs(x) < 27.5 && Math.abs(z) < 13.5) return 0;

  // Keep camera behind-slingshot view corridor open (-X, +Z side)
  if (x < -14 && x > -38 && z > 2 && z < 24) return 0;

  const h = groundHeightAt(x, z);
  const n = groundNormalAt(x, z, 0.8);

  // Trees avoid sheer rock cliffs and extreme alpine snowline peaks
  const slopeSuitability = smoothstep(0.62, 0.86, n.y);
  const altSuitability = 1 - smoothstep(26, 46, h);

  // Organic grove clumping
  const groveNoise = fbm2D(x * 0.042, z * 0.042, 733, 3);
  const groveMask = smoothstep(0.32, 0.68, groveNoise);

  return Math.min(1, Math.max(0, slopeSuitability * altSuitability * groveMask));
}
