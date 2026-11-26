import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forestDensityAt,
  groundHeightAt,
  groundNormalAt,
  pathCenterZ,
  pathRutFactor,
  pathSdfAt,
} from './terrainMath';

test('groundHeightAt stays strictly flat (0) across the entire playable meadow strip', () => {
  for (let x = -26; x <= 26; x += 2) {
    for (let z = -11.5; z <= 11.5; z += 1.5) {
      assert.equal(groundHeightAt(x, z), 0, `Expected flat ground at (${x}, ${z})`);
    }
  }
});

test('groundHeightAt rises smoothly with alpine ridge relief outside the playable meadow', () => {
  const edgeH = groundHeightAt(26.5, 0);
  const midH = groundHeightAt(48, -32);
  const farH = groundHeightAt(90, -85);

  assert.ok(edgeH >= 0 && edgeH < 0.25, `Smooth C1 transition near edge, got ${edgeH}`);
  assert.ok(midH > 3.5 && Number.isFinite(midH), `Midground hill elevation expected, got ${midH}`);
  assert.ok(farH > midH && Number.isFinite(farH), `Far mountain peaks should exceed foothills: ${farH} vs ${midH}`);
});

test('groundNormalAt returns valid upward-pointing unit vectors everywhere', () => {
  const pts: Array<[number, number]> = [
    [0, 0],
    [-19.5, 0],
    [14, 0],
    [35, -24],
    [-42, -38],
    [60, 45],
  ];
  for (const [x, z] of pts) {
    const n = groundNormalAt(x, z);
    const len = Math.hypot(n.x, n.y, n.z);
    assert.ok(Math.abs(len - 1) < 1e-4, `Normal at (${x},${z}) must be unit length, got ${len}`);
    assert.ok(n.y > 0.2, `Terrain normal must face upward, got ny=${n.y}`);
  }
});

test('pathSdfAt and pathRutFactor accurately define road interior, ruts, and exterior meadow', () => {
  const cz = pathCenterZ(0);
  assert.ok(pathSdfAt(0, cz) < -2.5, 'Center of road should have negative SDF');
  assert.ok(pathSdfAt(0, cz + 8) > 3.5, 'Far from road should have positive SDF');
  assert.ok(pathRutFactor(0, cz + 1.45) > 0.65, 'Wheel rut track should register high compaction');
  assert.equal(pathRutFactor(0, cz + 8), 0, 'Outside road should have zero rut compaction');
});

test('forestDensityAt excludes the playable arena and slingshot sightline', () => {
  assert.equal(forestDensityAt(0, 0), 0);
  assert.equal(forestDensityAt(-19.5, 0), 0);
  assert.equal(forestDensityAt(14, 0), 0);
  assert.equal(forestDensityAt(-24, 14), 0);

  let foundForest = false;
  for (let x = -50; x <= 60; x += 6) {
    for (let z = -45; z <= -18; z += 5) {
      if (forestDensityAt(x, z) > 0.35) {
        foundForest = true;
        break;
      }
    }
  }
  assert.ok(foundForest, 'Hillside flanks should contain valid forest grove zones');
});
