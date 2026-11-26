import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAcousticTransitDelay,
  computeCurlNoise3D,
  computeKineticPulseWave,
  computeMachConeParams,
  computeMushroomPlumeProfile,
  computeShockwaveRadius,
  computeStochasticFireIntensity,
  computeToroidalVortexVelocity,
} from './explosionMath';

test('computeShockwaveRadius grows monotonically following Sedov-Taylor profile', () => {
  assert.equal(computeShockwaveRadius(0, 13, 0.44), 0);
  assert.equal(computeShockwaveRadius(-0.1, 13, 0.44), 0);

  const r1 = computeShockwaveRadius(0.05, 13, 0.44);
  const r2 = computeShockwaveRadius(0.22, 13, 0.44);
  const r3 = computeShockwaveRadius(0.44, 13, 0.44);
  const r4 = computeShockwaveRadius(0.8, 13, 0.44);

  assert.ok(r1 > 0 && r1 < r2);
  assert.ok(r2 < r3);
  assert.equal(r3, 13);
  assert.equal(r4, 13);
  // Sedov-Taylor deceleration: initial expansion covers > 50% radius before half duration
  assert.ok(r2 > 13 * 0.55);
});

test('computeAcousticTransitDelay scales with distance and clamps safely', () => {
  assert.equal(computeAcousticTransitDelay(-5), 0);
  assert.equal(computeAcousticTransitDelay(0), 0);
  const near = computeAcousticTransitDelay(10);
  const far = computeAcousticTransitDelay(30);
  assert.ok(near > 0 && far > near);
  assert.ok(computeAcousticTransitDelay(1000) <= 0.32);
});

test('computeStochasticFireIntensity spikes at ignition and decays cleanly without NaNs', () => {
  const peak = computeStochasticFireIntensity(0.01, 0.85, 1.2);
  const mid = computeStochasticFireIntensity(0.35, 0.85, 1.55);
  const end = computeStochasticFireIntensity(0.85, 0.85, 2.05);

  assert.ok(Number.isFinite(peak) && peak > 1.0);
  assert.ok(Number.isFinite(mid) && mid > 0 && mid < peak);
  assert.equal(end, 0);
  assert.equal(computeStochasticFireIntensity(-0.2, 0.85, 0), 0);
});

test('computeCurlNoise3D returns finite bounded turbulence vectors', () => {
  const c1 = computeCurlNoise3D(1.2, 3.4, -2.1, 0.5);
  const c2 = computeCurlNoise3D(1.2, 3.4, -2.1, 1.7);
  for (const v of [c1.x, c1.y, c1.z, c2.x, c2.y, c2.z]) {
    assert.ok(Number.isFinite(v));
    assert.ok(Math.abs(v) < 10);
  }
  assert.notDeepEqual(c1, c2);
});

test('computeToroidalVortexVelocity lifts inside ring and curls outward at top', () => {
  const cx = 10;
  const cy = 2;
  const cz = 0;

  // Inside the ring (horizDist < ringRadius): strong upward entrainment
  const inside = computeToroidalVortexVelocity(10.2, 2.0, 0, cx, cy, cz, 0.4, 2.6, 7.0);
  assert.ok(Number.isFinite(inside.y) && inside.y > 3.0);

  // Above the ring core: outward radial expansion
  const top = computeToroidalVortexVelocity(12.6, 3.4, 0, cx, cy, cz, 0.4, 2.6, 7.0);
  assert.ok(Number.isFinite(top.x) && top.x > 1.5);

  // Later in age: circulation speed decays organically
  const lateInside = computeToroidalVortexVelocity(10.2, 2.0, 0, cx, cy, cz, 4.0, 2.6, 7.0);
  assert.ok(lateInside.y < inside.y);
});

test('computeMachConeParams tightens cone radius at supersonic speeds and fades cleanly', () => {
  const slow = computeMachConeParams(5, 0.1, 0.72);
  assert.equal(slow.active, false);
  assert.equal(slow.intensity, 0);

  const midFast = computeMachConeParams(28, 0.12, 0.72);
  const hyperFast = computeMachConeParams(54, 0.12, 0.72);
  assert.equal(midFast.active, true);
  assert.equal(hyperFast.active, true);
  assert.ok(midFast.intensity > 0.5 && midFast.length > 2.5);
  assert.ok(hyperFast.radius < midFast.radius);
  assert.ok(hyperFast.length > midFast.length);

  const expired = computeMachConeParams(36, 0.75, 0.72);
  assert.equal(expired.active, false);
});

test('computeKineticPulseWave respects stagger delay, expands monotonically, and fades to zero', () => {
  const before = computeKineticPulseWave(0.04, 0.06, 0.42, 7.5);
  assert.equal(before.active, false);
  assert.equal(before.opacity, 0);

  const early = computeKineticPulseWave(0.11, 0.06, 0.42, 7.5);
  const late = computeKineticPulseWave(0.32, 0.06, 0.42, 7.5);
  const done = computeKineticPulseWave(0.50, 0.06, 0.42, 7.5);

  assert.equal(early.active, true);
  assert.equal(late.active, true);
  assert.ok(late.radius > early.radius);
  assert.ok(early.opacity > late.opacity);
  assert.equal(done.active, false);
});

test('computeMushroomPlumeProfile rises, expands cap, and cools blackbody temperature monotonically', () => {
  const start = computeMushroomPlumeProfile(0.15, 2.2);
  const mid = computeMushroomPlumeProfile(1.0, 2.2);
  const end = computeMushroomPlumeProfile(2.2, 2.2);

  assert.ok(mid.stemHeight > start.stemHeight);
  assert.ok(mid.capRadius > start.capRadius);
  assert.ok(mid.capElevation > start.capElevation);
  assert.ok(start.heatFactor > mid.heatFactor && mid.heatFactor > end.heatFactor);
  assert.equal(end.sootOpacity, 0);
});

