import { blk, buildLevelDef, pig } from './helpers';

// Nivel 8 · Claustro en Herradura — Patio abierto hacia la honda entre dos alas y pabellón trasero
export default buildLevelDef(
  7,
  [
    // Ala izquierda (z = -3.8, x = 9.8..14.6)
    blk(9.8, 0, -4.65, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(9.8, 0, -2.95, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(14.6, 0, -4.65, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(14.6, 0, -2.95, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(12.2, 0, -4.65, 4.08, 2.5, 0.42, 'glass', 'window_glass'),
    blk(12.2, 0, -2.95, 4.08, 2.5, 0.42, 'glass', 'window_glass'),
    blk(9.8, 0, -3.8, 0.42, 2.5, 0.98, 'glass', 'window_glass'),
    blk(12.2, 2.5, -3.8, 5.6, 0.44, 2.5, 'wood', 'deck_wood'),
    blk(11.4, 2.94, -3.8, 3.2, 0.95, 2.25, 'wood', 'roof_wood', { banner: 'royal' }),
    blk(14.0, 2.94, -3.8, 1.18, 0.96, 1.18, 'glass', 'lantern_glass', { lanternGlow: true }),

    // Ala derecha (z = +3.8, x = 9.8..14.6)
    blk(9.8, 0, 2.95, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(9.8, 0, 4.65, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(14.6, 0, 2.95, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(14.6, 0, 4.65, 0.68, 2.5, 0.68, 'wood', 'pillar_wood'),
    blk(12.2, 0, 2.95, 4.08, 2.5, 0.42, 'glass', 'window_glass'),
    blk(12.2, 0, 4.65, 4.08, 2.5, 0.42, 'glass', 'window_glass'),
    blk(9.8, 0, 3.8, 0.42, 2.5, 0.98, 'glass', 'window_glass'),
    blk(12.2, 2.5, 3.8, 5.6, 0.44, 2.5, 'wood', 'deck_wood'),
    blk(11.4, 2.94, 3.8, 3.2, 0.95, 2.25, 'wood', 'roof_wood', { banner: 'royal' }),
    blk(14.0, 2.94, 3.8, 1.18, 0.96, 1.18, 'glass', 'lantern_glass', { lanternGlow: true }),

    // Pabellón trasero de dos plantas cerrando la herradura (x = 16.0..18.6)
    blk(16.0, 0, -4.3, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(16.0, 0, 0, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(16.0, 0, 4.3, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(18.6, 0, -4.3, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(18.6, 0, 0, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(18.6, 0, 4.3, 0.74, 2.7, 0.74, 'wood', 'pillar_wood'),
    blk(18.6, 0, -2.15, 0.42, 2.7, 3.52, 'glass', 'window_glass'),
    blk(18.6, 0, 2.15, 0.42, 2.7, 3.52, 'glass', 'window_glass'),
    blk(17.3, 0, -4.3, 1.82, 2.7, 0.42, 'glass', 'window_glass'),
    blk(17.3, 0, 4.3, 1.82, 2.7, 0.42, 'glass', 'window_glass'),
    blk(17.3, 2.7, 0, 3.5, 0.46, 9.5, 'wood', 'deck_wood'),

    // Segundo piso del santuario trasero
    blk(16.3, 3.16, -1.7, 0.62, 2.1, 0.62, 'wood', 'pillar_wood'),
    blk(16.3, 3.16, 1.7, 0.62, 2.1, 0.62, 'wood', 'pillar_wood'),
    blk(18.3, 3.16, -1.7, 0.62, 2.1, 0.62, 'wood', 'pillar_wood'),
    blk(18.3, 3.16, 1.7, 0.62, 2.1, 0.62, 'wood', 'pillar_wood'),
    blk(16.3, 3.16, 0, 0.42, 2.1, 2.74, 'glass', 'window_glass'),
    blk(18.3, 3.16, 0, 0.42, 2.1, 2.74, 'glass', 'window_glass'),
    blk(17.3, 5.26, 0, 2.9, 0.42, 4.2, 'wood', 'deck_wood'),
    blk(17.3, 5.68, 0, 1.4, 1.05, 1.4, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(17.3, 6.73, 0, 2.1, 0.98, 2.1, 'wood', 'roof_wood', { banner: 'crimson' }),
  ],
  [
    pig(12.2, 0, -3.8, 0.54, 'grunt'),
    pig(12.2, 0, 3.8, 0.54, 'grunt'),
    pig(12.6, 0, 0, 0.58, 'grunt'),
    pig(17.3, 0, -2.15, 0.58, 'helmet'),
    pig(17.3, 0, 2.15, 0.58, 'helmet'),
    pig(17.3, 3.16, 0, 0.68, 'king'),
  ],
);
