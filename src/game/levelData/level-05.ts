import { blk, buildLevelDef, pig } from './helpers';

// Nivel 5 · Invernadero del Prado — Gran nave ancha de 1 piso con vitrales y armazón de madera
export default buildLevelDef(
  4,
  [
    // Columnata perimetral de roble sosteniendo los ventanales (z = -4.2, -1.4, +1.4, +4.2)
    blk(11.8, 0, -4.2, 0.78, 2.8, 0.78, 'wood', 'pillar_wood'),
    blk(11.8, 0, -1.4, 0.72, 2.8, 0.72, 'wood', 'pillar_wood'),
    blk(11.8, 0, 1.4, 0.72, 2.8, 0.72, 'wood', 'pillar_wood'),
    blk(11.8, 0, 4.2, 0.78, 2.8, 0.78, 'wood', 'pillar_wood'),

    blk(16.2, 0, -4.2, 0.78, 2.8, 0.78, 'wood', 'pillar_wood'),
    blk(16.2, 0, -1.4, 0.72, 2.8, 0.72, 'wood', 'pillar_wood'),
    blk(16.2, 0, 1.4, 0.72, 2.8, 0.72, 'wood', 'pillar_wood'),
    blk(16.2, 0, 4.2, 0.78, 2.8, 0.78, 'wood', 'pillar_wood'),

    // Tres grandes vitrales frontales y traseros + vitrales laterales (efecto invernadero diáfano)
    blk(11.8, 0, -2.8, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(11.8, 0, 0, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(11.8, 0, 2.8, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(16.2, 0, -2.8, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(16.2, 0, 0, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(16.2, 0, 2.8, 0.44, 2.8, 2.05, 'glass', 'window_glass'),
    blk(14.0, 0, -4.2, 3.55, 2.8, 0.46, 'glass', 'window_glass'),
    blk(14.0, 0, 4.2, 3.55, 2.8, 0.46, 'glass', 'window_glass'),

    // Techumbre ligera de madera con claraboyas de cristal y fanal central
    blk(14.0, 2.8, -2.25, 5.4, 0.48, 4.4, 'wood', 'deck_wood'),
    blk(14.0, 2.8, 2.25, 5.4, 0.48, 4.4, 'wood', 'deck_wood'),
    blk(14.0, 3.28, -2.7, 2.4, 0.95, 2.2, 'wood', 'roof_wood'),
    blk(14.0, 3.28, 2.7, 2.4, 0.95, 2.2, 'wood', 'roof_wood'),
    blk(14.0, 3.28, 0, 1.85, 1.25, 1.85, 'glass', 'lantern_glass', { lanternGlow: true }),
  ],
  [
    pig(14.0, 0, -2.8, 0.56, 'grunt'),
    pig(14.0, 0, 0, 0.62, 'helmet'),
    pig(14.0, 0, 2.8, 0.56, 'grunt'),
    pig(14.0, 3.28, -1.3, 0.52, 'grunt'),
    pig(14.0, 3.28, 1.3, 0.52, 'grunt'),
  ],
);
