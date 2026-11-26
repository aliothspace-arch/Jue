import { blk, buildLevelDef, pig } from './helpers';

// Nivel 7 · Pirámide de Cristal — Tres terrazas escalonadas con núcleo traslúcido
export default buildLevelDef(
  6,
  [
    // Nivel 1: Anillo perimetral amplio de madera y grandes paños de cristal (x = 10.6..17.8, z = -3.4..+3.4)
    blk(10.6, 0, -3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),
    blk(10.6, 0, 0, 0.7, 2.2, 0.7, 'wood', 'pillar_wood'),
    blk(10.6, 0, 3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),
    blk(14.2, 0, -3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),
    blk(14.2, 0, 3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),
    blk(17.8, 0, -3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),
    blk(17.8, 0, 0, 0.7, 2.2, 0.7, 'wood', 'pillar_wood'),
    blk(17.8, 0, 3.4, 0.75, 2.2, 0.75, 'wood', 'pillar_wood'),

    // Vitrales frontales y traseros
    blk(10.6, 0, -1.68, 0.42, 2.2, 2.62, 'glass', 'window_glass'),
    blk(10.6, 0, 1.68, 0.42, 2.2, 2.62, 'glass', 'window_glass'),
    blk(17.8, 0, -1.68, 0.42, 2.2, 2.62, 'glass', 'window_glass'),
    blk(17.8, 0, 1.68, 0.42, 2.2, 2.62, 'glass', 'window_glass'),

    // Vitrales laterales
    blk(12.4, 0, -3.4, 2.82, 2.2, 0.42, 'glass', 'window_glass'),
    blk(16.0, 0, -3.4, 2.82, 2.2, 0.42, 'glass', 'window_glass'),
    blk(12.4, 0, 3.4, 2.82, 2.2, 0.42, 'glass', 'window_glass'),
    blk(16.0, 0, 3.4, 2.82, 2.2, 0.42, 'glass', 'window_glass'),

    // Gran plataforma del primer escalón (y = 2.2..2.64)
    blk(14.2, 2.2, 0, 8.1, 0.44, 7.7, 'wood', 'deck_wood'),

    // Nivel 2: Pabellón central retranqueado (x = 12.2..16.2, z = -1.9..+1.9, y = 2.64..4.64)
    blk(12.2, 2.64, -1.9, 0.68, 2.0, 0.68, 'wood', 'pillar_wood'),
    blk(12.2, 2.64, 1.9, 0.68, 2.0, 0.68, 'wood', 'pillar_wood'),
    blk(16.2, 2.64, -1.9, 0.68, 2.0, 0.68, 'wood', 'pillar_wood'),
    blk(16.2, 2.64, 1.9, 0.68, 2.0, 0.68, 'wood', 'pillar_wood'),
    blk(12.2, 2.64, 0, 0.42, 2.0, 3.08, 'glass', 'window_glass'),
    blk(16.2, 2.64, 0, 0.42, 2.0, 3.08, 'glass', 'window_glass'),
    blk(14.2, 2.64, -1.9, 3.28, 2.0, 0.42, 'glass', 'window_glass'),
    blk(14.2, 2.64, 1.9, 3.28, 2.0, 0.42, 'glass', 'window_glass'),
    blk(14.2, 4.64, 0, 4.85, 0.42, 4.65, 'wood', 'deck_wood'),

    // Nivel 3: Cúpula farol de cristal en la cúspide
    blk(14.2, 5.06, 0, 1.95, 1.45, 1.95, 'glass', 'lantern_glass', { lanternGlow: true }),
    blk(14.2, 6.51, 0, 2.4, 1.05, 2.4, 'wood', 'roof_wood', { banner: 'crimson' }),
  ],
  [
    pig(12.4, 0, -1.5, 0.56, 'grunt'),
    pig(12.4, 0, 1.5, 0.56, 'grunt'),
    pig(16.0, 0, 0, 0.6, 'helmet'),
    pig(10.9, 2.64, 0, 0.52, 'grunt'),
    pig(14.2, 2.64, 0, 0.68, 'king'),
  ],
);
