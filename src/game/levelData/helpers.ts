import type { BlockBlueprint, BlockMaterialType, BlockRole, LevelDefinition, PigBlueprint } from '../types';
import { LEVEL_METADATA } from '../levelMetadata';

/** Helper to place a block with its bottom face resting strictly at `baseY` */
export function blk(
  x: number,
  baseY: number,
  z: number,
  w: number,
  h: number,
  d: number,
  material: BlockMaterialType,
  role: BlockRole,
  opts?: { banner?: 'crimson' | 'royal'; lanternGlow?: boolean; ry?: number },
): BlockBlueprint {
  return {
    x,
    y: Number((baseY + h * 0.5).toFixed(4)),
    z,
    w,
    h,
    d,
    material,
    role,
    ...(opts?.banner ? { banner: opts.banner } : {}),
    ...(opts?.lanternGlow ? { lanternGlow: opts.lanternGlow } : {}),
    ...(opts?.ry ? { ry: opts.ry } : {}),
  };
}

/** Helper to place a pig resting strictly on `baseY` */
export function pig(
  x: number,
  baseY: number,
  z: number,
  radius: number,
  variant: PigBlueprint['variant'],
): PigBlueprint {
  return {
    x,
    y: Number((baseY + radius).toFixed(4)),
    z,
    radius,
    variant,
  };
}

export function buildLevelDef(
  index: number,
  blocks: BlockBlueprint[],
  pigs: PigBlueprint[],
): LevelDefinition {
  const meta = LEVEL_METADATA[index];
  return {
    id: meta.id,
    name: meta.name,
    subtitle: meta.subtitle,
    chapter: meta.chapter,
    materialLabel: meta.materialLabel,
    birds: meta.birds,
    fortressCenter: meta.fortressCenter,
    starThresholds: meta.starThresholds,
    blocks,
    pigs,
  };
}
