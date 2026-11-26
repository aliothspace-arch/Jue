import { blk, buildLevelDef, pig } from './helpers';

// Nivel 11 · Bastión Asimétrico en L — Torreón masivo de granito a la izquierda y corral de madera a la derecha
export default buildLevelDef(
  10,
  [
    // Flanco izquierdo (z < 0): Torreón masivo de tres cuerpos en granito (x = 12.8..16.0)
    blk(12.8, 0, -4.4, 0.86, 2.6, 0.86, 'stone', 'pillar_stone'),
    blk(12.8, 0, -1.2, 0.86, 2.6, 0.86, 'stone', 'pillar_stone'),
    blk(16.0, 0, -4.4, 0.86, 2.6, 0.86, 'stone', 'pillar_stone'),
    blk(16.0, 0, -1.2, 0.86, 2.6, 0.86, 'stone', 'pillar_stone'),
    blk(12.8, 0, -2.8, 0.78, 2.6, 2.3, 'stone', 'wall_stone'),
    blk(16.0, 0, -2.8, 0.78, 2.6, 2.3, 'stone', 'wall_stone'),
    blk(14.4, 0, -4.4, 2.3, 2.6, 0.78, 'stone', 'wall_stone'),
    blk(14.4, 0, -1.2, 2.3, 2.6, 0.42, 'glass', 'window_glass'),
    blk(11.9, 0, -4.4, 0.88, 2.3, 0.86, 'stone', 'buttress'),
    blk(14.4, 2.6, -2.8, 4.4, 0.46, 4.4, 'stone', 'deck_stone'),

    // Segundo cuerpo del torreón izquierdo
    blk(13.1, 3.06, -4.1, 0.72, 2.2, 0.72, 'stone', 'pillar_stone'),
    blk(13.1, 3.06, -1.5, 0.72, 2.2, 0.72, 'stone', 'pillar_stone'),
    blk(15.7, 3.06, -4.1, 0.72, 2.2, 0.72, 'stone', 'pillar_stone'),
    blk(15.7, 3.06, -1.5, 0.72, 2.2, 0.72, 'stone', 'pillar_stone'),
    blk(13.1, 3.06, -2.8, 0.42, 2.2, 1.84, 'glass', 'window_glass'),
    blk(15.7, 3.06, -2.8, 0.42, 2.2, 1.84, 'glass', 'window_glass'),
    blk(14.4, 5.26, -2.8, 3.8, 0.44, 3.8, 'stone', 'deck_stone'),

    // Almenas y tejado del torreón
    blk(13.0, 5.7, -4.2, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(13.0, 5.7, -1.4, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(15.8, 5.7, -4.2, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(15.8, 5.7, -1.4, 0.62, 0.82, 0.62, 'stone', 'merlon'),
    blk(14.4, 5.7, -2.8, 2.2, 1.35, 2.2, 'stone', 'roof_stone', { banner: 'crimson' }),

    // Flanco derecho (z > 0): Empalizada baja y cobertizo de madera y cristal
    blk(11.4, 0, 2.8, 0.56, 1.85, 3.2, 'wood', 'palisade'),
    blk(12.6, 0, 3.9, 0.92, 0.92, 0.92, 'wood', 'crate'),
    blk(12.6, 0.92, 3.9, 0.84, 0.84, 0.84, 'wood', 'crate'),
    blk(14.0, 0, 1.5, 0.66, 2.2, 0.66, 'wood', 'pillar_wood'),
    blk(14.0, 0, 4.3, 0.66, 2.2, 0.66, 'wood', 'pillar_wood'),
    blk(16.4, 0, 1.5, 0.66, 2.2, 0.66, 'wood', 'pillar_wood'),
    blk(16.4, 0, 4.3, 0.66, 2.2, 0.66, 'wood', 'pillar_wood'),
    blk(14.0, 0, 2.9, 0.42, 2.2, 2.1, 'glass', 'window_glass'),
    blk(15.2, 2.2, 2.9, 3.3, 0.4, 3.6, 'wood', 'deck_wood'),
    blk(15.2, 2.6, 2.9, 1.25, 1.0, 1.25, 'glass', 'lantern_glass', { lanternGlow: true }),
  ],
  [
    pig(14.4, 0, -2.8, 0.58, 'helmet'),
    pig(14.4, 3.06, -2.8, 0.68, 'king'),
    pig(12.6, 0, 2.2, 0.56, 'grunt'),
    pig(15.2, 0, 2.9, 0.58, 'helmet'),
    pig(11.8, 0, -0.1, 0.54, 'grunt'),
    pig(15.2, 0, 0.2, 0.56, 'grunt'),
  ],
);
