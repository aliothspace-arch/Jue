import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OcclusionCuller } from './occlusionCulling';

function makeTestCamera(pos: [number, number, number], target: [number, number, number]): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.4, 280);
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(target[0], target[1], target[2]);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

test('OcclusionCuller culls boxes outside camera frustum', () => {
  const culler = new OcclusionCuller();
  const cam = makeTestCamera([0, 4, 20], [0, 4, 0]);
  culler.beginFrame(cam, 1280, 720);
  culler.finalizeOccluders();

  assert.equal(culler.isBoxVisible(-2, 0, -2, 2, 4, 2), true, 'Box in front of camera must be visible');
  assert.equal(culler.isBoxVisible(-2, 0, 28, 2, 4, 34), false, 'Box behind camera must be frustum-culled');
  assert.equal(culler.isBoxVisible(90, 0, -2, 95, 4, 2), false, 'Box far outside right frustum must be culled');
});

test('OcclusionCuller hides a smaller box strictly behind a large opaque occluder wall', () => {
  const culler = new OcclusionCuller();
  const cam = makeTestCamera([0, 4, 18], [0, 4, 0]);
  culler.beginFrame(cam, 1280, 720);

  // Thick tall wall at z = 6 spanning x in [-7, +7], y in [0, 9]
  culler.addOccluderBox(0, 4.5, 6, 7, 4.5, 0.8);
  culler.finalizeOccluders();

  // Small crate tucked well inside wall silhouette behind it at z = 0
  const hiddenBehind = culler.isBoxVisible(-1.5, 1.5, -0.5, 1.5, 3.5, 0.5);
  assert.equal(hiddenBehind, false, 'Crate strictly behind thick stone wall must be Hi-Z occluded');
  assert.ok(culler.stats.hiZCulled >= 1);

  // Crate in front of wall must remain visible
  const inFront = culler.isBoxVisible(-1.0, 1.0, 10.0, 1.0, 2.5, 11.5);
  assert.equal(inFront, true, 'Crate in front of wall must stay visible');
});

test('OcclusionCuller stays strictly conservative when a target peeks above or beside an occluder', () => {
  const culler = new OcclusionCuller();
  const cam = makeTestCamera([0, 4, 18], [0, 4, 0]);
  culler.beginFrame(cam, 1280, 720);

  culler.addOccluderBox(0, 2.5, 6, 4.0, 2.5, 0.6);
  culler.finalizeOccluders();

  // Box extends well above the wall (y up to 9m) -> must stay visible
  const peekingAbove = culler.isBoxVisible(-1.0, 1.0, 0, 1.0, 9.0, 1.0);
  assert.equal(peekingAbove, true, 'Partially peeking box above wall must not be falsely occluded');

  // Camera inside box must always be visible
  const aroundCamera = culler.isBoxVisible(-2, 0, 16, 2, 8, 20);
  assert.equal(aroundCamera, true, 'Box containing camera must always be visible');
});

test('SectorCompactedInstanced keeps shadow-casting pools at fullCount with immutable instanceMatrix reference', async () => {
  const { SectorCompactedInstanced } = await import('./environment');
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const identity = new Float32Array(new THREE.Matrix4().elements);

  const placements = [
    { matrix: identity, colorR: 1, colorG: 1, colorB: 1, minX: -2, minY: 0, minZ: -2, maxX: 2, maxY: 4, maxZ: 2 },
    { matrix: identity, colorR: 1, colorG: 1, colorB: 1, minX: -2, minY: 0, minZ: 28, maxX: 2, maxY: 4, maxZ: 34 },
  ];

  const shadowPool = new SectorCompactedInstanced(geo, mat, placements, {
    hasColor: true,
    castShadow: true,
    receiveShadow: false,
  });
  const nonShadowPool = new SectorCompactedInstanced(geo, mat, placements, {
    hasColor: true,
    castShadow: false,
    receiveShadow: false,
  });

  const initialMatrixAttr = shadowPool.mesh.instanceMatrix;
  const culler = new OcclusionCuller();
  const cam = makeTestCamera([0, 4, 20], [0, 4, 0]);
  culler.beginFrame(cam, 1280, 720);
  culler.finalizeOccluders();

  shadowPool.update(culler);
  nonShadowPool.update(culler);

  assert.equal(shadowPool.mesh.count, 2, 'Shadow-casting pool must keep all instances active for shadow map stability');
  assert.equal(shadowPool.mesh.instanceMatrix, initialMatrixAttr, 'Shadow-casting pool must never swap instanceMatrix reference');
  assert.equal(nonShadowPool.mesh.count, 1, 'Non-shadow-casting pool must compact off-screen sectors');

  geo.dispose();
  mat.dispose();
});

