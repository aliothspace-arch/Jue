import { blk, buildLevelDef, pig } from './helpers';

// Nivel 10 · Acueducto del Desfiladero — Alta arcada lineal de cuatro arcos de granito y galería superior
export default buildLevelDef(
  9,
  [
    // Cinco pilastras de granito alineadas en Z (x = 14.2)
    blk(14.2, 0, -4.8, 1.45, 3.2, 0.92, 'stone', 'pillar_stone'),
    blk(14.2, 0, -2.4, 1.45, 3.2, 0.92, 'stone', 'pillar_stone'),
    blk(14.2, 0, 0, 1.45, 3.2, 0.92, 'stone', 'pillar_stone'),
    blk(14.2, 0, 2.4, 1.45, 3.2, 0.92, 'stone', 'pillar_stone'),
    blk(14.2, 0, 4.8, 1.45, 3.2, 0.92, 'stone', 'pillar_stone'),

    // Contrafuertes exteriores estabilizando los extremos
    blk(13.0, 0, -4.8, 0.9, 2.2, 0.92, 'stone', 'buttress'),
    blk(13.0, 0, 4.8, 0.9, 2.2, 0.92, 'stone', 'buttress'),

    // Cuatro arcos románicos de piedra coronando los vanos (y = 3.2..4.8)
    blk(14.2, 3.2, -3.6, 1.4, 1.6, 2.35, 'stone', 'arch_stone'),
    blk(14.2, 3.2, -1.2, 1.4, 1.6, 2.35, 'stone', 'arch_stone'),
    blk(14.2, 3.2, 1.2, 1.4, 1.6, 2.35, 'stone', 'arch_stone'),
    blk(14.2, 3.2, 3.6, 1.4, 1.6, 2.35, 'stone', 'arch_stone'),

    // Calzada continua del acueducto
    blk(14.2, 4.8, 0, 1.95, 0.48, 11.2, 'stone', 'deck_stone'),

    // Galería acristalada superior
    blk(14.2, 5.28, -3.6, 0.62, 1.75, 0.62, 'wood', 'pillar_wood'),
    blk(14.2, 5.28, -1.2, 0.62, 1.75, 0.62, 'wood', 'pillar_wood'),
    blk(14.2, 5.28, 1.2, 0.62, 1.75, 0.62, 'wood', 'pillar_wood'),
    blk(14.2, 5.28, 3.6, 0.62, 1.75, 0.62, 'wood', 'pillar_wood'),
    blk(14.2, 5.28, -2.4, 0.42, 1.75, 1.74, 'glass', 'window_glass'),
    blk(14.2, 5.28, 0, 0.42, 1.75, 1.74, 'glass', 'window_glass'),
    blk(14.2, 5.28, 2.4, 0.42, 1.75, 1.74, 'glass', 'window_glass'),
    blk(14.2, 7.03, 0, 1.85, 0.38, 8.4, 'wood', 'deck_wood'),
    blk(14.2, 7.41, -2.6, 1.8, 1.0, 2.6, 'stone', 'roof_stone', { banner: 'royal' }),
    blk(14.2, 7.41, 0, 1.25, 1.05, 1.25, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.2, 7.41, 2.6, 1.8, 1.0, 2.6, 'stone', 'roof_stone', { banner: 'royal' }),
  ],
  [
    pig(14.2, 0, -3.6, 0.56, 'grunt'),
    pig(14.2, 0, -1.2, 0.58, 'helmet'),
    pig(14.2, 0, 1.2, 0.58, 'helmet'),
    pig(14.2, 0, 3.6, 0.56, 'grunt'),
    pig(14.2, 5.28, -4.65, 0.55, 'grunt'),
    pig(14.2, 5.28, 4.65, 0.66, 'king'),
  ],
);
