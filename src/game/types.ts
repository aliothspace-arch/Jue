export type BirdType = 'red' | 'yellow' | 'black';

export type BlockMaterialType = 'glass' | 'wood' | 'stone' | 'metal';

export type PigVariant = 'grunt' | 'helmet' | 'king';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export type CameraMode = 'aim' | 'follow' | 'inspect';

export type FreeCamGesture = 'orbit' | 'pan' | 'aim';

export type BodyKind = 'bird' | 'pig' | 'block';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type BlockRole =
  | 'plinth'
  | 'pillar_stone'
  | 'pillar_wood'
  | 'beam_wood'
  | 'deck_wood'
  | 'deck_stone'
  | 'wall_stone'
  | 'buttress'
  | 'merlon'
  | 'arch_stone'
  | 'window_glass'
  | 'lantern_glass'
  | 'roof_wood'
  | 'roof_stone'
  | 'crate'
  | 'palisade';

export interface BlockBlueprint {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: BlockMaterialType;
  ry?: number;
  role?: BlockRole;
  banner?: 'crimson' | 'royal';
  lanternGlow?: boolean;
}

export interface PigBlueprint {
  x: number;
  y: number;
  z: number;
  radius: number;
  variant: PigVariant;
}

export interface LevelDefinition {
  id: number;
  name: string;
  subtitle: string;
  chapter: string;
  materialLabel: string;
  birds: BirdType[];
  blocks: BlockBlueprint[];
  pigs: PigBlueprint[];
  starThresholds: [number, number, number];
  fortressCenter: Vec3;
}

export interface CollisionEvent {
  type: 'impact' | 'destroy' | 'pig_pop' | 'explosion' | 'shockwave' | 'joint_snap';
  position: Vec3;
  intensity: number;
  material?: BlockMaterialType | 'pig' | 'ground';
  bodyId?: string;
  birdType?: BirdType;
  scoreDelta: number;
  impactPoint?: Vec3;
  impactDir?: Vec3;
  impulse?: number;
  isGroundContact?: boolean;
}

export interface GameHudSnapshot {
  phase: GamePhase;
  levelIndex: number;
  levelCount: number;
  levelName: string;
  levelSubtitle: string;
  score: number;
  bestScore: number;
  stars: number;
  starThresholds: [number, number, number];
  pigsRemaining: number;
  pigsTotal: number;
  birdQueue: BirdType[];
  activeBird: BirdType | null;
  abilityReady: boolean;
  abilityUsed: boolean;
  cameraMode: CameraMode;
  freeCamGesture: FreeCamGesture;
  isPulling: boolean;
  pullPower: number; // 0..100
  pullAngleDeg: number;
  muted: boolean;
  unusedBirdBonus: number;
  highestUnlockedIndex: number;
  levelRecords: Record<number, { bestScore: number; stars: number }>;
}
