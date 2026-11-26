import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialProgress,
  getCompletedCount,
  getTotalStars,
  isLevelUnlocked,
  recordLevelVictory,
} from './progression';

test('initial campaign unlocks only Level 1 and locks Levels 2..18', () => {
  const progress = createInitialProgress();
  assert.equal(isLevelUnlocked(progress, 0, 18), true);
  for (let i = 1; i < 18; i++) {
    assert.equal(isLevelUnlocked(progress, i, 18), false, `Level ${i + 1} must start locked`);
  }
  assert.equal(isLevelUnlocked(progress, -1, 18), false);
  assert.equal(isLevelUnlocked(progress, 18, 18), false);
});

test('beating levels unlocks strictly the next sequential level and tracks best scores & stars', () => {
  let progress = createInitialProgress();

  // Beat Level 1 with 2 stars
  progress = recordLevelVictory(progress, 0, 24000, 2, 18);
  assert.equal(progress.highestUnlockedIndex, 1);
  assert.equal(isLevelUnlocked(progress, 1, 18), true);
  assert.equal(isLevelUnlocked(progress, 2, 18), false);
  assert.equal(progress.records[0].stars, 2);
  assert.equal(progress.records[0].bestScore, 24000);

  // Replay Level 1 with lower score: should keep best score & stars and not unlock Level 3
  progress = recordLevelVictory(progress, 0, 19000, 1, 18);
  assert.equal(progress.highestUnlockedIndex, 1);
  assert.equal(progress.records[0].stars, 2);
  assert.equal(progress.records[0].bestScore, 24000);

  // Beat Level 2 with 3 stars: unlocks Level 3
  progress = recordLevelVictory(progress, 1, 41000, 3, 18);
  assert.equal(progress.highestUnlockedIndex, 2);
  assert.equal(isLevelUnlocked(progress, 2, 18), true);
  assert.equal(isLevelUnlocked(progress, 3, 18), false);
  assert.equal(getCompletedCount(progress), 2);
  assert.equal(getTotalStars(progress), 5);

  // Beating final level clamps highestUnlockedIndex to totalLevels - 1
  progress = recordLevelVictory(progress, 17, 95000, 3, 18);
  assert.equal(progress.highestUnlockedIndex, 17);
});
