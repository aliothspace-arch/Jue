import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDebrisChunkImpact,
  buildStructuralJoints,
  createBirdBody,
  createBlockBody,
  createPhysicsWorld,
  createPigBody,
  predictTrajectory,
  stepPhysicsWorld,
  triggerBirdAbility,
} from './physics';
import { computeStars, LEVEL_COUNT, LEVEL_METADATA, loadLevelDefinition, SLINGSHOT_ORIGIN } from './levels';

test('predictTrajectory produces a valid parabolic arc descending with gravity', () => {
  const pts = predictTrajectory(SLINGSHOT_ORIGIN, { x: 20, y: 12, z: 0 }, -19.5, 25, 0.08);
  assert.ok(pts.length > 8);
  assert.ok(pts[0].x > SLINGSHOT_ORIGIN.x);
  const peakY = Math.max(...pts.map((p) => p.y));
  assert.ok(peakY > SLINGSHOT_ORIGIN.y + 2);
});

test('sphere bounces off ground plane with restitution and never sinks below radius', () => {
  const world = createPhysicsWorld(-19.5);
  const bird = createBirdBody('b1', 'red', 0, 5, 0);
  bird.launched = true;
  world.bodies.push(bird);

  for (let i = 0; i < 90; i++) {
    stepPhysicsWorld(world, 1 / 60);
  }

  assert.ok(bird.position.y >= bird.radius - 0.03, `Expected y >= ${bird.radius}, got ${bird.position.y}`);
});

test('glass breaks under moderate bird impact while stone resists the same light impact', () => {
  const worldGlass = createPhysicsWorld(-19.5);
  const glass = createBlockBody('g1', 5, 1.0, 0, 0.5, 2.0, 2.0, 'glass');
  const bird1 = createBirdBody('b1', 'red', 3.5, 1.0, 0);
  bird1.launched = true;
  bird1.velocity = { x: 16, y: 0, z: 0 };
  worldGlass.bodies.push(glass, bird1);

  const worldStone = createPhysicsWorld(-19.5);
  const stone = createBlockBody('s1', 5, 1.0, 0, 0.5, 2.0, 2.0, 'stone');
  const bird2 = createBirdBody('b2', 'red', 3.5, 1.0, 0);
  bird2.launched = true;
  bird2.velocity = { x: 16, y: 0, z: 0 };
  worldStone.bodies.push(stone, bird2);

  for (let i = 0; i < 30; i++) {
    stepPhysicsWorld(worldGlass, 1 / 60);
    stepPhysicsWorld(worldStone, 1 / 60);
  }

  assert.equal(glass.alive, false, 'Glass should shatter on direct impact');
  assert.equal(stone.alive, true, 'Stone should survive moderate red bird hit');
});

test('yellow bird boost accelerates velocity and black bird explosion pops nearby pig while damaging stone without instant wipeout', () => {
  const world = createPhysicsWorld(-19.5);
  const yellow = createBirdBody('y1', 'yellow', 0, 6, 0);
  yellow.launched = true;
  yellow.velocity = { x: 12, y: 2, z: 0 };
  world.bodies.push(yellow);

  triggerBirdAbility(world, yellow);
  assert.ok(yellow.velocity.x > 25, 'Yellow boost should substantially increase forward speed');

  const stone = createBlockBody('s1', 10, 1, 0, 1.2, 2.0, 1.2, 'stone');
  const distantPig = createPigBody('p2', 14.2, 0.6, 0, 0.6, 'grunt');
  const pig = createPigBody('p1', 12, 0.6, 0, 0.6, 'grunt');
  const black = createBirdBody('k1', 'black', 11, 1.2, 0);
  black.launched = true;
  world.bodies.push(stone, pig, distantPig, black);

  const events = triggerBirdAbility(world, black);
  assert.ok(events.some((e) => e.type === 'explosion'));
  assert.equal(pig.alive, false, 'Point-blank pig should pop in explosion');
  assert.equal(distantPig.alive, true, 'Pig at medium distance (3.2m) should survive reduced explosion');
  assert.equal(stone.alive, true, 'Full-HP stone block should survive a single black bird blast with structural damage');
  assert.ok(stone.hp < stone.maxHp * 0.7, 'Stone block should take significant structural blast damage');
});

