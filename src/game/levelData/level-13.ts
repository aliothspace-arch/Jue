import { blk, buildLevelDef, pig } from './helpers';

// Nivel 13 · Abadía de las Tres Agujas — Nave catedralicia flanqueada por dos campanarios desiguales
export default buildLevelDef(
  12,
  [
    // Nave central catedralicia (x = 12.6..17.2, z = -1.85..+1.85)
    blk(12.6, 0, -1.85, 0.86, 3.2, 0.86, 'stone', 'pillar_stone'),
    blk(12.6, 0, 1.85, 0.86, 3.2, 0.86, 'stone', 'pillar_stone'),
    blk(17.2, 0, -1.85, 0.86, 3.2, 0.86, 'stone', 'pillar_stone'),
    blk(17.2, 0, 1.85, 0.86, 3.2, 0.86, 'stone', 'pillar_stone'),
    blk(12.6, 0, 0, 0.44, 3.2, 2.8, 'glass', 'window_glass'),
    blk(17.2, 0, 0, 0.44, 3.2, 2.8, 'glass', 'window_glass'),
    blk(14.9, 0, -1.85, 3.7, 3.2, 0.72, 'stone', 'wall_stone'),
    blk(14.9, 0, 1.85, 3.7, 3.2, 0.72, 'stone', 'wall_stone'),
    blk(14.9, 3.2, 0, 5.6, 0.48, 4.7, 'stone', 'deck_stone'),

    // Claristorio y aguja central
    blk(13.4, 3.68, -1.35, 0.62, 2.1, 0.62, 'stone', 'pillar_stone'),
    blk(13.4, 3.68, 1.35, 0.62, 2.1, 0.62, 'stone', 'pillar_stone'),
    blk(16.4, 3.68, -1.35, 0.62, 2.1, 0.62, 'stone', 'pillar_stone'),
    blk(16.4, 3.68, 1.35, 0.62, 2.1, 0.62, 'stone', 'pillar_stone'),
    blk(14.9, 3.68, -1.35, 2.34, 2.1, 0.42, 'glass', 'window_glass'),
    blk(14.9, 3.68, 1.35, 2.34, 2.1, 0.42, 'glass', 'window_glass'),
    blk(14.9, 5.78, 0, 3.9, 0.44, 3.6, 'stone', 'deck_stone'),
    blk(14.9, 6.22, 0, 1.85, 1.3, 1.85, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.9, 7.52, 0, 2.4, 1.45, 2.4, 'stone', 'roof_stone', { banner: 'crimson' }),

    // Campanario izquierdo alto (z = -4.5, 3 cuerpos)
    blk(13.6, 0, -5.4, 0.76, 2.8, 0.76, 'stone', 'pillar_stone'),
    blk(13.6, 0, -3.6, 0.76, 2.8, 0.76, 'stone', 'pillar_stone'),
    blk(16.2, 0, -5.4, 0.76, 2.8, 0.76, 'stone', 'pillar_stone'),
    blk(16.2, 0, -3.6, 0.76, 2.8, 0.76, 'stone', 'pillar_stone'),
    blk(13.6, 0, -4.5, 0.72, 2.8, 1.0, 'stone', 'wall_stone'),
    blk(14.9, 2.8, -4.5, 3.5, 0.44, 2.7, 'stone', 'deck_stone'),
    blk(13.9, 3.24, -5.25, 0.64, 2.4, 0.64, 'stone', 'pillar_stone'),
    blk(13.9, 3.24, -3.75, 0.64, 2.4, 0.64, 'stone', 'pillar_stone'),
    blk(15.9, 3.24, -5.25, 0.64, 2.4, 0.64, 'stone', 'pillar_stone'),
    blk(15.9, 3.24, -3.75, 0.64, 2.4, 0.64, 'stone', 'pillar_stone'),
    blk(14.9, 3.24, -5.25, 1.32, 2.4, 0.4, 'glass', 'window_glass'),
    blk(14.9, 3.24, -3.75, 1.32, 2.4, 0.4, 'glass', 'window_glass'),
    blk(14.9, 5.64, -4.5, 2.9, 0.4, 2.4, 'stone', 'deck_stone'),
    blk(14.9, 6.04, -4.5, 1.4, 1.1, 1.4, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.9, 7.14, -4.5, 2.0, 1.5, 2.0, 'stone', 'roof_stone', { banner: 'royal' }),

    // Campanario derecho bajo (z = +4.5, 2 cuerpos)
    blk(13.6, 0, 3.6, 0.76, 2.6, 0.76, 'stone', 'pillar_stone'),
    blk(13.6, 0, 5.4, 0.76, 2.6, 0.76, 'stone', 'pillar_stone'),
    blk(16.2, 0, 3.6, 0.76, 2.6, 0.76, 'stone', 'pillar_stone'),
    blk(16.2, 0, 5.4, 0.76, 2.6, 0.76, 'stone', 'pillar_stone'),
    blk(13.6, 0, 4.5, 0.42, 2.6, 1.0, 'glass', 'window_glass'),
    blk(14.9, 2.6, 4.5, 3.5, 0.44, 2.7, 'stone', 'deck_stone'),
    blk(14.9, 3.04, 4.5, 1.5, 1.25, 1.5, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.9, 4.29, 4.5, 2.2, 1.15, 2.2, 'wood', 'roof_wood', { banner: 'royal' }),
  ],
  [
    pig(14.2, 0, 0, 0.58, 'helmet'),
    pig(15.7, 0, 0, 0.56, 'grunt'),
    pig(14.9, 3.68, 0, 0.68, 'king'),
    pig(14.9, 0, -4.5, 0.56, 'grunt'),
    pig(14.9, 3.24, -4.5, 0.56, 'helmet'),
    pig(14.9, 0, 4.5, 0.56, 'grunt'),
    pig(11.3, 0, 0, 0.54, 'grunt'),
  ],
);
