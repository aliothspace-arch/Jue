import { blk, buildLevelDef, pig } from './helpers';

// Nivel 4 · Atalaya del Carpintero — Torre estrecha y muy esbelta de 3 cuerpos en madera pura
export default buildLevelDef(
  3,
  [
    // Base compacta reforzada con cajas perimetrales (x = 13.0..15.4, z = -1.4..+1.4)
    blk(13.1, 0, -1.3, 0.86, 2.5, 0.86, 'wood', 'pillar_wood'),
    blk(13.1, 0, 1.3, 0.86, 2.5, 0.86, 'wood', 'pillar_wood'),
    blk(15.3, 0, -1.3, 0.86, 2.5, 0.86, 'wood', 'pillar_wood'),
    blk(15.3, 0, 1.3, 0.86, 2.5, 0.86, 'wood', 'pillar_wood'),
    blk(12.2, 0, -1.3, 0.96, 0.96, 0.96, 'wood', 'crate'),
    blk(12.2, 0, 1.3, 0.96, 0.96, 0.96, 'wood', 'crate'),
    blk(16.2, 0, 0, 0.98, 0.98, 1.8, 'wood', 'crate'),

    // Cuerpo 1 techo-plataforma (y = 2.5..2.98)
    blk(14.2, 2.5, 0, 3.4, 0.48, 3.7, 'wood', 'deck_wood'),

    // Cuerpo 2 más estrecho (y = 2.98..5.28)
    blk(13.3, 2.98, -1.1, 0.74, 2.3, 0.74, 'wood', 'pillar_wood'),
    blk(13.3, 2.98, 1.1, 0.74, 2.3, 0.74, 'wood', 'pillar_wood'),
    blk(15.1, 2.98, -1.1, 0.74, 2.3, 0.74, 'wood', 'pillar_wood'),
    blk(15.1, 2.98, 1.1, 0.74, 2.3, 0.74, 'wood', 'pillar_wood'),
    blk(14.2, 5.28, 0, 2.9, 0.46, 3.1, 'wood', 'deck_wood'),

    // Cuerpo 3 mirador alto + aguja de madera (y = 5.74..8.9)
    blk(13.55, 5.74, -0.85, 0.64, 1.85, 0.64, 'wood', 'pillar_wood'),
    blk(13.55, 5.74, 0.85, 0.64, 1.85, 0.64, 'wood', 'pillar_wood'),
    blk(14.85, 5.74, -0.85, 0.64, 1.85, 0.64, 'wood', 'pillar_wood'),
    blk(14.85, 5.74, 0.85, 0.64, 1.85, 0.64, 'wood', 'pillar_wood'),
    blk(14.2, 7.59, 0, 2.4, 0.42, 2.6, 'wood', 'deck_wood'),
    blk(14.2, 8.01, 0, 2.1, 1.05, 2.1, 'wood', 'roof_wood', { banner: 'crimson' }),

    // Empalizada baja delantera
    blk(10.0, 0, 0, 0.58, 1.6, 2.4, 'wood', 'palisade'),
  ],
  [
    pig(14.2, 0, 0, 0.58, 'grunt'),
    pig(14.2, 2.98, 0, 0.58, 'helmet'),
    pig(14.2, 5.74, 0, 0.56, 'grunt'),
    pig(11.3, 0, 0, 0.54, 'grunt'),
  ],
);
