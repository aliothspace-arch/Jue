import { blk, buildLevelDef, pig } from './helpers';

// Nivel 14 · Doble Muralla y Foso — Barbacana avanzada, foso abierto y ciudadela de tres cuerpos
export default buildLevelDef(
  13,
  [
    // Barbacana avanzada de sillería (x = 9.1)
    blk(9.1, 0, -3.1, 1.25, 2.8, 2.2, 'stone', 'wall_stone'),
    blk(9.1, 0, 3.1, 1.25, 2.8, 2.2, 'stone', 'wall_stone'),
    blk(9.1, 0, -1.6, 1.15, 2.3, 0.78, 'stone', 'pillar_stone'),
    blk(9.1, 0, 1.6, 1.15, 2.3, 0.78, 'stone', 'pillar_stone'),
    blk(9.1, 2.3, 0, 1.15, 1.45, 3.6, 'stone', 'arch_stone'),
    blk(8.05, 0, -3.1, 0.85, 2.2, 0.9, 'stone', 'buttress'),
    blk(8.05, 0, 3.1, 0.85, 2.2, 0.9, 'stone', 'buttress'),
    blk(9.1, 2.8, -3.3, 0.9, 0.82, 1.0, 'stone', 'merlon'),
    blk(9.1, 2.8, 3.3, 0.9, 0.82, 1.0, 'stone', 'merlon'),
    blk(9.1, 3.75, 0, 0.9, 0.82, 1.3, 'stone', 'merlon'),

    // Ciudadela trasera tras foso de 3.8 m (x = 14.6..18.2)
    blk(14.6, 0, -3.6, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(14.6, 0, 0, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(14.6, 0, 3.6, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(18.2, 0, -3.6, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(18.2, 0, 0, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(18.2, 0, 3.6, 0.88, 2.8, 0.88, 'stone', 'pillar_stone'),
    blk(14.6, 0, -1.8, 0.78, 2.8, 2.68, 'stone', 'wall_stone'),
    blk(14.6, 0, 1.8, 0.78, 2.8, 2.68, 'stone', 'wall_stone'),
    blk(18.2, 0, -1.8, 0.78, 2.8, 2.68, 'stone', 'wall_stone'),
    blk(18.2, 0, 1.8, 0.78, 2.8, 2.68, 'stone', 'wall_stone'),
    blk(16.4, 0, -3.6, 2.68, 2.8, 0.44, 'glass', 'window_glass'),
    blk(16.4, 0, 3.6, 2.68, 2.8, 0.44, 'glass', 'window_glass'),
    blk(16.4, 2.8, 0, 4.6, 0.48, 8.2, 'stone', 'deck_stone'),

    // Segundo nivel de la ciudadela
    blk(15.0, 3.28, -2.4, 0.76, 2.4, 0.76, 'stone', 'pillar_stone'),
    blk(15.0, 3.28, 2.4, 0.76, 2.4, 0.76, 'stone', 'pillar_stone'),
    blk(17.8, 3.28, -2.4, 0.76, 2.4, 0.76, 'stone', 'pillar_stone'),
    blk(17.8, 3.28, 2.4, 0.76, 2.4, 0.76, 'stone', 'pillar_stone'),
    blk(15.0, 3.28, 0, 0.42, 2.4, 4.0, 'glass', 'window_glass'),
    blk(17.8, 3.28, 0, 0.42, 2.4, 4.0, 'glass', 'window_glass'),
    blk(16.4, 3.28, -2.4, 2.0, 2.4, 0.72, 'stone', 'wall_stone'),
    blk(16.4, 3.28, 2.4, 2.0, 2.4, 0.72, 'stone', 'wall_stone'),
    blk(16.4, 5.68, 0, 3.8, 0.46, 5.8, 'stone', 'deck_stone'),

    // Corona almenada
    blk(15.0, 6.14, -2.3, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(15.0, 6.14, 2.3, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(17.8, 6.14, -2.3, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(17.8, 6.14, 2.3, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(16.4, 6.14, 0, 2.3, 1.35, 3.2, 'stone', 'roof_stone', { banner: 'crimson' }),
  ],
  [
    pig(9.1, 0, 0, 0.56, 'helmet'),
    pig(11.8, 0, -1.9, 0.56, 'grunt'),
    pig(11.8, 0, 1.9, 0.56, 'grunt'),
    pig(16.4, 0, -1.8, 0.6, 'helmet'),
    pig(16.4, 0, 1.8, 0.6, 'helmet'),
    pig(16.4, 3.28, 0, 0.7, 'king'),
    pig(16.4, 3.28, -3.45, 0.54, 'grunt'),
  ],
);
