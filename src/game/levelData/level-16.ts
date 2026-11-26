import { blk, buildLevelDef, pig } from './helpers';

// Nivel 16 · Puente Colgante Blindado — Dos pilones masivos sosteniendo un palco central suspendido de metal
export default buildLevelDef(
  15,
  [
    // Pilón izquierdo (z = -3.8)
    blk(12.8, 0, -4.9, 0.9, 3.6, 0.9, 'stone', 'pillar_stone'),
    blk(12.8, 0, -2.7, 0.9, 3.6, 0.9, 'stone', 'pillar_stone'),
    blk(16.6, 0, -4.9, 0.95, 3.6, 0.95, 'metal', 'pillar_stone'),
    blk(16.6, 0, -2.7, 0.95, 3.6, 0.95, 'metal', 'pillar_stone'),
    blk(12.8, 0, -3.8, 0.45, 3.6, 1.25, 'glass', 'window_glass'),
    blk(14.7, 0, -4.9, 2.86, 3.6, 0.78, 'stone', 'wall_stone'),
    blk(14.7, 0, -2.7, 2.86, 3.6, 0.78, 'stone', 'wall_stone'),
    blk(11.85, 0, -3.8, 0.9, 2.6, 1.1, 'stone', 'buttress'),
    blk(14.7, 3.6, -3.8, 4.8, 0.54, 3.4, 'metal', 'deck_stone'),
    blk(13.6, 4.14, -4.7, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(13.6, 4.14, -2.9, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(15.8, 4.14, -4.7, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(15.8, 4.14, -2.9, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(14.7, 6.44, -3.8, 3.2, 0.44, 2.8, 'metal', 'deck_stone'),
    blk(14.7, 6.88, -3.8, 2.4, 1.45, 2.4, 'stone', 'roof_stone', { banner: 'royal' }),

    // Pilón derecho (z = +3.8)
    blk(12.8, 0, 2.7, 0.9, 3.6, 0.9, 'stone', 'pillar_stone'),
    blk(12.8, 0, 4.9, 0.9, 3.6, 0.9, 'stone', 'pillar_stone'),
    blk(16.6, 0, 2.7, 0.95, 3.6, 0.95, 'metal', 'pillar_stone'),
    blk(16.6, 0, 4.9, 0.95, 3.6, 0.95, 'metal', 'pillar_stone'),
    blk(12.8, 0, 3.8, 0.45, 3.6, 1.25, 'glass', 'window_glass'),
    blk(14.7, 0, 2.7, 2.86, 3.6, 0.78, 'stone', 'wall_stone'),
    blk(14.7, 0, 4.9, 2.86, 3.6, 0.78, 'stone', 'wall_stone'),
    blk(11.85, 0, 3.8, 0.9, 2.6, 1.1, 'stone', 'buttress'),
    blk(14.7, 3.6, 3.8, 4.8, 0.54, 3.4, 'metal', 'deck_stone'),
    blk(13.6, 4.14, 2.9, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(13.6, 4.14, 4.7, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(15.8, 4.14, 2.9, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(15.8, 4.14, 4.7, 0.68, 2.3, 0.68, 'metal', 'pillar_stone'),
    blk(14.7, 6.44, 3.8, 3.2, 0.44, 2.8, 'metal', 'deck_stone'),
    blk(14.7, 6.88, 3.8, 2.4, 1.45, 2.4, 'stone', 'roof_stone', { banner: 'royal' }),

    // Palco central suspendido sobre el vano abierto (y = 3.6..9.0)
    blk(14.7, 3.6, 0, 3.8, 0.54, 4.16, 'metal', 'deck_stone'),
    blk(13.4, 4.14, -1.4, 0.68, 2.1, 0.68, 'metal', 'pillar_stone'),
    blk(13.4, 4.14, 1.4, 0.68, 2.1, 0.68, 'metal', 'pillar_stone'),
    blk(16.0, 4.14, -1.4, 0.68, 2.1, 0.68, 'metal', 'pillar_stone'),
    blk(16.0, 4.14, 1.4, 0.68, 2.1, 0.68, 'metal', 'pillar_stone'),
    blk(13.4, 4.14, 0, 0.42, 2.1, 2.08, 'glass', 'window_glass'),
    blk(16.0, 4.14, 0, 0.42, 2.1, 2.08, 'glass', 'window_glass'),
    blk(14.7, 6.24, 0, 3.4, 0.44, 3.8, 'metal', 'deck_stone'),
    blk(14.7, 6.68, 0, 1.5, 1.15, 1.5, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.7, 7.83, 0, 2.2, 1.15, 2.2, 'metal', 'roof_stone', { banner: 'crimson' }),
  ],
  [
    pig(14.7, 0, -3.8, 0.58, 'helmet'),
    pig(14.7, 0, 3.8, 0.58, 'helmet'),
    pig(14.7, 4.14, -3.8, 0.54, 'grunt'),
    pig(14.7, 4.14, 3.8, 0.54, 'grunt'),
    pig(13.7, 0, 0, 0.58, 'grunt'),
    pig(15.7, 0, 0, 0.58, 'grunt'),
    pig(10.6, 0, 0, 0.54, 'grunt'),
    pig(14.7, 4.14, 0, 0.7, 'king'),
  ],
);
