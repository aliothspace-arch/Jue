import { blk, buildLevelDef, pig } from './helpers';

// Nivel 9 · Pórtico de Sillería — Primera muralla de piedra protegiendo patio interior de madera y cristal
export default buildLevelDef(
  8,
  [
    // Muralla frontal de sillería con gran arco románico central (x = 9.8)
    blk(9.8, 0, -3.25, 1.2, 3.2, 2.1, 'stone', 'wall_stone'),
    blk(9.8, 0, 3.25, 1.2, 3.2, 2.1, 'stone', 'wall_stone'),
    blk(9.8, 0, -1.75, 1.15, 2.6, 0.85, 'stone', 'pillar_stone'),
    blk(9.8, 0, 1.75, 1.15, 2.6, 0.85, 'stone', 'pillar_stone'),
    blk(9.8, 2.6, 0, 1.15, 1.45, 3.85, 'stone', 'arch_stone'),

    // Almenas y contrafuertes del pórtico frontal
    blk(9.8, 3.2, -3.3, 0.96, 0.9, 1.1, 'stone', 'merlon'),
    blk(9.8, 3.2, 3.3, 0.96, 0.9, 1.1, 'stone', 'merlon'),
    blk(9.8, 4.05, 0, 0.96, 0.85, 1.35, 'stone', 'merlon'),
    blk(8.75, 0, -3.25, 0.85, 2.5, 0.95, 'stone', 'buttress'),
    blk(8.75, 0, 3.25, 0.85, 2.5, 0.95, 'stone', 'buttress'),

    // Pabellón interior de madera y vitrales tras la muralla (x = 14.8..17.6)
    blk(14.8, 0, -2.8, 0.74, 2.6, 0.74, 'wood', 'pillar_wood'),
    blk(14.8, 0, 2.8, 0.74, 2.6, 0.74, 'wood', 'pillar_wood'),
    blk(17.6, 0, -2.8, 0.74, 2.6, 0.74, 'wood', 'pillar_wood'),
    blk(17.6, 0, 2.8, 0.74, 2.6, 0.74, 'wood', 'pillar_wood'),
    blk(14.8, 0, 0, 0.42, 2.6, 4.82, 'glass', 'window_glass'),
    blk(17.6, 0, 0, 0.42, 2.6, 4.82, 'glass', 'window_glass'),
    blk(16.2, 0, -2.8, 2.02, 2.6, 0.42, 'glass', 'window_glass'),
    blk(16.2, 0, 2.8, 2.02, 2.6, 0.42, 'glass', 'window_glass'),
    blk(16.2, 2.6, 0, 3.7, 0.44, 6.6, 'wood', 'deck_wood'),
    blk(16.2, 3.04, 0, 2.25, 1.45, 2.25, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(16.2, 4.49, 0, 2.75, 1.15, 2.75, 'wood', 'roof_wood', { banner: 'royal' }),
  ],
  [
    pig(9.8, 0, 0, 0.56, 'helmet'),
    pig(12.4, 0, -1.8, 0.56, 'grunt'),
    pig(12.4, 0, 1.8, 0.56, 'grunt'),
    pig(16.2, 0, -1.3, 0.58, 'helmet'),
    pig(16.2, 0, 1.3, 0.58, 'grunt'),
    pig(16.2, 3.04, -2.25, 0.64, 'king'),
  ],
);
