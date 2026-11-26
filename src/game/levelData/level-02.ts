import { blk, buildLevelDef, pig } from './helpers';

// Nivel 2 · Trinchera de Estacas — Barrera horizontal ancha en Z con dos cobertizos bajos
export default buildLevelDef(
  1,
  [
    // Línea frontal ancha de empalizadas de madera (z = -3.4, 0, +3.4)
    blk(9.6, 0, -3.3, 0.64, 1.9, 2.5, 'wood', 'palisade'),
    blk(9.6, 0, 0, 0.64, 1.9, 2.4, 'wood', 'palisade'),
    blk(9.6, 0, 3.3, 0.64, 1.9, 2.5, 'wood', 'palisade'),

    // Cobertizo izquierdo (z = -3.1)
    blk(12.2, 0, -4.3, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(14.8, 0, -4.3, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(12.2, 0, -1.9, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(14.8, 0, -1.9, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(13.5, 2.1, -3.1, 3.6, 0.46, 3.3, 'wood', 'deck_wood'),
    blk(13.5, 2.56, -3.1, 2.8, 0.95, 2.6, 'wood', 'roof_wood', { banner: 'crimson' }),

    // Cobertizo derecho (z = +3.1)
    blk(12.2, 0, 1.9, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(14.8, 0, 1.9, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(12.2, 0, 4.3, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(14.8, 0, 4.3, 0.72, 2.1, 0.72, 'wood', 'pillar_wood'),
    blk(13.5, 2.1, 3.1, 3.6, 0.46, 3.3, 'wood', 'deck_wood'),
    blk(13.5, 2.56, 3.1, 2.8, 0.95, 2.6, 'wood', 'roof_wood', { banner: 'crimson' }),

    // Trinchera central conectando ambos cobertizos en Z
    blk(13.5, 0, 0, 0.9, 0.75, 3.05, 'wood', 'beam_wood'),
    blk(13.5, 0.75, -0.7, 0.96, 0.96, 0.96, 'wood', 'crate'),
    blk(13.5, 0.75, 0.7, 0.96, 0.96, 0.96, 'wood', 'crate'),
  ],
  [
    pig(13.5, 0, -3.1, 0.56, 'grunt'),
    pig(13.5, 0, 3.1, 0.56, 'grunt'),
    pig(11.1, 0, 0, 0.56, 'grunt'),
    pig(15.6, 0, 0, 0.58, 'helmet'),
  ],
);
