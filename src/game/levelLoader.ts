import { LEVEL_COUNT } from './levelMetadata';
import type { LevelDefinition } from './types';

let activeIndex = -1;
let activeLevel: LevelDefinition | null = null;
let inFlightIndex: number | null = null;
let inFlightPromise: Promise<LevelDefinition> | null = null;

async function importLevelChunk(idx: number): Promise<LevelDefinition> {
  let mod: { default: LevelDefinition };
  switch (idx) {
    case 0:
      mod = await import('./levelData/level-01');
      break;
    case 1:
      mod = await import('./levelData/level-02');
      break;
    case 2:
      mod = await import('./levelData/level-03');
      break;
    case 3:
      mod = await import('./levelData/level-04');
      break;
    case 4:
      mod = await import('./levelData/level-05');
      break;
    case 5:
      mod = await import('./levelData/level-06');
      break;
    case 6:
      mod = await import('./levelData/level-07');
      break;
    case 7:
      mod = await import('./levelData/level-08');
      break;
    case 8:
      mod = await import('./levelData/level-09');
      break;
    case 9:
      mod = await import('./levelData/level-10');
      break;
    case 10:
      mod = await import('./levelData/level-11');
      break;
    case 11:
      mod = await import('./levelData/level-12');
      break;
    case 12:
      mod = await import('./levelData/level-13');
      break;
    case 13:
      mod = await import('./levelData/level-14');
      break;
    case 14:
      mod = await import('./levelData/level-15');
      break;
    case 15:
      mod = await import('./levelData/level-16');
      break;
    case 16:
      mod = await import('./levelData/level-17');
      break;
    default:
      mod = await import('./levelData/level-18');
      break;
  }
  return mod.default;
}

/**
 * Loads ONLY the requested level chunk dynamically and retains only the
 * currently active level in memory, releasing prior level blueprints.
 */
export async function loadLevelDefinition(index: number): Promise<LevelDefinition> {
  const idx = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(index)));
  if (activeIndex === idx && activeLevel) {
    return activeLevel;
  }
  if (inFlightIndex === idx && inFlightPromise) {
    return inFlightPromise;
  }

  const promise = importLevelChunk(idx).then((def) => {
    // Only commit as active if another newer request didn't already supersede it
    if (inFlightPromise === promise) {
      activeIndex = idx;
      activeLevel = def;
      inFlightIndex = null;
      inFlightPromise = null;
    }
    return def;
  });

  inFlightIndex = idx;
  inFlightPromise = promise;
  return promise;
}

export function getActiveLevelDefinition(): LevelDefinition | null {
  return activeLevel;
}

export function getActiveLevelIndex(): number {
  return activeIndex;
}

export function clearCachedLevelDefinition(): void {
  activeIndex = -1;
  activeLevel = null;
  inFlightIndex = null;
  inFlightPromise = null;
}
