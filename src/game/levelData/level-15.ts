import { blk, buildLevelDef, pig } from './helpers';

// Nivel 15 · Búnker de Vigas de Hierro — Primer nivel con metal forjado sobre apoyos débiles de madera y cristal
export default buildLevelDef(
  14,
  [
    // Pilares blandos de madera en flancos y centro que sostienen el blindaje de acero superior
    blk(11.8, 0, -4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),
    blk(11.8, 0, 4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),
    blk(14.6, 0, -4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),
    blk(14.6, 0, -1.2, 0.76, 2.6, 0.76, 'wood', 'pillar_wood'),
    blk(14.6, 0, 1.2, 0.76, 2.6, 0.76, 'wood', 'pillar_wood'),
    blk(14.6, 0, 4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),
    blk(17.4, 0, -4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),
    blk(17.4, 0, 4.0, 0.78, 2.6, 0.78, 'wood', 'pillar_wood'),

    // Paños laterales de cristal (puntos débiles tácticos)
    blk(13.2, 0, -4.0, 1.98, 2.6, 0.42, 'glass', 'window_glass'),
    blk(16.0, 0, -4.0, 1.98, 2.6, 0.42, 'glass', 'window_glass'),
    blk(13.2, 0, 4.0, 1.98, 2.6, 0.42, 'glass', 'window_glass'),
    blk(16.0, 0, 4.0, 1.98, 2.6, 0.42, 'glass', 'window_glass'),

    // Escudos frontales y traseros de metal forjado con mirilla central de cristal
    blk(11.8, 0, -2.0, 0.92, 2.6, 2.4, 'metal', 'wall_stone'),
    blk(11.8, 0, 2.0, 0.92, 2.6, 2.4, 'metal', 'wall_stone'),
    blk(11.8, 0, 0, 0.44, 2.6, 1.54, 'glass', 'window_glass'),
    blk(10.85, 0, -2.4, 0.85, 2.2, 0.95, 'metal', 'buttress'),
    blk(10.85, 0, 2.4, 0.85, 2.2, 0.95, 'metal', 'buttress'),

    blk(17.4, 0, -2.0, 0.92, 2.6, 2.4, 'metal', 'wall_stone'),
    blk(17.4, 0, 2.0, 0.92, 2.6, 2.4, 'metal', 'wall_stone'),
    blk(17.4, 0, 0, 0.85, 2.6, 1.54, 'stone', 'wall_stone'),

    // Losa partida de techo blindado de metal (dos mitades para colapsos espectaculares)
    blk(14.6, 2.6, -2.22, 6.8, 0.56, 4.38, 'metal', 'deck_stone'),
    blk(14.6, 2.6, 2.22, 6.8, 0.56, 4.38, 'metal', 'deck_stone'),

    // Almenas frontales blindadas
    blk(11.6, 3.16, -3.6, 0.75, 0.85, 0.9, 'metal', 'merlon'),
    blk(11.6, 3.16, 3.6, 0.75, 0.85, 0.9, 'metal', 'merlon'),

    // Casamata superior de acero y visores acristalados
    blk(13.2, 3.16, -1.8, 0.78, 2.0, 0.78, 'metal', 'pillar_stone'),
    blk(13.2, 3.16, 1.8, 0.78, 2.0, 0.78, 'metal', 'pillar_stone'),
    blk(16.0, 3.16, -1.8, 0.78, 2.0, 0.78, 'metal', 'pillar_stone'),
    blk(16.0, 3.16, 1.8, 0.78, 2.0, 0.78, 'metal', 'pillar_stone'),
    blk(13.2, 3.16, 0, 0.72, 2.0, 2.76, 'metal', 'wall_stone'),
    blk(16.0, 3.16, 0, 0.72, 2.0, 2.76, 'metal', 'wall_stone'),
    blk(14.6, 3.16, -1.8, 1.98, 2.0, 0.44, 'glass', 'window_glass'),
    blk(14.6, 3.16, 1.8, 1.98, 2.0, 0.44, 'glass', 'window_glass'),
    blk(14.6, 5.16, 0, 3.8, 0.5, 4.5, 'metal', 'deck_stone'),

    // Corona superior
    blk(13.2, 5.66, -1.8, 0.68, 0.8, 0.68, 'metal', 'merlon'),
    blk(13.2, 5.66, 1.8, 0.68, 0.8, 0.68, 'metal', 'merlon'),
    blk(16.0, 5.66, -1.8, 0.68, 0.8, 0.68, 'metal', 'merlon'),
    blk(16.0, 5.66, 1.8, 0.68, 0.8, 0.68, 'metal', 'merlon'),
    blk(14.6, 5.66, 0, 1.35, 1.0, 1.35, 'glass', 'lantern_glass', { lanternGlow: true }),
  ],
  [
    pig(13.2, 0, -2.5, 0.58, 'helmet'),
    pig(13.2, 0, 2.5, 0.58, 'helmet'),
    pig(16.0, 0, -2.5, 0.58, 'grunt'),
    pig(16.0, 0, 2.5, 0.58, 'grunt'),
    pig(10.0, 0, 0, 0.56, 'grunt'),
    pig(14.6, 3.16, 0, 0.7, 'king'),
    pig(17.1, 3.16, 0, 0.56, 'helmet'),
  ],
);