test('all 18 level fortresses remain standing with all blocks and pigs alive during idle settling', async () => {
  for (let idx = 0; idx < LEVEL_COUNT; idx++) {
    const lvl = await loadLevelDefinition(idx);
    const world = createPhysicsWorld(-19.5);
    lvl.blocks.forEach((b, idx) => {
      const body = createBlockBody(`blk-${idx}`, b.x, b.y, b.z, b.w, b.h, b.d, b.material, b.ry ?? 0);
      body.isSleeping = false;
      world.bodies.push(body);
    });
    buildStructuralJoints(world);
    assert.ok(
      world.joints.length >= 10,
      `Level ${lvl.id} (${lvl.name}) should generate structural joints (got ${world.joints.length})`,
    );
    lvl.pigs.forEach((p, idx) => {
      const pig = createPigBody(`pig-${idx}`, p.x, p.y, p.z, p.radius, p.variant);
      pig.isSleeping = false;
      world.bodies.push(pig);
    });

    for (let i = 0; i < 120; i++) {
      stepPhysicsWorld(world, 1 / 60);
    }

    const aliveBlocks = world.bodies.filter((b) => b.kind === 'block' && b.alive).length;
    assert.equal(
      aliveBlocks,
      lvl.blocks.length,
      `Level ${lvl.id} (${lvl.name}) lost a block while idle!`,
    );

    const alivePigs = world.bodies.filter((b) => b.kind === 'pig' && b.alive).length;
    assert.equal(
      alivePigs,
      lvl.pigs.length,
      `Level ${lvl.id} (${lvl.name}) lost a pig while idle!`,
    );
  }
});

test('computeStars returns 0..3 stars matching level thresholds', () => {
  const th: [number, number, number] = [10000, 20000, 30000];
  assert.equal(computeStars(5000, th), 0);
  assert.equal(computeStars(10000, th), 1);
  assert.equal(computeStars(25000, th), 2);
  assert.equal(computeStars(35000, th), 3);
});

test('high-velocity bird impact wakes fortress and triggers chain-reaction collapse', async () => {
  const lvl = await loadLevelDefinition(0);
  const world = createPhysicsWorld(-19.5);
  lvl.blocks.forEach((b, idx) => {
    world.bodies.push(
      createBlockBody(`blk-${idx}`, b.x, b.y, b.z, b.w, b.h, b.d, b.material, b.ry ?? 0),
    );
  });
  lvl.pigs.forEach((p, idx) => {
    world.bodies.push(createPigBody(`pig-${idx}`, p.x, p.y, p.z, p.radius, p.variant));
  });

  const bird = createBirdBody('hero', 'black', 6.5, 2.5, 0);
  bird.launched = true;
  bird.velocity = { x: 24, y: 1.5, z: 0 };
  world.bodies.push(bird);

  let destroyedCount = 0;
  for (let i = 0; i < 150; i++) {
    const events = stepPhysicsWorld(world, 1 / 60);
    for (const ev of events) {
      if (ev.type === 'destroy' || ev.type === 'pig_pop') destroyedCount++;
    }
  }
  assert.ok(destroyedCount >= 1, 'Direct heavy strike should destroy glass/blocks or pop pigs');
});

