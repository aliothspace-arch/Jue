import { blk, buildLevelDef, pig } from './helpers';

// Nivel 12 · Fortaleza en Cascada — Tres terrazas ascendentes de piedra y vitral
export default buildLevelDef(
  11,
  [
    // Terraza 1: Parapeto bajo de vanguardia (x = 9.6)
    blk(9.6, 0, -2.75, 0.85, 2.0, 2.2, 'stone', 'wall_stone'),
    blk(9.6, 0, 2.75, 0.85, 2.0, 2.2, 'stone', 'wall_stone'),
    blk(9.6, 0, 0, 0.44, 2.0, 3.25, 'glass', 'window_glass'),
    blk(9.6, 2.0, 0, 1.6, 0.4, 8.2, 'stone', 'deck_stone'),
    blk(9.6, 2.4, -3.4, 0.68, 0.78, 0.86, 'stone', 'merlon'),
    blk(9.6, 2.4, -1.2, 0.68, 0.78, 0.86, 'stone', 'merlon'),
    blk(9.6, 2.4, 1.2, 0.68, 0.78, 0.86, 'stone', 'merlon'),
    blk(9.6, 2.4, 3.4, 0.68, 0.78, 0.86, 'stone', 'merlon'),

    // Terraza 2: Galería media de piedra y cristal (x = 12.6..14.6)
    blk(12.6, 0, -3.2, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(12.6, 0, 0, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(12.6, 0, 3.2, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(14.6, 0, -3.2, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(14.6, 0, 0, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(14.6, 0, 3.2, 0.72, 2.8, 0.72, 'stone', 'pillar_stone'),
    blk(12.6, 0, -1.6, 0.42, 2.8, 2.44, 'glass', 'window_glass'),
    blk(12.6, 0, 1.6, 0.42, 2.8, 2.44, 'glass', 'window_glass'),
    blk(14.6, 0, -1.6, 0.42, 2.8, 2.44, 'glass', 'window_glass'),
    blk(14.6, 0, 1.6, 0.42, 2.8, 2.44, 'glass', 'window_glass'),
    blk(13.6, 2.8, 0, 3.0, 0.44, 7.6, 'wood', 'deck_wood'),

    // Linterna superior de la terraza 2
    blk(12.6, 3.24, -1.4, 0.58, 1.75, 0.58, 'wood', 'pillar_wood'),
    blk(12.6, 3.24, 1.4, 0.58, 1.75, 0.58, 'wood', 'pillar_wood'),
    blk(14.6, 3.24, -1.4, 0.58, 1.75, 0.58, 'wood', 'pillar_wood'),
    blk(14.6, 3.24, 1.4, 0.58, 1.75, 0.58, 'wood', 'pillar_wood'),
    blk(13.6, 3.24, -1.4, 1.38, 1.75, 0.42, 'glass', 'window_glass'),
    blk(13.6, 3.24, 1.4, 1.38, 1.75, 0.42, 'glass', 'window_glass'),
    blk(13.6, 4.99, 0, 2.8, 0.38, 3.6, 'wood', 'deck_wood'),
    blk(13.6, 5.37, 0, 1.3, 1.0, 1.3, 'glass', 'lantern_glass', { lanternGlow: true }),

    // Terraza 3: Torreón alto de granito en retaguardia (x = 16.8..19.2)
    blk(16.8, 0, -3.0, 0.85, 3.0, 0.85, 'stone', 'pillar_stone'),
    blk(16.8, 0, 3.0, 0.85, 3.0, 0.85, 'stone', 'pillar_stone'),
    blk(19.2, 0, -3.0, 0.85, 3.0, 0.85, 'stone', 'pillar_stone'),
    blk(19.2, 0, 3.0, 0.85, 3.0, 0.85, 'stone', 'pillar_stone'),
    blk(16.8, 0, 0, 0.78, 3.0, 5.1, 'stone', 'wall_stone'),
    blk(19.2, 0, 0, 0.78, 3.0, 5.1, 'stone', 'wall_stone'),
    blk(18.0, 0, -3.0, 1.52, 3.0, 0.78, 'stone', 'wall_stone'),
    blk(18.0, 0, 3.0, 1.52, 3.0, 0.78, 'stone', 'wall_stone'),
    blk(18.0, 3.0, 0, 3.6, 0.48, 7.4, 'stone', 'deck_stone'),

    blk(17.0, 3.48, -2.1, 0.72, 2.5, 0.72, 'stone', 'pillar_stone'),
    blk(17.0, 3.48, 2.1, 0.72, 2.5, 0.72, 'stone', 'pillar_stone'),
    blk(19.0, 3.48, -2.1, 0.72, 2.5, 0.72, 'stone', 'pillar_stone'),
    blk(19.0, 3.48, 2.1, 0.72, 2.5, 0.72, 'stone', 'pillar_stone'),
    blk(17.0, 3.48, 0, 0.42, 2.5, 3.44, 'glass', 'window_glass'),
    blk(19.0, 3.48, 0, 0.42, 2.5, 3.44, 'glass', 'window_glass'),
    blk(18.0, 5.98, 0, 3.1, 0.44, 5.3, 'stone', 'deck_stone'),
    blk(18.0, 6.42, 0, 2.6, 1.35, 3.4, 'stone', 'roof_stone', { banner: 'crimson' }),
  ],
  [
    pig(11.1, 0, -1.9, 0.56, 'grunt'),
    pig(11.1, 0, 1.9, 0.56, 'grunt'),
    pig(13.6, 0, -1.6, 0.58, 'helmet'),
    pig(13.6, 0, 1.6, 0.58, 'helmet'),
    pig(13.6, 3.24, 0, 0.56, 'grunt'),
    pig(18.0, 0, 0, 0.62, 'helmet'),
    pig(18.0, 3.48, 0, 0.7, 'king'),
  ],
);
