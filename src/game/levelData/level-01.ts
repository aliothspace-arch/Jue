import { blk, buildLevelDef, pig } from './helpers';

// Nivel 1 · Choza del Leñador — Cabaña baja y simple 100% en madera frágil
export default buildLevelDef(
  0,
  [
    // Cuatro postes de roble sobre el suelo (y = 0..2.1)
    blk(12.2, 0, -1.65, 0.7, 2.1, 0.7, 'wood', 'pillar_wood'),
    blk(12.2, 0, 1.65, 0.7, 2.1, 0.7, 'wood', 'pillar_wood'),
    blk(15.0, 0, -1.65, 0.7, 2.1, 0.7, 'wood', 'pillar_wood'),
    blk(15.0, 0, 1.65, 0.7, 2.1, 0.7, 'wood', 'pillar_wood'),

    // Largueros bajos laterales uniendo postes delanteros y traseros
    blk(13.6, 0, -1.65, 2.05, 0.56, 0.56, 'wood', 'beam_wood'),
    blk(13.6, 0, 1.65, 2.05, 0.56, 0.56, 'wood', 'beam_wood'),

    // Vigas transversales superiores y cubierta de madera
    blk(12.2, 2.1, 0, 0.78, 0.46, 4.1, 'wood', 'beam_wood'),
    blk(15.0, 2.1, 0, 0.78, 0.46, 4.1, 'wood', 'beam_wood'),
    blk(13.6, 2.56, 0, 3.9, 0.44, 4.1, 'wood', 'deck_wood'),
    blk(13.6, 3.0, 0, 3.2, 1.05, 3.4, 'wood', 'roof_wood', { banner: 'crimson' }),

    // Cajas de madera en porche delantero y retaguardia tocando postes para juntas estables
    blk(11.35, 0, -1.65, 0.92, 0.92, 0.92, 'wood', 'crate'),
    blk(11.35, 0, 1.65, 0.92, 0.92, 0.92, 'wood', 'crate'),
    blk(15.88, 0, -1.65, 0.96, 0.96, 0.96, 'wood', 'crate'),
    blk(15.88, 0.96, -1.65, 0.84, 0.84, 0.84, 'wood', 'crate'),
    blk(15.88, 0, 1.65, 0.96, 0.96, 0.96, 'wood', 'crate'),
  ],
  [
    pig(13.6, 0, 0, 0.58, 'grunt'),
    pig(10.1, 0, 0, 0.54, 'grunt'),
    pig(16.9, 0, 0, 0.56, 'grunt'),
  ],
);
