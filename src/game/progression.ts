export interface LevelRecord {
  bestScore: number;
  stars: number;
}

export interface CampaignProgress {
  highestUnlockedIndex: number;
  records: Record<number, LevelRecord>;
}

const STORAGE_KEY = 'pluma_furia_campaign_progress_v1';

export function createInitialProgress(): CampaignProgress {
  return {
    highestUnlockedIndex: 0,
    records: {},
  };
}

export function isLevelUnlocked(
  progress: CampaignProgress,
  levelIndex: number,
  totalLevels: number,
): boolean {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= totalLevels) {
    return false;
  }
  return levelIndex <= progress.highestUnlockedIndex;
}

export function recordLevelVictory(
  progress: CampaignProgress,
  levelIndex: number,
  score: number,
  stars: number,
  totalLevels: number,
): CampaignProgress {
  const safeScore = Math.max(0, Math.round(score));
  const safeStars = Math.max(1, Math.min(3, Math.round(stars)));
  const prev = progress.records[levelIndex];
  const nextRecord: LevelRecord = {
    bestScore: prev ? Math.max(prev.bestScore, safeScore) : safeScore,
    stars: prev ? Math.max(prev.stars, safeStars) : safeStars,
  };

  const nextUnlocked = Math.min(
    Math.max(0, totalLevels - 1),
    Math.max(progress.highestUnlockedIndex, levelIndex + 1),
  );

  return {
    highestUnlockedIndex: nextUnlocked,
    records: {
      ...progress.records,
      [levelIndex]: nextRecord,
    },
  };
}

export function getTotalStars(progress: CampaignProgress): number {
  let total = 0;
  for (const key of Object.keys(progress.records)) {
    const rec = progress.records[Number(key)];
    if (rec && Number.isFinite(rec.stars)) {
      total += Math.max(0, Math.min(3, rec.stars));
    }
  }
  return total;
}

export function getCompletedCount(progress: CampaignProgress): number {
  return Object.keys(progress.records).length;
}

export function loadCampaignProgress(totalLevels: number): CampaignProgress {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createInitialProgress();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw) as Partial<CampaignProgress>;
    const maxIdx = Math.max(0, totalLevels - 1);
    const highestUnlockedIndex = Math.max(
      0,
      Math.min(maxIdx, typeof parsed.highestUnlockedIndex === 'number' ? Math.floor(parsed.highestUnlockedIndex) : 0),
    );
    const records: Record<number, LevelRecord> = {};
    if (parsed.records && typeof parsed.records === 'object') {
      for (const [k, v] of Object.entries(parsed.records)) {
        const idx = Number(k);
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx <= maxIdx &&
          v &&
          typeof v === 'object' &&
          typeof (v as LevelRecord).bestScore === 'number' &&
          typeof (v as LevelRecord).stars === 'number'
        ) {
          records[idx] = {
            bestScore: Math.max(0, Math.round((v as LevelRecord).bestScore)),
            stars: Math.max(0, Math.min(3, Math.round((v as LevelRecord).stars))),
          };
        }
      }
    }
    return { highestUnlockedIndex, records };
  } catch {
    return createInitialProgress();
  }
}

export function saveCampaignProgress(progress: CampaignProgress): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}
