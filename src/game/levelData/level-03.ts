import { blk, buildLevelDef, pig } from './helpers';

// Nivel 3 · Pasarela del Aserradero — Caballetes desiguales en eje X unidos por puente de vigas
export default buildLevelDef(
  2,
  [
    // Caballete delantero bajo (x = 9.4..11.6, y = 0..2.2)
    blk(9.6, 0, -1.9, 0.76, 2.2, 0.76, 'wood', 'pillar_wood'),
    blk(9.6, 0, 1.9, 0.76, 2.2, 0.76, 'wood', 'pillar_wood'),
    blk(11.4, 0, -1.9, 0.76, 2.2, 0.76, 'wood', 'pillar_wood'),
    blk(11.4, 0, 1.9, 0.76, 2.2, 0.76, 'wood', 'pillar_wood'),
    blk(10.5, 2.2, 0, 2.8, 0.45, 4.7, 'wood', 'deck_wood'),

    // Caballete trasero más alto (x = 15.8..18.0)
    blk(16.0, 0, -1.9, 0.82, 2.2, 0.82, 'wood', 'pillar_wood'),
    blk(16.0, 0, 1.9, 0.82, 2.2, 0.82, 'wood', 'pillar_wood'),
    blk(17.8, 0, -1.9, 0.82, 2.2, 0.82, 'wood', 'pillar_wood'),
    blk(17.8, 0, 1.9, 0.82, 2.2, 0.82, 'wood', 'pillar_wood'),
    blk(16.9, 2.2, 0, 2.8, 0.45, 4.7, 'wood', 'deck_wood'),

    // Pasarela larga de vigas y tablero tendida entre ambos caballetes (y = 2.65..3.55)
    blk(13.7, 2.65, -1.3, 7.6, 0.45, 0.82, 'wood', 'beam_wood'),
    blk(13.7, 2.65, 1.3, 7.6, 0.45, 0.82, 'wood', 'beam_wood'),
    blk(13.7, 3.1, 0, 7.8, 0.44, 3.7, 'wood', 'deck_wood'),

    // Segundo piso asimétrico únicamente sobre la torre trasera (y = 3.54..6.6)
    blk(16.1, 3.54, -1.35, 0.72, 2.0, 0.72, 'wood', 'pillar_wood'),
    blk(16.1, 3.54, 1.35, 0.72, 2.0, 0.72, 'wood', 'pillar_wood'),
    blk(17.6, 3.54, -1.35, 0.72, 2.0, 0.72, 'wood', 'pillar_wood'),
    blk(17.6, 3.54, 1.35, 0.72, 2.0, 0.72, 'wood', 'pillar_wood'),
    blk(16.85, 5.54, 0, 2.6, 0.44, 3.5, 'wood', 'deck_wood'),
    blk(16.85, 5.98, 0, 2.2, 0.95, 2.8, 'wood', 'roof_wood', { banner: 'royal' }),

    // Cajas de aserradero bajo la pasarela
    blk(13.7, 0, -1.5, 1.0, 1.0, 1.0, 'wood', 'crate'),
    blk(13.7, 0, 1.5, 1.0, 1.0, 1.0, 'wood', 'crate'),
  ],
  [
    pig(10.5, 0, 0, 0.56, 'grunt'),
    pig(13.7, 0, 0, 0.58, 'grunt'),
    pig(13.7, 3.54, 0, 0.6, 'helmet'),
    pig(16.85, 3.54, 0, 0.6, 'helmet'),
  ],
);
