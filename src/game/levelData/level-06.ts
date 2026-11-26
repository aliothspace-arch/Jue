import { blk, buildLevelDef, pig } from './helpers';

// Nivel 6 · Pérgola de los Faroles — Planta abierta en H con puente aéreo de cristal
export default buildLevelDef(
  5,
  [
    // Pórtico delantero transversal (x = 10.8, z = -4.0..+4.0)
    blk(10.8, 0, -3.8, 0.82, 2.9, 0.82, 'wood', 'pillar_wood'),
    blk(10.8, 0, -1.25, 0.78, 2.9, 0.78, 'wood', 'pillar_wood'),
    blk(10.8, 0, 1.25, 0.78, 2.9, 0.78, 'wood', 'pillar_wood'),
    blk(10.8, 0, 3.8, 0.82, 2.9, 0.82, 'wood', 'pillar_wood'),
    blk(10.8, 2.9, 0, 1.85, 0.48, 8.7, 'wood', 'deck_wood'),
    blk(10.8, 3.38, -3.4, 1.35, 1.0, 1.35, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(10.8, 3.38, 3.4, 1.35, 1.0, 1.35, 'glass', 'lantern_glass', { lanternGlow: true }),

    // Pórtico trasero transversal (x = 16.8, z = -4.0..+4.0)
    blk(16.8, 0, -3.8, 0.82, 2.9, 0.82, 'wood', 'pillar_wood'),
    blk(16.8, 0, -1.25, 0.78, 2.9, 0.78, 'wood', 'pillar_wood'),
    blk(16.8, 0, 1.25, 0.78, 2.9, 0.78, 'wood', 'pillar_wood'),
    blk(16.8, 0, 3.8, 0.82, 2.9, 0.82, 'wood', 'pillar_wood'),
    blk(16.8, 2.9, 0, 1.85, 0.48, 8.7, 'wood', 'deck_wood'),
    blk(16.8, 3.38, -3.4, 1.35, 1.0, 1.35, 'wood', 'roof_wood', { banner: 'royal' }),
    blk(16.8, 3.38, 3.4, 1.35, 1.0, 1.35, 'wood', 'roof_wood', { banner: 'royal' }),

    // Puente aéreo central en "H" de cristal y madera (z = 0, x = 11.7..15.9)
    blk(13.8, 3.38, -1.0, 5.6, 1.9, 0.46, 'glass', 'window_glass'),
    blk(13.8, 3.38, 1.0, 5.6, 1.9, 0.46, 'glass', 'window_glass'),
    blk(13.8, 5.28, 0, 4.8, 0.46, 2.9, 'wood', 'deck_wood'),
    blk(13.8, 5.74, 0, 1.7, 1.15, 1.7, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(13.8, 6.89, 0, 2.1, 0.98, 2.1, 'wood', 'roof_wood', { banner: 'crimson' }),
  ],
  [
    pig(10.8, 0, -2.5, 0.56, 'grunt'),
    pig(10.8, 0, 2.5, 0.56, 'grunt'),
    pig(16.8, 0, -2.5, 0.58, 'helmet'),
    pig(16.8, 0, 2.5, 0.58, 'helmet'),
    pig(13.8, 3.38, 0, 0.68, 'king'),
  ],
);
