import { blk, buildLevelDef, pig } from './helpers';

// Nivel 18 · Gran Ciudadela Imperial — Tres anillos defensivos: puerta gemela, patio arcado y alcázar de cuatro plantas
export default buildLevelDef(
  17,
  [
    // Anillo 1: Torres gemelas de puerta blindada y gran arco central (x = 8.4)
    blk(7.7, 0, -4.5, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(7.7, 0, -2.7, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(9.1, 0, -4.5, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(9.1, 0, -2.7, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(7.7, 0, -3.6, 0.74, 2.5, 1.0, 'metal', 'wall_stone'),
    blk(8.4, 2.5, -3.6, 2.3, 0.44, 2.7, 'metal', 'deck_stone'),
    blk(8.4, 2.94, -3.6, 1.8, 1.1, 1.8, 'stone', 'roof_stone', { banner: 'royal' }),

    blk(7.7, 0, 2.7, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(7.7, 0, 4.5, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(9.1, 0, 2.7, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(9.1, 0, 4.5, 0.76, 2.5, 0.76, 'metal', 'pillar_stone'),
    blk(7.7, 0, 3.6, 0.74, 2.5, 1.0, 'metal', 'wall_stone'),
    blk(8.4, 2.5, 3.6, 2.3, 0.44, 2.7, 'metal', 'deck_stone'),
    blk(8.4, 2.94, 3.6, 1.8, 1.1, 1.8, 'stone', 'roof_stone', { banner: 'royal' }),

    blk(8.4, 0, -1.85, 1.05, 2.5, 0.7, 'stone', 'pillar_stone'),
    blk(8.4, 0, 1.85, 1.05, 2.5, 0.7, 'stone', 'pillar_stone'),
    blk(8.4, 2.5, 0, 1.05, 1.4, 4.3, 'stone', 'arch_stone'),

    // Anillo 2: Bastión intermedio arcado (x = 12.0)
    blk(12.0, 0, -3.8, 0.85, 2.8, 0.85, 'stone', 'pillar_stone'),
    blk(12.0, 0, -1.3, 0.85, 2.8, 0.85, 'stone', 'pillar_stone'),
    blk(12.0, 0, 1.3, 0.85, 2.8, 0.85, 'stone', 'pillar_stone'),
    blk(12.0, 0, 3.8, 0.85, 2.8, 0.85, 'stone', 'pillar_stone'),
    blk(12.0, 0, -2.55, 0.44, 2.8, 1.62, 'glass', 'window_glass'),
    blk(12.0, 0, 2.55, 0.44, 2.8, 1.62, 'glass', 'window_glass'),
    blk(12.0, 2.8, 0, 1.8, 0.44, 8.8, 'stone', 'deck_stone'),
    blk(12.0, 3.24, -3.2, 1.15, 1.05, 1.15, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(12.0, 3.24, 0, 0.85, 0.9, 1.2, 'metal', 'merlon'),
    blk(12.0, 3.24, 3.2, 1.15, 1.05, 1.15, 'glass', 'lantern_glass', { lanternGlow: true }),

    // Anillo 3: Alcázar Imperial de cuatro plantas (x = 15.2..19.8)
    // Planta 1: Blindaje frontal de acero con apoyos internos de madera y cristal
    blk(15.2, 0, -4.2, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(15.2, 0, 0, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(15.2, 0, 4.2, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(17.5, 0, -4.2, 0.82, 2.8, 0.82, 'wood', 'pillar_wood'),
    blk(17.5, 0, 4.2, 0.82, 2.8, 0.82, 'wood', 'pillar_wood'),
    blk(19.8, 0, -4.2, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(19.8, 0, 0, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(19.8, 0, 4.2, 0.95, 2.8, 0.95, 'metal', 'pillar_stone'),
    blk(15.2, 0, -2.1, 0.86, 2.8, 3.2, 'metal', 'wall_stone'),
    blk(15.2, 0, 2.1, 0.86, 2.8, 3.2, 'metal', 'wall_stone'),
    blk(19.8, 0, -2.1, 0.86, 2.8, 3.2, 'stone', 'wall_stone'),
    blk(19.8, 0, 2.1, 0.86, 2.8, 3.2, 'stone', 'wall_stone'),
    blk(16.35, 0, -4.2, 1.38, 2.8, 0.44, 'glass', 'window_glass'),
    blk(18.65, 0, -4.2, 1.38, 2.8, 0.44, 'glass', 'window_glass'),
    blk(16.35, 0, 4.2, 1.38, 2.8, 0.44, 'glass', 'window_glass'),
    blk(18.65, 0, 4.2, 1.38, 2.8, 0.44, 'glass', 'window_glass'),
    blk(17.5, 2.8, 0, 5.8, 0.52, 9.6, 'metal', 'deck_stone'),

    // Planta 2 del Alcázar
    blk(15.6, 3.32, -3.0, 0.82, 2.4, 0.82, 'metal', 'pillar_stone'),
    blk(15.6, 3.32, 3.0, 0.82, 2.4, 0.82, 'metal', 'pillar_stone'),
    blk(19.4, 3.32, -3.0, 0.82, 2.4, 0.82, 'metal', 'pillar_stone'),
    blk(19.4, 3.32, 3.0, 0.82, 2.4, 0.82, 'metal', 'pillar_stone'),
    blk(15.6, 3.32, 0, 0.44, 2.4, 5.1, 'glass', 'window_glass'),
    blk(19.4, 3.32, 0, 0.78, 2.4, 5.1, 'stone', 'wall_stone'),
    blk(17.5, 3.32, -3.0, 2.94, 2.4, 0.76, 'metal', 'wall_stone'),
    blk(17.5, 3.32, 3.0, 2.94, 2.4, 0.76, 'metal', 'wall_stone'),
    blk(17.5, 5.72, 0, 4.9, 0.48, 7.2, 'metal', 'deck_stone'),

    // Planta 3: Salón del Trono
    blk(16.2, 6.2, -1.7, 0.68, 2.1, 0.68, 'stone', 'pillar_stone'),
    blk(16.2, 6.2, 1.7, 0.68, 2.1, 0.68, 'stone', 'pillar_stone'),
    blk(18.8, 6.2, -1.7, 0.68, 2.1, 0.68, 'stone', 'pillar_stone'),
    blk(18.8, 6.2, 1.7, 0.68, 2.1, 0.68, 'stone', 'pillar_stone'),
    blk(16.2, 6.2, 0, 0.42, 2.1, 2.68, 'glass', 'window_glass'),
    blk(18.8, 6.2, 0, 0.42, 2.1, 2.68, 'glass', 'window_glass'),
    blk(17.5, 8.3, 0, 3.6, 0.44, 4.4, 'metal', 'deck_stone'),

    // Planta 4: Corona Imperial
    blk(16.2, 8.74, -1.6, 0.62, 0.82, 0.62, 'metal', 'merlon'),
    blk(16.2, 8.74, 1.6, 0.62, 0.82, 0.62, 'metal', 'merlon'),
    blk(18.8, 8.74, -1.6, 0.62, 0.82, 0.62, 'metal', 'merlon'),
    blk(18.8, 8.74, 1.6, 0.62, 0.82, 0.62, 'metal', 'merlon'),
    blk(17.5, 8.74, 0, 1.65, 1.25, 1.65, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(17.5, 9.99, 0, 2.35, 1.55, 2.35, 'metal', 'roof_stone', { banner: 'crimson' }),
  ],
  [
    pig(8.4, 0, 0, 0.56, 'helmet'),
    pig(8.4, 0, -3.6, 0.54, 'grunt'),
    pig(8.4, 0, 3.6, 0.54, 'grunt'),
    pig(12.0, 0, 0, 0.58, 'helmet'),
    pig(17.5, 0, -2.0, 0.6, 'helmet'),
    pig(17.5, 0, 2.0, 0.6, 'helmet'),
    pig(17.5, 3.32, -1.3, 0.58, 'helmet'),
    pig(17.5, 3.32, 1.3, 0.58, 'grunt'),
    pig(17.5, 6.2, 0, 0.74, 'king'),
  ],
);
