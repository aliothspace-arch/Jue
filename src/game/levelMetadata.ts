import type { BirdType, Vec3 } from './types';

// Slingshot sits at (-15, 0, 0). Fortresses are built around (+6.8..+22.0, y, -6.2..+6.2).
export const SLINGSHOT_ORIGIN = { x: -15, y: 3.1, z: 0 };

export interface LevelMetadata {
  id: number;
  name: string;
  subtitle: string;
  chapter: string;
  materialLabel: string;
  birds: BirdType[];
  fortressCenter: Vec3;
  starThresholds: [number, number, number];
  pigCount: number;
}

export const LEVEL_METADATA: LevelMetadata[] = [
  {
    id: 1,
    name: 'Choza del Leñador',
    subtitle: 'Cabaña alpina baja de troncos de roble y cajas de provisiones',
    chapter: 'I · Campamento del Bosque',
    materialLabel: 'Madera Frágil',
    birds: ['red', 'red', 'red'],
    fortressCenter: { x: 13.6, y: 2.0, z: 0 },
    starThresholds: [14000, 22000, 30000],
    pigCount: 3,
  },
  {
    id: 2,
    name: 'Trinchera de Estacas',
    subtitle: 'Barrera ancha de empalizadas y dos cobertizos bajos en flanco',
    chapter: 'I · Campamento del Bosque',
    materialLabel: 'Madera Frágil',
    birds: ['red', 'red', 'yellow', 'red'],
    fortressCenter: { x: 12.6, y: 2.0, z: 0 },
    starThresholds: [18000, 28000, 38000],
    pigCount: 4,
  },
  {
    id: 3,
    name: 'Pasarela del Aserradero',
    subtitle: 'Caballete delantero bajo y torreón trasero unidos por puente de vigas',
    chapter: 'I · Campamento del Bosque',
    materialLabel: 'Madera Frágil',
    birds: ['red', 'yellow', 'red', 'yellow'],
    fortressCenter: { x: 13.8, y: 2.8, z: 0 },
    starThresholds: [20000, 31000, 41000],
    pigCount: 4,
  },
  {
    id: 4,
    name: 'Atalaya del Carpintero',
    subtitle: 'Torre esbelta de tres cuerpos en madera pura sobre base estrecha',
    chapter: 'II · Vigas y Cristales del Valle',
    materialLabel: 'Madera Alta',
    birds: ['red', 'yellow', 'red', 'yellow'],
    fortressCenter: { x: 14.2, y: 3.6, z: 0 },
    starThresholds: [21000, 33000, 44000],
    pigCount: 4,
  },
  {
    id: 5,
    name: 'Invernadero del Prado',
    subtitle: 'Nave diáfana de grandes vitrales entre marcos ligeros de madera',
    chapter: 'II · Vigas y Cristales del Valle',
    materialLabel: 'Madera y Cristal',
    birds: ['yellow', 'yellow', 'red', 'red'],
    fortressCenter: { x: 14.0, y: 2.6, z: 0 },
    starThresholds: [23000, 36000, 48000],
    pigCount: 5,
  },
  {
    id: 6,
    name: 'Pérgola de los Faroles',
    subtitle: 'Columnata en H con pórticos de roble y puente elevado de cristal',
    chapter: 'II · Vigas y Cristales del Valle',
    materialLabel: 'Cristal y Roble',
    birds: ['yellow', 'red', 'yellow', 'black', 'red'],
    fortressCenter: { x: 13.8, y: 3.2, z: 0 },
    starThresholds: [26000, 40000, 54000],
    pigCount: 5,
  },
  {
    id: 7,
    name: 'Pirámide de Cristal',
    subtitle: 'Silueta escalonada de tres terrazas con núcleo traslúcido central',
    chapter: 'III · Pabellones de Cristal',
    materialLabel: 'Cristal y Madera',
    birds: ['yellow', 'yellow', 'red', 'black', 'yellow'],
    fortressCenter: { x: 14.2, y: 3.3, z: 0 },
    starThresholds: [28000, 43000, 57000],
    pigCount: 5,
  },
  {
    id: 8,
    name: 'Claustro en Herradura',
    subtitle: 'Patio interior en U abierta hacia la honda con alas acristaladas',
    chapter: 'III · Pabellones de Cristal',
    materialLabel: 'Vitral y Roble',
    birds: ['yellow', 'black', 'yellow', 'red', 'red'],
    fortressCenter: { x: 14.4, y: 3.0, z: 0 },
    starThresholds: [31000, 47000, 62000],
    pigCount: 6,
  },
  {
    id: 9,
    name: 'Pórtico de Sillería',
    subtitle: 'Muralla frontal de piedra con gran arco románico sobre patio de madera',
    chapter: 'III · Pabellones de Cristal',
    materialLabel: 'Piedra y Madera',
    birds: ['yellow', 'red', 'black', 'yellow', 'red'],
    fortressCenter: { x: 14.0, y: 3.1, z: 0 },
    starThresholds: [33000, 49000, 65000],
    pigCount: 6,
  },
  {
    id: 10,
    name: 'Acueducto del Desfiladero',
    subtitle: 'Alta arcada lineal de cuatro arcos de granito y galería superior',
    chapter: 'IV · Bastiones de Granito',
    materialLabel: 'Arcos de Piedra',
    birds: ['black', 'yellow', 'black', 'red', 'yellow'],
    fortressCenter: { x: 14.2, y: 3.8, z: 0 },
    starThresholds: [36000, 53000, 70000],
    pigCount: 6,
  },
  {
    id: 11,
    name: 'Bastión Asimétrico en L',
    subtitle: 'Torreón masivo en el flanco izquierdo y corral de madera a la derecha',
    chapter: 'IV · Bastiones de Granito',
    materialLabel: 'Granito y Roble',
    birds: ['black', 'yellow', 'black', 'yellow', 'red'],
    fortressCenter: { x: 14.4, y: 3.5, z: 0 },
    starThresholds: [38000, 56000, 74000],
    pigCount: 6,
  },
  {
    id: 12,
    name: 'Fortaleza en Cascada',
    subtitle: 'Tres terrazas escalonadas ascendentes desde la vanguardia hasta el torreón',
    chapter: 'IV · Bastiones de Granito',
    materialLabel: 'Sillería y Vitral',
    birds: ['black', 'yellow', 'black', 'yellow', 'red', 'yellow'],
    fortressCenter: { x: 14.0, y: 3.6, z: 0 },
    starThresholds: [42000, 62000, 82000],
    pigCount: 7,
  },
  {
    id: 13,
    name: 'Abadía de las Tres Agujas',
    subtitle: 'Nave catedralicia central flanqueada por dos campanarios desiguales',
    chapter: 'V · Alcázares de la Cumbre',
    materialLabel: 'Granito y Vitral',
    birds: ['black', 'yellow', 'yellow', 'black', 'yellow', 'red'],
    fortressCenter: { x: 14.8, y: 4.1, z: 0 },
    starThresholds: [45000, 66000, 86000],
    pigCount: 7,
  },
  {
    id: 14,
    name: 'Doble Muralla y Foso',
    subtitle: 'Barbacana avanzada separada por foso abierto de la ciudadela trasera',
    chapter: 'V · Alcázares de la Cumbre',
    materialLabel: 'Granito Fortificado',
    birds: ['black', 'black', 'yellow', 'black', 'yellow', 'red'],
    fortressCenter: { x: 14.2, y: 3.8, z: 0 },
    starThresholds: [48000, 70000, 92000],
    pigCount: 7,
  },
  {
    id: 15,
    name: 'Búnker de Vigas de Hierro',
    subtitle: 'Techo y escudo frontal de metal forjado sobre apoyos de madera y cristal',
    chapter: 'V · Alcázares de la Cumbre',
    materialLabel: 'Metal y Madera',
    birds: ['black', 'yellow', 'black', 'yellow', 'red', 'black'],
    fortressCenter: { x: 14.6, y: 3.1, z: 0 },
    starThresholds: [52000, 76000, 98000],
    pigCount: 7,
  },
  {
    id: 16,
    name: 'Puente Colgante Blindado',
    subtitle: 'Dos pilones de granito y acero sosteniendo un palco central suspendido',
    chapter: 'VI · Ciudadelas de Acero Imperial',
    materialLabel: 'Metal y Granito',
    birds: ['black', 'yellow', 'black', 'black', 'yellow', 'red', 'black'],
    fortressCenter: { x: 14.8, y: 4.2, z: 0 },
    starThresholds: [56000, 82000, 108000],
    pigCount: 8,
  },
  {
    id: 17,
    name: 'Zigurat de Acero y Granito',
    subtitle: 'Mega pirámide de cuatro niveles con contrafuertes y armadura de acero',
    chapter: 'VI · Ciudadelas de Acero Imperial',
    materialLabel: 'Acero y Sillería',
    birds: ['black', 'yellow', 'black', 'yellow', 'black', 'yellow', 'black'],
    fortressCenter: { x: 15.2, y: 4.3, z: 0 },
    starThresholds: [62000, 90000, 118000],
    pigCount: 8,
  },
  {
    id: 18,
    name: 'Gran Ciudadela Imperial',
    subtitle: 'Tres anillos defensivos: puerta gemela de acero, patio arcado y alcázar de cuatro plantas',
    chapter: 'VI · Ciudadelas de Acero Imperial',
    materialLabel: 'Acero Imperial',
    birds: ['black', 'black', 'yellow', 'black', 'yellow', 'black', 'red', 'black'],
    fortressCenter: { x: 15.0, y: 4.6, z: 0 },
    starThresholds: [72000, 102000, 136000],
    pigCount: 9,
  },
];

export const LEVEL_COUNT = LEVEL_METADATA.length;

export function computeStars(score: number, thresholds: [number, number, number]): number {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}