test('structural joints bind stacked fortress blocks and snap with joint_snap events under heavy strike', () => {
  const world = createPhysicsWorld(-19.5);
  const pillar = createBlockBody('p1', 10, 1.5, 0, 0.9, 3.0, 0.9, 'stone');
  const lintel = createBlockBody('l1', 10, 3.35, 0, 4.0, 0.7, 1.2, 'stone');
  world.bodies.push(pillar, lintel);
  buildStructuralJoints(world);
  assert.equal(world.joints.length, 1, 'Stacked pillar and lintel should form 1 mortar joint');

  const bird = createBirdBody('b1', 'black', 7.5, 3.35, 0);
  bird.launched = true;
  bird.velocity = { x: 26, y: 0.5, z: 0 };
  world.bodies.push(bird);

  let jointSnapCount = 0;
  for (let i = 0; i < 60; i++) {
    const events = stepPhysicsWorld(world, 1 / 60);
    for (const ev of events) {
      if (ev.type === 'joint_snap') jointSnapCount++;
    }
  }
  assert.ok(jointSnapCount >= 1, 'Heavy shear strike should snap the mortar joint and emit joint_snap');
  assert.equal(world.joints[0].broken, true);
});

test('kinetic penetration allows fast yellow bird to smash cleanly through glass while retaining >70% forward velocity', () => {
  const world = createPhysicsWorld(-19.5);
  const glass = createBlockBody('g1', 6, 1.5, 0, 0.45, 2.4, 2.0, 'glass');
  const bird = createBirdBody('y1', 'yellow', 4.4, 1.5, 0);
  bird.launched = true;
  bird.velocity = { x: 24, y: 0, z: 0 };
  world.bodies.push(glass, bird);

  for (let i = 0; i < 15; i++) {
    stepPhysicsWorld(world, 1 / 60);
  }

  assert.equal(glass.alive, false, 'Glass pane should shatter on high-speed yellow bird strike');
  assert.ok(
    bird.velocity.x > 16.8,
    `Expected yellow bird to retain >70% forward speed (>16.8), got ${bird.velocity.x.toFixed(2)}`,
  );
});

test('fast Voronoi rubble chunk impact pops an exposed grunt pig', () => {
  const world = createPhysicsWorld(-19.5);
  const pig = createPigBody('p1', 12, 0.7, 0, 0.65, 'grunt');
  world.bodies.push(pig);

  const events = applyDebrisChunkImpact(
    world,
    { x: 11.4, y: 0.7, z: 0 },
    { x: 18, y: -2, z: 0 },
    0.42,
    'stone',
  );

  assert.equal(pig.alive, false, 'High-speed stone Voronoi chunk should pop exposed grunt pig');
  assert.ok(events.some((e) => e.type === 'pig_pop'));
});

test('grounded spinning pig and bird damp vertical Y-axis spin and settle cleanly without spinning forever', () => {
  const world = createPhysicsWorld(-19.5);
  const pig = createPigBody('spin-pig', 8, 0.5, 0, 0.5, 'grunt');
  pig.isSleeping = false;
  pig.angularVelocity = { x: 2, y: 14, z: -2 };
  const bird = createBirdBody('spin-bird', 'red', 2, 0.44, 0);
  bird.launched = true;
  bird.angularVelocity = { x: 1.5, y: 12, z: 1.5 };
  world.bodies.push(pig, bird);

  for (let i = 0; i < 75; i++) {
    stepPhysicsWorld(world, 1 / 60);
  }

  assert.equal(pig.isSleeping, true, 'Grounded spinning pig should damp Y spin and sleep within 1.25s');
  assert.equal(bird.isSleeping, true, 'Grounded spinning bird should damp Y spin and sleep within 1.25s');
  assert.equal(Math.abs(pig.angularVelocity.y), 0);
  assert.equal(Math.abs(bird.angularVelocity.y), 0);
});

