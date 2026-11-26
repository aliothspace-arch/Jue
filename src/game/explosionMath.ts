import type { Vec3 } from './types';

/**
 * Sedov-Taylor blast wave radius expansion: rapid initial supersonic push,
 * decelerating organically as atmospheric mass is swept up.
 */
export function computeShockwaveRadius(age: number, maxRadius: number, duration: number): number {
  if (age <= 0 || duration <= 0) return 0;
  const t = Math.min(1, age / duration);
  return maxRadius * Math.pow(t, 0.54);
}

/**
 * Acoustic/pressure wave transit delay (seconds) from epicenter to camera.
 */
export function computeAcousticTransitDelay(distanceMeters: number): number {
  const clamped = Math.max(0, distanceMeters);
  return Math.min(0.32, clamped / 95);
}

/**
 * Stochastic turbulent fireball light intensity envelope.
 * Produces an intense sub-50ms ignition spike followed by multi-frequency
 * blackbody flame flicker as soot crusts fold over incandescent plasma.
 */
export function computeStochasticFireIntensity(
  age: number,
  maxAge: number,
  elapsed: number,
): number {
  if (age < 0 || age >= maxAge || maxAge <= 0) return 0;
  const t = age / maxAge;
  const flashSpike = age < 0.06 ? 1.45 * (1 - age / 0.06) : 0;
  const envelope = Math.pow(1 - t, 1.85);
  const flicker =
    0.82 +
    0.22 * Math.sin(elapsed * 43.0 + age * 19.0) +
    0.14 * Math.cos(elapsed * 71.0 - age * 31.0);
  return Math.max(0, (envelope * flicker + flashSpike));
}

function potentialField(x: number, y: number, z: number, t: number): [number, number, number] {
  const p1 = Math.sin(y * 1.15 + t * 1.7) * Math.cos(z * 1.05 - t * 1.2);
  const p2 = Math.sin(z * 1.25 - t * 1.4) * Math.cos(x * 1.1 + t * 1.5);
  const p3 = Math.sin(x * 1.08 + t * 1.3) * Math.cos(y * 1.22 + t * 1.1);
  return [p1, p2, p3];
}

/**
 * Divergence-free-inspired 3D Curl Noise via finite differences of a smooth vector potential.
 */
export function computeCurlNoise3D(x: number, y: number, z: number, time: number): Vec3 {
  const eps = 0.08;
  const inv2Eps = 1 / (2 * eps);

  const [, py1, pz1] = potentialField(x + eps, y, z, time);
  const [, py0, pz0] = potentialField(x - eps, y, z, time);
  const [pxy1, , pzy1] = potentialField(x, y + eps, z, time);
  const [pxy0, , pzy0] = potentialField(x, y - eps, z, time);
  const [pxz1, pyz1] = potentialField(x, y, z + eps, time);
  const [pxz0, pyz0] = potentialField(x, y, z - eps, time);

  const dFz_dy = (pzy1 - pzy0) * inv2Eps;
  const dFy_dz = (pyz1 - pyz0) * inv2Eps;
  const dFx_dz = (pxz1 - pxz0) * inv2Eps;
  const dFz_dx = (pz1 - pz0) * inv2Eps;
  const dFy_dx = (py1 - py0) * inv2Eps;
  const dFx_dy = (pxy1 - pxy0) * inv2Eps;

  return {
    x: dFz_dy - dFy_dz,
    y: dFx_dz - dFz_dx,
    z: dFy_dx - dFx_dy,
  };
}

/**
 * Analytical Toroidal Vortex Ring + Thermal Buoyancy + Curl Advection velocity field
 * for realistic mushroom-cap roll and central stem entrainment.
 */
export function computeToroidalVortexVelocity(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  age: number,
  ringRadius: number,
  strength: number,
): Vec3 {
  const rx = px - cx;
  const ry = py - cy;
  const rz = pz - cz;
  const horizDist = Math.hypot(rx, rz);
  const safeHoriz = Math.max(0.05, horizDist);
  const hx = rx / safeHoriz;
  const hz = rz / safeHoriz;

  // Distance to the toroidal ring core circle at radius = ringRadius
  const ringOffset = horizDist - ringRadius;
  const distToRing = Math.hypot(ringOffset, ry);
  const coreRadius = Math.max(0.65, ringRadius * 0.72);
  const falloff = Math.exp(-(distToRing * distToRing) / (coreRadius * coreRadius * 1.45));

  // Toroidal circulation:
  // inside ring (ringOffset < 0): strong upward lift
  // top of ring (ry > 0): outward radial curl
  // outer skirt (ringOffset > 0): downward curl
  // base (ry < 0): inward entrainment
  const circSpeed = strength * falloff * (1 / (1 + age * 0.55));
  const vRadial = (ry / Math.max(0.4, distToRing)) * circSpeed;
  const vAxial = (-ringOffset / Math.max(0.4, distToRing)) * circSpeed;

  // Global thermal buoyancy decays smoothly as smoke cools
  const thermalLift = strength * 0.42 * Math.exp(-age * 0.48);

  const curl = computeCurlNoise3D(px * 0.35, py * 0.35, pz * 0.35, age * 1.4);
  const curlAmp = strength * 0.32;

  return {
    x: hx * vRadial + curl.x * curlAmp,
    y: vAxial + thermalLift + curl.y * curlAmp * 0.65,
    z: hz * vRadial + curl.z * curlAmp,
  };
}

