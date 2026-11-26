import { blk, buildLevelDef, pig } from './helpers';

// Nivel 17 · Zigurat de Acero y Granito — Mega pirámide de cuatro niveles con contrafuertes y armadura de acero
export default buildLevelDef(
  16,
  [
    // Nivel 1: Basamento monumental (x = 11.2..18.8, z = -4.1..+4.1)
    blk(11.2, 0, -4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(11.2, 0, 0, 0.84, 2.4, 0.84, 'stone', 'pillar_stone'),
    blk(11.2, 0, 4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(15.0, 0, -4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(15.0, 0, 4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(18.8, 0, -4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(18.8, 0, 0, 0.84, 2.4, 0.84, 'stone', 'pillar_stone'),
    blk(18.8, 0, 4.1, 0.92, 2.4, 0.92, 'metal', 'pillar_stone'),
    blk(11.2, 0, -2.05, 0.82, 2.4, 3.16, 'stone', 'wall_stone'),
    blk(11.2, 0, 2.05, 0.82, 2.4, 3.16, 'stone', 'wall_stone'),
    blk(18.8, 0, -2.05, 0.82, 2.4, 3.16, 'stone', 'wall_stone'),
    blk(18.8, 0, 2.05, 0.82, 2.4, 3.16, 'stone', 'wall_stone'),
    blk(13.1, 0, -4.1, 2.84, 2.4, 0.44, 'glass', 'window_glass'),
    blk(13.1, 0, 4.1, 2.84, 2.4, 0.44, 'glass', 'window_glass'),
    blk(16.9, 0, -4.1, 2.84, 2.4, 0.78, 'stone', 'wall_stone'),
    blk(16.9, 0, 4.1, 2.84, 2.4, 0.78, 'stone', 'wall_stone'),
    blk(10.25, 0, -4.1, 0.92, 2.2, 0.92, 'stone', 'buttress'),
    blk(10.25, 0, 4.1, 0.92, 2.2, 0.92, 'stone', 'buttress'),
    blk(15.0, 2.4, 0, 8.8, 0.5, 9.4, 'metal', 'deck_stone'),

    // Nivel 2 (x = 12.4..17.6, z = -2.9..+2.9)
    blk(12.4, 2.9, -2.9, 0.82, 2.2, 0.82, 'metal', 'pillar_stone'),
    blk(12.4, 2.9, 2.9, 0.82, 2.2, 0.82, 'metal', 'pillar_stone'),
    blk(17.6, 2.9, -2.9, 0.82, 2.2, 0.82, 'metal', 'pillar_stone'),
    blk(17.6, 2.9, 2.9, 0.82, 2.2, 0.82, 'metal', 'pillar_stone'),
    blk(12.4, 2.9, 0, 0.44, 2.2, 4.92, 'glass', 'window_glass'),
    blk(17.6, 2.9, 0, 0.78, 2.2, 4.92, 'stone', 'wall_stone'),
    blk(15.0, 2.9, -2.9, 4.34, 2.2, 0.72, 'metal', 'wall_stone'),
    blk(15.0, 2.9, 2.9, 4.34, 2.2, 0.72, 'metal', 'wall_stone'),
    blk(11.2, 2.9, -4.0, 0.7, 0.85, 0.7, 'metal', 'merlon'),
    blk(11.2, 2.9, 4.0, 0.7, 0.85, 0.7, 'metal', 'merlon'),
    blk(15.0, 5.1, 0, 6.4, 0.48, 6.8, 'stone', 'deck_stone'),

    // Nivel 3 (x = 13.6..16.4, z = -1.65..+1.65)
    blk(13.6, 5.58, -1.65, 0.68, 2.0, 0.68, 'metal', 'pillar_stone'),
    blk(13.6, 5.58, 1.65, 0.68, 2.0, 0.68, 'metal', 'pillar_stone'),
    blk(16.4, 5.58, -1.65, 0.68, 2.0, 0.68, 'metal', 'pillar_stone'),
    blk(16.4, 5.58, 1.65, 0.68, 2.0, 0.68, 'metal', 'pillar_stone'),
    blk(13.6, 5.58, 0, 0.42, 2.0, 2.58, 'glass', 'window_glass'),
    blk(16.4, 5.58, 0, 0.42, 2.0, 2.58, 'glass', 'window_glass'),
    blk(15.0, 7.58, 0, 3.8, 0.44, 4.3, 'metal', 'deck_stone'),

    // Nivel 4: Corona imperial del zigurat
    blk(15.0, 8.02, 0, 1.8, 1.25, 1.8, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(15.0, 9.27, 0, 2.45, 1.35, 2.45, 'metal', 'roof_stone', { banner: 'crimson' }),
  ],
  [
    pig(13.1, 0, -2.0, 0.58, 'helmet'),
    pig(13.1, 0, 2.0, 0.58, 'helmet'),
    pig(16.9, 0, 0, 0.6, 'helmet'),
    pig(15.0, 2.9, -4.0, 0.52, 'grunt'),
    pig(15.0, 2.9, 4.0, 0.52, 'grunt'),
    pig(15.0, 2.9, -1.2, 0.58, 'helmet'),
    pig(15.0, 2.9, 1.2, 0.58, 'grunt'),
    pig(15.0, 5.58, 0, 0.72, 'king'),
  ],
);