test('metal resists red bird strikes with ricochet sparks, shatters to black bird blast, and crushes wood when dropped', () => {
  const worldHit = createPhysicsWorld(-19.5);
  const metalWall = createBlockBody('m1', 6, 1.5, 0, 0.85, 2.8, 2.2, 'metal');
  const red = createBirdBody('r1', 'red', 4.3, 1.5, 0);
  red.launched = true;
  red.velocity = { x: 18, y: 0, z: 0 };
  worldHit.bodies.push(metalWall, red);

  let ricochetEvents = 0;
  for (let i = 0; i < 30; i++) {
    const events = stepPhysicsWorld(worldHit, 1 / 60);
    for (const ev of events) {
      if (ev.type === 'impact' && ev.material === 'metal') ricochetEvents++;
    }
  }
  assert.equal(metalWall.alive, true, 'Metal wall should survive direct red bird hit');
  assert.ok(metalWall.hp > metalWall.maxHp * 0.9, 'Metal should take negligible damage from red bird');
  assert.ok(ricochetEvents >= 1, 'Metal should emit metallic ricochet impact events');

  const worldBlast = createPhysicsWorld(-19.5);
  const metalTarget = createBlockBody('m2', 10, 1.4, 0, 0.9, 2.8, 2.2, 'metal');
  const black = createBirdBody('k1', 'black', 8.9, 1.4, 0);
  black.launched = true;
  worldBlast.bodies.push(metalTarget, black);
  triggerBirdAbility(worldBlast, black);
  assert.equal(metalTarget.alive, true, 'Forged metal should survive a single black bird explosion');
  assert.ok(metalTarget.hp < metalTarget.maxHp * 0.88, 'Close black bird explosion should dent and damage forged metal');

  const worldCrush = createPhysicsWorld(-19.5);
  const woodPost = createBlockBody('w1', 12, 1.0, 0, 0.65, 2.0, 0.65, 'wood');
  const metalSlab = createBlockBody('m3', 12, 6.0, 0, 4.0, 0.6, 3.6, 'metal');
  metalSlab.isSleeping = false;
  worldCrush.bodies.push(woodPost, metalSlab);
  for (let i = 0; i < 90; i++) {
    stepPhysicsWorld(worldCrush, 1 / 60);
  }
  assert.ok(
    woodPost.hp < woodPost.maxHp * 0.65 || !woodPost.alive,
    'Falling heavy metal slab should severely crush or shatter wood support underneath',
  );
});

test('all 18 levels follow strict material progression, pigCount sync, and scale from huts to citadels', async () => {
  const blockCounts: number[] = [];
  for (let idx = 0; idx < LEVEL_COUNT; idx++) {
    const lvl = await loadLevelDefinition(idx);
    assert.equal(lvl.pigs.length, LEVEL_METADATA[idx].pigCount, `Level ${lvl.id} pigCount mismatch`);
    blockCounts.push(lvl.blocks.length);

    const mats = new Set(lvl.blocks.map((b) => b.material));
    if (idx < 4) {
      assert.deepEqual([...mats], ['wood'], `Level ${lvl.id} (1-4) should be 100% wood`);
    } else if (idx < 8) {
      assert.ok(mats.has('glass'), `Level ${lvl.id} (5-8) should feature glass`);
      assert.ok(!mats.has('stone') && !mats.has('metal'), `Level ${lvl.id} (5-8) should not have stone/metal`);
    } else if (idx < 14) {
      assert.ok(mats.has('stone'), `Level ${lvl.id} (9-14) should feature stone`);
      assert.ok(!mats.has('metal'), `Level ${lvl.id} (9-14) should not have metal yet`);
    } else {
      assert.ok(mats.has('metal'), `Level ${lvl.id} (15-18) should feature forged metal`);
    }
  }
  assert.ok(blockCounts[0] <= 18, `Level 1 should be a compact hut (got ${blockCounts[0]} blocks)`);
  assert.ok(
    blockCounts[17] >= blockCounts[0] * 3,
    `Level 18 citadel (${blockCounts[17]} blocks) should be >= 3x Level 1 hut (${blockCounts[0]} blocks)`,
  );
});