export interface MachConeParams {
  active: boolean;
  intensity: number;
  length: number;
  radius: number;
  pulse: number;
}

/**
 * Physical Prandtl-Glauert supersonic Mach cone profile for Yellow Bird's boost.
 * Cone opening radius tightens with velocity while condensation intensity peaks
 * immediately at sonic boom ignition and sheds vapor organically over its lifetime.
 */
export function computeMachConeParams(
  speed: number,
  age: number,
  duration: number,
): MachConeParams {
  if (duration <= 0 || age < 0 || age >= duration || speed <= 8) {
    return { active: false, intensity: 0, length: 0, radius: 0, pulse: 0 };
  }
  const t = age / duration;
  const speedNorm = Math.min(2.2, Math.max(0.5, (speed - 8) / 24));
  const attack = Math.min(1, t / 0.11);
  const decay = Math.pow(1 - t, 1.45);
  const intensity = Math.max(0, Math.min(1, attack * decay * (0.65 + 0.35 * speedNorm)));
  // Higher Mach number produces a sharper, longer aerodynamic vapor cone
  const machFactor = Math.max(1.0, speed / 22);
  const radius = Math.max(0.85, Math.min(1.95, (1.82 / Math.pow(machFactor, 0.45)) * (0.82 + t * 0.42)));
  const length = (2.8 + speedNorm * 1.65) * (0.88 + Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * 0.32);
  const pulse = 0.85 + 0.15 * Math.sin(age * 46.0);
  return { active: true, intensity, length, radius, pulse };
}

export interface KineticPulseWaveState {
  active: boolean;
  progress: number;
  radius: number;
  opacity: number;
  distortion: number;
}

/**
 * Staggered multi-pulse acoustic/kinetic shockwave profile for Red Bird's Onda de Choque.
 */
export function computeKineticPulseWave(
  age: number,
  delay: number,
  duration: number,
  maxRadius: number,
): KineticPulseWaveState {
  const localAge = age - delay;
  if (duration <= 0 || localAge < 0 || localAge >= duration || maxRadius <= 0) {
    return { active: false, progress: 0, radius: 0, opacity: 0, distortion: 0 };
  }
  const progress = Math.min(1, localAge / duration);
  const expand = Math.pow(progress, 0.58);
  const radius = 0.45 + (maxRadius - 0.45) * expand;
  const fadeIn = Math.min(1, progress / 0.12);
  const fadeOut = Math.pow(1 - progress, 1.48);
  const opacity = Math.max(0, Math.min(1, fadeIn * fadeOut));
  const distortion = (1 - progress) * (0.35 + 0.65 * Math.sin(progress * Math.PI));
  return { active: true, progress, radius, opacity, distortion };
}

export interface MushroomPlumeProfile {
  stemHeight: number;
  capRadius: number;
  capElevation: number;
  heatFactor: number;
  sootOpacity: number;
}

/**
 * Hydrodynamic rising stem + toroidal mushroom cap evolution and blackbody cooling curve
 * for Black Bird's cinema pyroclastic detonation.
 */
export function computeMushroomPlumeProfile(age: number, maxAge: number): MushroomPlumeProfile {
  if (maxAge <= 0 || age <= 0) {
    return { stemHeight: 0, capRadius: 0.6, capElevation: 0, heatFactor: 1, sootOpacity: 0 };
  }
  const t = Math.min(1, age / maxAge);
  const riseEase = 1 - Math.pow(1 - t, 2.2);
  const stemHeight = 5.6 * riseEase;
  const capElevation = 1.4 + 6.4 * riseEase;
  const capRadius = 1.15 + 3.65 * Math.pow(t, 0.62);
  const heatFactor = Math.max(0, Math.pow(1 - t, 2.35));
  const fadeIn = Math.min(1, t / 0.14);
  const fadeOut = t >= 1 ? 0 : t > 0.68 ? Math.max(0, (1 - t) / 0.32) : 1;
  const sootOpacity = Math.max(0, Math.min(1, fadeIn * fadeOut));
  return { stemHeight, capRadius, capElevation, heatFactor, sootOpacity };
}

