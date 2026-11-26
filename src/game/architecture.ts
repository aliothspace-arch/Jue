import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BlockBlueprint, BlockMaterialType, BlockRole } from './types';
import type { TextureLibrary } from './textures';

export interface DamageUniforms {
  uDamage: { value: number };
  uImpactLocal: { value: THREE.Vector3 };
}

export interface BatchDamageSurface {
  texture: THREE.DataTexture;
  data: Float32Array;
  maxInstances: number;
  setBlockState: (
    instanceId: number,
    damage: number,
    ix: number,
    iy: number,
    iz: number,
    hitFlash: number,
    wearShade: number,
  ) => void;
  clear: () => void;
  dispose: () => void;
}

export function createBatchDamageSurface(maxInstances = 128): BatchDamageSurface {
  const cap = Math.max(8, maxInstances);
  const data = new Float32Array(cap * 2 * 4);
  // Initialize row 1 wearShade = 1.0
  for (let i = 0; i < cap; i++) {
    data[(cap + i) * 4 + 1] = 1.0;
  }
  const texture = new THREE.DataTexture(data, cap, 2, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    data,
    maxInstances: cap,
    setBlockState: (instanceId, damage, ix, iy, iz, hitFlash, wearShade) => {
      if (instanceId < 0 || instanceId >= cap) return;
      const r0 = instanceId * 4;
      const r1 = (cap + instanceId) * 4;
      if (
        data[r0] !== damage ||
        data[r0 + 1] !== ix ||
        data[r0 + 2] !== iy ||
        data[r0 + 3] !== iz ||
        data[r1] !== hitFlash ||
        data[r1 + 1] !== wearShade
      ) {
        data[r0] = damage;
        data[r0 + 1] = ix;
        data[r0 + 2] = iy;
        data[r0 + 3] = iz;
        data[r1] = hitFlash;
        data[r1 + 1] = wearShade;
        texture.needsUpdate = true;
      }
    },
    clear: () => {
      data.fill(0);
      for (let i = 0; i < cap; i++) {
        data[(cap + i) * 4 + 1] = 1.0;
      }
      texture.needsUpdate = true;
    },
    dispose: () => {
      texture.dispose();
    },
  };
}

export interface ArchitecturalMaterialSet {
  wood: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshStandardMaterial;
  woodBatchSurface: BatchDamageSurface;
  stoneBatchSurface: BatchDamageSurface;
  glassBatchSurface: BatchDamageSurface;
  metalBatchSurface: BatchDamageSurface;
  ironTrim: THREE.MeshStandardMaterial;
  darkWoodTrim: THREE.MeshStandardMaterial;
  stoneTrim: THREE.MeshStandardMaterial;
  glassFrame: THREE.MeshStandardMaterial;
  slateRoof: THREE.MeshStandardMaterial;
  bannerCrimson: THREE.MeshStandardMaterial;
  bannerRoyal: THREE.MeshStandardMaterial;
  emberGlow: THREE.MeshStandardMaterial;
  uTime: { value: number };
  dispose: () => void;
}

export interface DetailedBlockVisual {
  group: THREE.Group;
  primaryMat: THREE.MeshStandardMaterial;
  damageUniforms: DamageUniforms;
  geometries: THREE.BufferGeometry[];
}

const ARCH_SHADER_HELPERS = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}

float archValueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

// Returns vec2(minDist, secondMinDist - minDist) for Voronoi crack ridge detection
vec2 voronoiCrack3D(vec3 x) {
  vec3 n = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = hash33(n + g);
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  return vec2(sqrt(max(0.0001, d1)), sqrt(max(0.0001, d2)) - sqrt(max(0.0001, d1)));
}
`;

export function enhanceBlockMaterialWithDamage<T extends THREE.MeshStandardMaterial>(
  mat: T,
  matType: BlockMaterialType,
  batchSurface?: BatchDamageSurface,
): DamageUniforms {
  const uniforms: DamageUniforms = {
    uDamage: { value: 0.0 },
    uImpactLocal: { value: new THREE.Vector3(0, 0, 0) },
  };
  const typeCode = matType === 'wood' ? 0 : matType === 'stone' ? 1 : matType === 'metal' ? 3 : 2;
  mat.userData.damageUniforms = uniforms;
  mat.customProgramCacheKey = () => `arch-block-damage-v4-${typeCode}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDamage = uniforms.uDamage;
    shader.uniforms.uImpactLocal = uniforms.uImpactLocal;
    shader.uniforms.uBatchDamageTex = { value: batchSurface ? batchSurface.texture : null };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uDamage;
        uniform vec3 uImpactLocal;
        uniform sampler2D uBatchDamageTex;
        varying vec3 vDmgLocalPos;
        varying vec3 vDmgWorldPos;
        varying vec3 vDmgWorldNorm;
        varying vec4 vDmgState;
        varying vec2 vDmgFX;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDmgLocalPos = position;
        #ifdef USE_BATCHING
          int archInstId = int(getIndirectIndex(gl_DrawID));
          vDmgState = texelFetch(uBatchDamageTex, ivec2(archInstId, 0), 0);
          vDmgFX = texelFetch(uBatchDamageTex, ivec2(archInstId, 1), 0).xy;
          vec4 archWp = modelMatrix * batchingMatrix * vec4(transformed, 1.0);
          vDmgWorldNorm = normalize(mat3(modelMatrix) * mat3(batchingMatrix) * objectNormal);
        #else
          vDmgState = vec4(uDamage, uImpactLocal);
          vDmgFX = vec2(0.0, 1.0);
          vec4 archWp = modelMatrix * vec4(transformed, 1.0);
          vDmgWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vDmgWorldPos = archWp.xyz;`,
      );

    const weatherFrag =
      typeCode === 0
        ? /* glsl */ `
          diffuseColor.rgb *= vDmgFX.y;
          // World-space alpine weathering on oak timber: damp dark base, subtle sunlit top patina
          float wNoise = archValueNoise(vDmgWorldPos * 1.65) * 0.65 + archValueNoise(vDmgWorldPos * 4.4) * 0.35;
          float dampBase = smoothstep(1.15, 0.05, vDmgWorldPos.y) * (0.45 + wNoise * 0.55);
          diffuseColor.rgb *= mix(1.0, 0.66, dampBase * 0.72);
          float mossLow = smoothstep(0.68, 0.05, vDmgWorldPos.y) * smoothstep(0.46, 0.76, wNoise);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.21, 0.09), mossLow * 0.42);
          float topSun = smoothstep(0.68, 0.96, vDmgWorldNorm.y) * smoothstep(0.35, 0.75, wNoise);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.09, 1.02), topSun * 0.22);
        `
        : typeCode === 1
          ? /* glsl */ `
            diffuseColor.rgb *= vDmgFX.y;
            // World-space alpine masonry weathering: basal moss, dampness, upward limestone lichen & variation
            float wNoise = archValueNoise(vDmgWorldPos * 1.15) * 0.6 + archValueNoise(vDmgWorldPos * 3.4) * 0.4;
            float dampBase = smoothstep(1.45, 0.06, vDmgWorldPos.y);
            diffuseColor.rgb *= mix(1.0, 0.72, dampBase * (0.45 + wNoise * 0.4));
            float mossMask = smoothstep(1.25, 0.08, vDmgWorldPos.y) * smoothstep(0.42, 0.72, wNoise);
            float upMoss = smoothstep(0.62, 0.94, vDmgWorldNorm.y) * smoothstep(0.54, 0.82, wNoise);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.11), clamp(mossMask * 0.62 + upMoss * 0.22, 0.0, 0.68));
            // Subtle warm mineral blotching across fortress scale so no two stones look stamped
            diffuseColor.rgb *= 0.91 + wNoise * 0.17;
          `
          : typeCode === 3
            ? /* glsl */ `
              diffuseColor.rgb *= vDmgFX.y;
              // Forged steel armor weathering: brushed-steel sheen + subtle oiled gunmetal base
              float mNoise = archValueNoise(vDmgWorldPos * 2.2) * 0.65 + archValueNoise(vDmgWorldPos * 6.0) * 0.35;
              float oilBase = smoothstep(1.1, 0.05, vDmgWorldPos.y) * (0.4 + mNoise * 0.5);
              diffuseColor.rgb *= mix(1.0, 0.84, oilBase * 0.45);
              float edgeSheen = smoothstep(0.45, 0.95, abs(vDmgWorldNorm.y) + 0.3) * smoothstep(0.38, 0.82, mNoise);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.89, 0.95), edgeSheen * 0.36);
            `
            : '';

    const crackFrag =
      typeCode === 0
        ? /* glsl */ `
          // Wood: anisotropic longitudinal stress splits + exposed light sapwood fibers
          if (vDmgState.x > 0.02) {
            float dmgVal = vDmgState.x;
            float impactDist = length(vDmgLocalPos - vDmgState.yzw);
            float localMask = clamp(1.22 - impactDist * 0.26 + dmgVal * 0.74, 0.0, 1.0);
            vec3 woodCoord = vec3(vDmgLocalPos.x * 1.45, vDmgLocalPos.y * 5.2, vDmgLocalPos.z * 5.2);
            vec2 vor = voronoiCrack3D(woodCoord + vec3(0.0, sin(vDmgLocalPos.x * 3.5) * 0.35, 0.0));
            float thresh = mix(0.018, 0.155, dmgVal) * localMask;
            float splitMask = 1.0 - smoothstep(thresh * 0.32, thresh + 0.025, vor.y);
            float fiberLip = (1.0 - smoothstep(thresh, thresh + 0.095, vor.y)) * (1.0 - splitMask);
            float fiberGrain = 0.85 + 0.15 * sin(vDmgLocalPos.x * 46.0 + vDmgLocalPos.y * 18.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.68, 0.44) * fiberGrain, fiberLip * 0.78 * dmgVal);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.05, 0.025), splitMask * 0.90);
          }`
        : typeCode === 1
          ? /* glsl */ `
            // Stone: deep jagged Voronoi structural fissures + pale freshly fractured limestone spall lips
            if (vDmgState.x > 0.02) {
              float dmgVal = vDmgState.x;
              float impactDist = length(vDmgLocalPos - vDmgState.yzw);
              float localMask = clamp(1.25 - impactDist * 0.24 + dmgVal * 0.78, 0.0, 1.0);
              vec3 stCoord = vDmgLocalPos * 2.9 + vec3(sin(vDmgLocalPos.y * 7.0), cos(vDmgLocalPos.z * 7.0), sin(vDmgLocalPos.x * 7.0)) * 0.13;
              vec2 vor = voronoiCrack3D(stCoord);
              float thresh = mix(0.018, 0.17, dmgVal) * localMask;
              float fissure = 1.0 - smoothstep(thresh * 0.26, thresh + 0.02, vor.y);
              float spallLip = (1.0 - smoothstep(thresh, thresh + 0.09, vor.y)) * (1.0 - fissure);
              diffuseColor.rgb += vec3(0.18, 0.17, 0.15) * spallLip * dmgVal;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.06, 0.07), fissure * 0.88);
            }`
          : typeCode === 3
            ? /* glsl */ `
              // Metal: scorched blast craters + bright gouged steel fatigue creases around impact
              if (vDmgState.x > 0.02) {
                float dmgVal = vDmgState.x;
                float impactDist = length(vDmgLocalPos - vDmgState.yzw);
                float localMask = clamp(1.25 - impactDist * 0.28 + dmgVal * 0.76, 0.0, 1.0);
                vec3 mtCoord = vDmgLocalPos * 3.4 + vec3(sin(vDmgLocalPos.y * 8.0), cos(vDmgLocalPos.z * 8.0), 0.0) * 0.1;
                vec2 vor = voronoiCrack3D(mtCoord);
                float thresh = mix(0.015, 0.145, dmgVal) * localMask;
                float crease = 1.0 - smoothstep(thresh * 0.25, thresh + 0.018, vor.y);
                float brightEdge = (1.0 - smoothstep(thresh, thresh + 0.08, vor.y)) * (1.0 - crease);
                float scorch = smoothstep(1.35, 0.08, impactDist) * dmgVal * 0.62;
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.07, 0.07), scorch);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.94), brightEdge * 0.72 * dmgVal);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.045, 0.055), crease * 0.85);
              }`
            : /* glsl */ `
              // Glass: crisp radial + concentric spiderweb fracture lines radiating from impact
              if (vDmgState.x > 0.02) {
                float dmgVal = vDmgState.x;
                vec3 d = vDmgLocalPos - vDmgState.yzw;
                float r = length(d);
                float ang = atan(d.y + d.z * 0.45, d.x + d.z * 0.75);
                float spoke = abs(sin(ang * 7.5 + sin(r * 6.5) * 0.55));
                float spokeLine = 1.0 - smoothstep(0.02, 0.068 + dmgVal * 0.06, spoke);
                float ring = abs(fract(r * 2.7) - 0.5) * 2.0;
                float ringLine = 1.0 - smoothstep(0.03, 0.085 + dmgVal * 0.055, 1.0 - ring);
                float web = max(spokeLine, ringLine * 0.85) * clamp(1.25 - r * 0.22 + dmgVal * 0.65, 0.0, 1.0);
                float webStrength = web * clamp(dmgVal * 1.4, 0.0, 1.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.99, 1.0), webStrength * 0.94);
                diffuseColor.a = clamp(diffuseColor.a + webStrength * 0.48, 0.0, 0.98);
              }`;

    const roughPatch =
      typeCode === 2
        ? `if (vDmgState.x > 0.05) { roughnessFactor = clamp(roughnessFactor + vDmgState.x * 0.22, 0.04, 0.55); }`
        : typeCode === 3
          ? `if (vDmgState.x > 0.05) { roughnessFactor = clamp(roughnessFactor + vDmgState.x * 0.18, 0.16, 0.85); }`
          : `if (vDmgState.x > 0.05) { roughnessFactor = clamp(roughnessFactor + vDmgState.x * 0.14, 0.1, 1.0); }`;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDmgLocalPos;
        varying vec3 vDmgWorldPos;
        varying vec3 vDmgWorldNorm;
        varying vec4 vDmgState;
        varying vec2 vDmgFX;
        ${ARCH_SHADER_HELPERS}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${weatherFrag}
        ${crackFrag}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        ${roughPatch}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (vDmgFX.x > 0.005) {
          totalEmissiveRadiance += vec3(1.0, 0.92, 0.72) * (vDmgFX.x * 0.95);
        }`,
      );
  };

  return uniforms;
}

function createHeraldicBannerTexture(variant: 'crimson' | 'royal'): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const primary = variant === 'crimson' ? '#7c1a1c' : '#1b355c';
  const primaryDark = variant === 'crimson' ? '#4f0f12' : '#10203a';
  const gold = '#d4a64a';
  const goldBright = '#f0cc75';

  // Rich woven linen base gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, primaryDark);
  grad.addColorStop(0.25, primary);
  grad.addColorStop(0.85, primary);
  grad.addColorStop(1, primaryDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle woven fabric linen crosshatch
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.fillStyle = 'rgba(255,245,220,0.04)';
  for (let x = 0; x < w; x += 4) {
    ctx.fillRect(x, 0, 1, h);
  }

  // Ornate gold border trim
  ctx.strokeStyle = gold;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.strokeStyle = goldBright;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // Medieval heraldic chevron & crown/tower crest emblem
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(24, 150);
  ctx.lineTo(w * 0.5, 112);
  ctx.lineTo(w - 24, 150);
  ctx.lineTo(w - 24, 174);
  ctx.lineTo(w * 0.5, 136);
  ctx.lineTo(24, 174);
  ctx.closePath();
  ctx.fill();

  // Central heraldic crown/emblem diamond
  ctx.fillStyle = goldBright;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 50);
  ctx.lineTo(w * 0.5 + 22, 82);
  ctx.lineTo(w * 0.5, 106);
  ctx.lineTo(w * 0.5 - 22, 82);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = primaryDark;
  ctx.beginPath();
  ctx.arc(w * 0.5, 80, 9, 0, Math.PI * 2);
  ctx.fill();

  // Bottom weathered fringe shading
  const dirtGrad = ctx.createLinearGradient(0, h * 0.72, 0, h);
  dirtGrad.addColorStop(0, 'rgba(18,14,10,0)');
  dirtGrad.addColorStop(1, 'rgba(18,14,10,0.45)');
  ctx.fillStyle = dirtGrad;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWavingBannerMaterial(
  variant: 'crimson' | 'royal',
  uTime: { value: number },
): { mat: THREE.MeshStandardMaterial; tex: THREE.CanvasTexture } {
  const tex = createHeraldicBannerTexture(variant);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.86,
    metalness: 0.08,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
  });
  mat.customProgramCacheKey = () => `heraldic-banner-wind-${variant}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Pin top edge (uv.y = 1.0) to crossbar; flutter lower banner cleanly in alpine wind
        float hang = clamp(1.0 - uv.y, 0.0, 1.0);
        float flutter = hang * hang;
        float w1 = sin(uTime * 3.8 - hang * 5.6 + position.x * 2.2) * 0.11;
        float w2 = cos(uTime * 6.4 - hang * 9.5 + position.z * 3.1) * 0.035;
        transformed.z += (w1 + w2) * flutter;
        transformed.x += (w1 * 0.35 + 0.05) * flutter;`,
      );
  };
  return { mat, tex };
}

export function createArchitecturalMaterials(
  textures: TextureLibrary,
  isSoftwareGl: boolean,
): ArchitecturalMaterialSet {
  const uTime = { value: 0 };

  const woodBatchSurface = createBatchDamageSurface(128);
  const stoneBatchSurface = createBatchDamageSurface(128);
  const glassBatchSurface = createBatchDamageSurface(64);
  const metalBatchSurface = createBatchDamageSurface(128);

  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.wood.map,
    roughnessMap: textures.wood.roughnessMap,
    normalMap: textures.wood.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.84,
    metalness: 0.02,
    envMapIntensity: 0.46,
  });
  enhanceBlockMaterialWithDamage(wood, 'wood', woodBatchSurface);

  const stone = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stone.map,
    roughnessMap: textures.stone.roughnessMap,
    normalMap: textures.stone.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.9,
    metalness: 0.04,
    envMapIntensity: 0.44,
  });
  enhanceBlockMaterialWithDamage(stone, 'stone', stoneBatchSurface);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xd8eef7,
    map: textures.glass.map,
    roughnessMap: textures.glass.roughnessMap,
    normalMap: textures.glass.normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.06,
    metalness: 0.06,
    ior: 1.52,
    reflectivity: 0.96,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    specularIntensity: 1.0,
    specularColor: new THREE.Color(0xeef8ff),
    transmission: 0,
    transparent: true,
    opacity: isSoftwareGl ? 0.62 : 0.54,
    envMapIntensity: 1.75,
  });
  enhanceBlockMaterialWithDamage(glass, 'glass', glassBatchSurface);

  const metal = new THREE.MeshStandardMaterial({
    color: 0xdce4ef,
    map: textures.iron.map,
    roughnessMap: textures.iron.roughnessMap,
    normalMap: textures.iron.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.28,
    metalness: 0.72,
    envMapIntensity: 1.5,
  });
  enhanceBlockMaterialWithDamage(metal, 'metal', metalBatchSurface);

  const ironTrim = new THREE.MeshStandardMaterial({
    color: 0xbec4cc,
    map: textures.iron.map,
    roughnessMap: textures.iron.roughnessMap,
    normalMap: textures.iron.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.56,
    metalness: 0.86,
    envMapIntensity: 0.92,
  });

  const darkWoodTrim = new THREE.MeshStandardMaterial({
    color: 0xc2a88c,
    map: textures.slingshotWood.map,
    roughnessMap: textures.slingshotWood.roughnessMap,
    normalMap: textures.slingshotWood.normalMap,
    normalScale: new THREE.Vector2(0.82, 0.82),
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.42,
  });

  const stoneTrim = new THREE.MeshStandardMaterial({
    color: 0xc8c3ba,
    map: textures.stone.map,
    roughnessMap: textures.stone.roughnessMap,
    normalMap: textures.stone.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.92,
    metalness: 0.03,
    envMapIntensity: 0.4,
  });

  const glassFrame = new THREE.MeshStandardMaterial({
    color: 0x9aa2ab,
    map: textures.iron.map,
    roughnessMap: textures.iron.roughnessMap,
    normalMap: textures.iron.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.5,
    metalness: 0.82,
    envMapIntensity: 0.95,
  });

  const slateRoof = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.slate.map,
    roughnessMap: textures.slate.roughnessMap,
    normalMap: textures.slate.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.82,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });

  const crimson = createWavingBannerMaterial('crimson', uTime);
  const royal = createWavingBannerMaterial('royal', uTime);

  const emberGlow = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff6210,
    emissiveIntensity: 3.1,
    roughness: 0.35,
    metalness: 0.0,
  });
  emberGlow.customProgramCacheKey = () => 'watchtower-brazier-ember';
  emberGlow.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flicker = 0.82 + 0.18 * sin(uTime * 11.3) + 0.1 * sin(uTime * 23.7);
        totalEmissiveRadiance *= flicker;`,
      );
  };

  return {
    wood,
    stone,
    glass,
    metal,
    woodBatchSurface,
    stoneBatchSurface,
    glassBatchSurface,
    metalBatchSurface,
    ironTrim,
    darkWoodTrim,
    stoneTrim,
    glassFrame,
    slateRoof,
    bannerCrimson: crimson.mat,
    bannerRoyal: royal.mat,
    emberGlow,
    uTime,
    dispose: () => {
      wood.dispose();
      stone.dispose();
      glass.dispose();
      metal.dispose();
      woodBatchSurface.dispose();
      stoneBatchSurface.dispose();
      glassBatchSurface.dispose();
      metalBatchSurface.dispose();
      ironTrim.dispose();
      darkWoodTrim.dispose();
      stoneTrim.dispose();
      glassFrame.dispose();
      slateRoof.dispose();
      crimson.mat.dispose();
      crimson.tex.dispose();
      royal.mat.dispose();
      royal.tex.dispose();
      emberGlow.dispose();
    },
  };
}

// --- Geometry Normalization & World-Scale Planar UV Mapping ---

function applyWorldScaleBoxUVs(geo: THREE.BufferGeometry, tileSize: number): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  if (!nonIndexed.attributes.normal) {
    nonIndexed.computeVertexNormals();
  }
  const pos = nonIndexed.attributes.position as THREE.BufferAttribute;
  const norm = nonIndexed.attributes.normal as THREE.BufferAttribute;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  const invTile = 1 / Math.max(0.1, tileSize);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    let u = 0;
    let v = 0;
    if (ny >= nx && ny >= nz) {
      u = x * invTile;
      v = z * invTile;
    } else if (nx >= ny && nx >= nz) {
      u = z * invTile;
      v = y * invTile;
    } else {
      u = x * invTile;
      v = y * invTile;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  nonIndexed.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  // Strip extra attributes so mergeGeometries never mismatches
  for (const key of Object.keys(nonIndexed.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') {
      nonIndexed.deleteAttribute(key);
    }
  }
  return nonIndexed;
}

function mergeBucket(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  return merged;
}

export function createBeveledBlockGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const bevel = Math.min(0.045, Math.min(w, h, d) * 0.11);
  const iw = Math.max(0.02, w - bevel * 2);
  const ih = Math.max(0.02, h - bevel * 2);
  const id = Math.max(0.02, d - bevel * 2);

  const shape = new THREE.Shape();
  shape.moveTo(-iw * 0.5, -ih * 0.5);
  shape.lineTo(iw * 0.5, -ih * 0.5);
  shape.lineTo(iw * 0.5, ih * 0.5);
  shape.lineTo(-iw * 0.5, ih * 0.5);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: id,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function createRomanesqueArchGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Arch opening runs along the widest horizontal span (x if w >= d, else z)
  const spanAlongX = w >= d;
  const span = spanAlongX ? w : d;
  const depth = spanAlongX ? d : w;
  const bevel = Math.min(0.032, depth * 0.08);
  const halfS = span * 0.5;
  const halfH = h * 0.5;

  const legW = Math.max(0.24, span * 0.2);
  const archR = Math.max(0.2, halfS - legW);
  const springY = Math.min(halfH - archR - 0.16, -halfH + h * 0.46);

  const shape = new THREE.Shape();
  shape.moveTo(-halfS, -halfH);
  shape.lineTo(-archR, -halfH);
  shape.lineTo(-archR, springY);
  shape.absarc(0, springY, archR, Math.PI, 0, true);
  shape.lineTo(archR, -halfH);
  shape.lineTo(halfS, -halfH);
  shape.lineTo(halfS, halfH);
  shape.lineTo(-halfS, halfH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.08, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.center();
  if (!spanAlongX) {
    geo.rotateY(Math.PI * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

function createPitchedRoofGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Pitched alpine gable/hipped roof rising cleanly from the full base footprint
  const eaveH = Math.min(h * 0.24, 0.18);
  const ridgeAlongX = w >= d * 1.18;
  const ridgeAlongZ = d >= w * 1.18;

  if (ridgeAlongX || ridgeAlongZ) {
    const span = ridgeAlongX ? d : w;
    const len = ridgeAlongX ? w : d;
    const shape = new THREE.Shape();
    shape.moveTo(-span * 0.5, -h * 0.5);
    shape.lineTo(span * 0.5, -h * 0.5);
    shape.lineTo(span * 0.5, -h * 0.5 + eaveH);
    shape.lineTo(0, h * 0.5);
    shape.lineTo(-span * 0.5, -h * 0.5 + eaveH);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: len,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 1,
    });
    geo.center();
    if (ridgeAlongX) {
      geo.rotateY(Math.PI * 0.5);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Square/near-square tower: true 4-sided pitched alpine hipped pyramid roof
  const topR = 0.06;
  const baseR = Math.hypot(w, d) * 0.5;
  const pyramid = new THREE.CylinderGeometry(topR, baseR, h, 4, 1);
  pyramid.rotateY(Math.PI * 0.25);
  const scaleX = w / (baseR * Math.SQRT2);
  const scaleZ = d / (baseR * Math.SQRT2);
  pyramid.scale(scaleX, 1, scaleZ);
  pyramid.computeVertexNormals();
  return pyramid;
}

function createBatteredButtressGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Sculpted stepped & tapered medieval stone buttress (tapers gracefully upward from full base)
  const taperTop = 0.62;
  const baseR = Math.SQRT2 * 0.5;
  const geo = new THREE.CylinderGeometry(baseR * taperTop, baseR, h, 4, 1);
  geo.rotateY(Math.PI * 0.25);
  geo.scale(w, 1, d);
  geo.computeVertexNormals();
  return geo;
}

export function inferBlockRole(bp: BlockBlueprint): BlockRole {
  if (bp.role) return bp.role;
  const { w, h, d, material } = bp;
  if (material === 'glass') {
    if (Math.abs(w - d) < 0.45 && w >= 1.1 && h <= 1.4) return 'lantern_glass';
    return 'window_glass';
  }
  const isPillar = h >= w * 1.55 && h >= d * 1.55;
  const isFlatDeck = h <= 0.78 && (w >= 2.6 || d >= 2.6);
  const isCrate = !isPillar && !isFlatDeck && w <= 1.35 && h <= 1.35 && d <= 1.35;
  if (material === 'wood') {
    if (isPillar) return 'pillar_wood';
    if (isFlatDeck) return w >= 2.2 && d >= 2.2 ? 'deck_wood' : 'beam_wood';
    if (isCrate) return 'crate';
    return 'beam_wood';
  }
  // stone or metal
  if (isPillar) return 'pillar_stone';
  if (isFlatDeck) return 'deck_stone';
  if (w <= 1.0 && h <= 1.0 && d <= 1.0) return 'merlon';
  if (h <= 1.0 && w <= 1.7 && d <= 1.7) return 'plinth';
  return 'wall_stone';
}

type BucketKey =
  | 'primary'
  | 'stoneTrim'
  | 'darkWood'
  | 'iron'
  | 'glassFrame'
  | 'slate'
  | 'ember';

export interface CachedBlockPrototype {
  key: string;
  material: BlockMaterialType;
  buckets: Partial<Record<BucketKey, THREE.BufferGeometry>>;
  bannerCloth: THREE.BufferGeometry | null;
  bannerVariant: 'crimson' | 'royal' | null;
}

function buildBlockPrototypeGeometries(bp: BlockBlueprint, key: string): CachedBlockPrototype {
  const { w, h, d, material } = bp;
  const role = inferBlockRole(bp);

  const buckets: Record<BucketKey, THREE.BufferGeometry[]> = {
    primary: [],
    stoneTrim: [],
    darkWood: [],
    iron: [],
    glassFrame: [],
    slate: [],
    ember: [],
  };

  const tileSizes: Record<BucketKey, number> = {
    primary: material === 'stone' ? 2.15 : material === 'wood' ? 1.85 : material === 'metal' ? 1.45 : 1.5,
    stoneTrim: 1.9,
    darkWood: 1.65,
    iron: 1.2,
    glassFrame: 1.2,
    slate: 1.35,
    ember: 1.0,
  };

  const pushGeo = (
    bucket: BucketKey,
    geo: THREE.BufferGeometry,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    if (rx !== 0) geo.rotateX(rx);
    if (ry !== 0) geo.rotateY(ry);
    if (rz !== 0) geo.rotateZ(rz);
    if (px !== 0 || py !== 0 || pz !== 0) geo.translate(px, py, pz);
    const uvGeo = applyWorldScaleBoxUVs(geo, tileSizes[bucket]);
    if (uvGeo !== geo) geo.dispose();
    buckets[bucket].push(uvGeo);
  };

  const addBox = (
    bucket: BucketKey,
    bw: number,
    bh: number,
    bd: number,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    pushGeo(bucket, new THREE.BoxGeometry(bw, bh, bd), px, py, pz, rx, ry, rz);
  };

  const addBevel = (
    bucket: BucketKey,
    bw: number,
    bh: number,
    bd: number,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    pushGeo(bucket, createBeveledBlockGeometry(bw, bh, bd), px, py, pz, rx, ry, rz);
  };

  const addRivetsOnFace = (
    xs: number[],
    ys: number[],
    zs: number[],
    size = 0.042,
  ) => {
    for (const rx of xs) {
      for (const ry of ys) {
        for (const rz of zs) {
          addBox('iron', size, size, size, rx, ry, rz);
        }
      }
    }
  };

  // --- Sculpted Medieval-Alpine Architectural Geometry per Role ---

  switch (role) {
    case 'plinth': {
      // Stepped rusticated foundation: wider lower footing, chamfered water-table, upper ashlar course
      const lowerH = h * 0.42;
      const upperH = h * 0.58;
      addBevel('stoneTrim', w + 0.14, lowerH, d + 0.14, 0, -h * 0.5 + lowerH * 0.5, 0);
      addBevel('primary', w * 0.98, upperH, d * 0.98, 0, h * 0.5 - upperH * 0.5, 0);
      // Water-table drip molding
      addBevel('stoneTrim', w + 0.08, 0.1, d + 0.08, 0, -h * 0.5 + lowerH + 0.03, 0);
      // Forged iron corner anchor plates
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox('iron', 0.16, 0.14, 0.16, sx * (w * 0.5 - 0.02), h * 0.5 - 0.12, sz * (d * 0.5 - 0.02));
        }
      }
      break;
    }

    case 'pillar_stone': {
      // Moulded Attic stone pier: stepped base, ashlar shaft, astragal collar, corbelled capital, iron ties
      const baseH = Math.min(0.28, h * 0.14);
      const capH = Math.min(0.28, h * 0.14);
      const shaftH = Math.max(0.2, h - baseH - capH);
      addBevel('stoneTrim', w + 0.16, baseH * 0.65, d + 0.16, 0, -h * 0.5 + baseH * 0.325, 0);
      addBevel('stoneTrim', w + 0.07, baseH * 0.42, d + 0.07, 0, -h * 0.5 + baseH * 0.82, 0);
      addBevel('primary', w * 0.94, shaftH, d * 0.94, 0, 0, 0);
      // Carved stone mid-course band
      if (h >= 2.2) {
        addBevel('stoneTrim', w + 0.05, 0.13, d + 0.05, 0, 0, 0);
      }
      // Astragal collar + stepped corbel capital
      addBevel('stoneTrim', w + 0.07, capH * 0.42, d + 0.07, 0, h * 0.5 - capH * 0.82, 0);
      addBevel('stoneTrim', w + 0.18, capH * 0.62, d + 0.18, 0, h * 0.5 - capH * 0.31, 0);
      // Forged-iron tie collar straps
      addBox('iron', w + 0.04, 0.075, d + 0.04, 0, h * 0.5 - capH - 0.14, 0);
      addBox('iron', w + 0.04, 0.075, d + 0.04, 0, -h * 0.5 + baseH + 0.14, 0);
      break;
    }

    case 'pillar_wood': {
      // Heavy alpine oak timber column: stone padstone base + chamfered post + iron straps + 45° knee-braces
      const padH = Math.min(0.26, h * 0.12);
      addBevel('stoneTrim', w + 0.14, padH, d + 0.14, 0, -h * 0.5 + padH * 0.5, 0);
      addBevel('primary', w * 0.95, h - padH * 0.85, d * 0.95, 0, padH * 0.42, 0);
      // Top timber bolster cap
      addBevel('darkWood', w + 0.12, 0.16, d + 0.12, 0, h * 0.5 - 0.08, 0);
      // Forged-iron U-straps + rivet bolts
      for (const bandY of [-h * 0.5 + padH + 0.18, h * 0.5 - 0.28]) {
        addBox('iron', w + 0.04, 0.1, d + 0.04, 0, bandY, 0);
        addRivetsOnFace([-w * 0.5 - 0.025, w * 0.5 + 0.025], [bandY], [-d * 0.25, d * 0.25], 0.045);
        addRivetsOnFace([-w * 0.25, w * 0.25], [bandY], [-d * 0.5 - 0.025, d * 0.5 + 0.025], 0.045);
      }
      // Sculpted diagonal oak knee-braces flaring outward at the top
      if (h >= 1.8) {
        const braceLen = Math.min(0.72, h * 0.26);
        const braceThick = Math.min(0.14, w * 0.22);
        const topY = h * 0.5 - 0.36;
        for (const s of [-1, 1]) {
          addBox('darkWood', braceThick, braceLen, braceThick * 1.15, s * (w * 0.5 + 0.16), topY, 0, 0, 0, -s * 0.68);
          addBox('darkWood', braceThick * 1.15, braceLen, braceThick, 0, topY, s * (d * 0.5 + 0.16), s * 0.68, 0, 0);
        }
      }
      break;
    }

    case 'beam_wood': {
      // Heavy structural oak lintel + carved underside corbels + riveted iron gusset bands + tenon pegs
      addBevel('primary', w * 0.99, h * 0.96, d * 0.99, 0, 0, 0);
      const alongX = w >= d;
      const span = alongX ? w : d;
      const strapPositions = span >= 3.5 ? [-0.38, 0, 0.38] : [-0.32, 0.32];
      for (const f of strapPositions) {
        if (alongX) {
          addBox('iron', 0.15, h + 0.035, d + 0.035, span * f, 0, 0);
          addRivetsOnFace([span * f], [-h * 0.22, h * 0.22], [-d * 0.5 - 0.022, d * 0.5 + 0.022], 0.042);
        } else {
          addBox('iron', w + 0.035, h + 0.035, 0.15, 0, 0, span * f);
          addRivetsOnFace([-w * 0.5 - 0.022, w * 0.5 + 0.022], [-h * 0.22, h * 0.22], [span * f], 0.042);
        }
      }
      // Carved lower fascia molding & protruding oak mortise pegs
      if (alongX) {
        addBox('darkWood', w * 0.96, 0.09, d + 0.06, 0, -h * 0.5 + 0.05, 0);
        addBox('darkWood', w * 0.96, 0.08, d + 0.05, 0, h * 0.5 - 0.04, 0);
      } else {
        addBox('darkWood', w + 0.06, 0.09, d * 0.96, 0, -h * 0.5 + 0.05, 0);
        addBox('darkWood', w + 0.05, 0.08, d * 0.96, 0, h * 0.5 - 0.04, 0);
      }
      break;
    }

    case 'deck_wood': {
      // Heavy planked alpine gallery deck + projecting joist tails + curb rails + forged corner straps
      addBevel('primary', w * 0.99, h * 0.88, d * 0.99, 0, h * 0.04, 0);
      // Projecting underside timber joists running crosswise
      const joistCountX = Math.max(3, Math.min(7, Math.round(w / 0.9)));
      for (let i = 0; i < joistCountX; i++) {
        const jx = -w * 0.42 + (i / Math.max(1, joistCountX - 1)) * (w * 0.84);
        addBox('darkWood', 0.14, h * 0.38, d + 0.26, jx, -h * 0.34, 0);
      }
      // Perimeter raised oak fascia curb rails
      const railH = Math.min(0.14, h * 0.34);
      addBox('darkWood', w + 0.08, railH, 0.16, 0, h * 0.5 - railH * 0.35, -d * 0.5 + 0.04);
      addBox('darkWood', w + 0.08, railH, 0.16, 0, h * 0.5 - railH * 0.35, d * 0.5 - 0.04);
      addBox('darkWood', 0.16, railH, d + 0.08, -w * 0.5 + 0.04, h * 0.5 - railH * 0.35, 0);
      addBox('darkWood', 0.16, railH, d + 0.08, w * 0.5 - 0.04, h * 0.5 - railH * 0.35, 0);
      // Forged iron corner tie brackets
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox('iron', 0.24, h + 0.04, 0.24, sx * (w * 0.5 - 0.06), 0, sz * (d * 0.5 - 0.06));
        }
      }
      break;
    }

    case 'deck_stone': {
      // Ashlar rampart deck + overhanging cornice drip-mould + carved machicolation stone corbels underneath
      addBevel('primary', w * 0.99, h * 0.84, d * 0.99, 0, h * 0.06, 0);
      // Projecting carved upper cornice band
      addBevel('stoneTrim', w + 0.14, h * 0.28, d + 0.14, 0, h * 0.5 - h * 0.14, 0);
      // Carved stone machicolation corbel teeth around the underside perimeter
      const corbX = Math.max(3, Math.min(7, Math.round(w / 1.15)));
      for (let i = 0; i < corbX; i++) {
        const cx = -w * 0.43 + (i / Math.max(1, corbX - 1)) * (w * 0.86);
        addBevel('stoneTrim', 0.24, h * 0.42, 0.24, cx, -h * 0.36, -d * 0.5 + 0.02);
        addBevel('stoneTrim', 0.24, h * 0.42, 0.24, cx, -h * 0.36, d * 0.5 - 0.02);
      }
      const corbZ = Math.max(2, Math.min(5, Math.round(d / 1.15)));
      for (let i = 0; i < corbZ; i++) {
        const cz = -d * 0.38 + (i / Math.max(1, corbZ - 1)) * (d * 0.76);
        addBevel('stoneTrim', 0.24, h * 0.42, 0.24, -w * 0.5 + 0.02, -h * 0.36, cz);
        addBevel('stoneTrim', 0.24, h * 0.42, 0.24, w * 0.5 - 0.02, -h * 0.36, cz);
      }
      // Corner forged-iron tie anchors
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox('iron', 0.18, h * 0.55, 0.18, sx * (w * 0.5 + 0.02), 0.04, sz * (d * 0.5 + 0.02));
        }
      }
      break;
    }

    case 'wall_stone': {
      // Fortified ashlar curtain wall + alternating raised corner quoins + recessed arrow-slit + coping cap
      addBevel('primary', w * 0.96, h * 0.92, d * 0.96, 0, -0.02, 0);
      // Chamfered plinth footing & overhanging saddleback coping stone
      addBevel('stoneTrim', w + 0.1, Math.min(0.22, h * 0.16), d + 0.1, 0, -h * 0.5 + Math.min(0.11, h * 0.08), 0);
      addBevel('stoneTrim', w + 0.12, Math.min(0.2, h * 0.16), d + 0.12, 0, h * 0.5 - Math.min(0.1, h * 0.08), 0);

      // Alternating rusticated corner quoin blocks
      const courses = Math.max(2, Math.min(5, Math.round(h / 0.48)));
      const qH = (h * 0.72) / courses;
      for (let c = 0; c < courses; c++) {
        const qy = -h * 0.34 + (c + 0.5) * qH;
        const alt = c % 2 === 0;
        const qw = alt ? 0.26 : 0.17;
        const qd = alt ? 0.17 : 0.26;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addBevel('stoneTrim', qw, qH * 0.88, qd, sx * (w * 0.5 - qw * 0.32), qy, sz * (d * 0.5 - qd * 0.32));
          }
        }
      }

      // Recessed dark arrow-slit embrasure frame on the widest vertical faces
      if (h >= 1.3 && Math.max(w, d) >= 1.4) {
        const faceAlongX = d >= w; // wide face faces ±X when d >= w
        const slitH = h * 0.44;
        if (faceAlongX) {
          addBox('iron', w + 0.03, slitH, 0.11, 0, 0.04, 0);
          addBox('iron', w + 0.03, 0.1, 0.28, 0, 0.04, 0);
          addBevel('stoneTrim', w + 0.05, 0.11, 0.42, 0, 0.04 + slitH * 0.5 + 0.05, 0);
          addBevel('stoneTrim', w + 0.05, 0.11, 0.42, 0, 0.04 - slitH * 0.5 - 0.05, 0);
        } else {
          addBox('iron', 0.11, slitH, d + 0.03, 0, 0.04, 0);
          addBox('iron', 0.28, 0.1, d + 0.03, 0, 0.04, 0);
          addBevel('stoneTrim', 0.42, 0.11, d + 0.05, 0, 0.04 + slitH * 0.5 + 0.05, 0);
          addBevel('stoneTrim', 0.42, 0.11, d + 0.05, 0, 0.04 - slitH * 0.5 - 0.05, 0);
        }
      }
      break;
    }

    case 'buttress': {
      // Sculpted battered medieval stone buttress tapering gracefully with stepped stone set-off ledges
      pushGeo('primary', createBatteredButtressGeometry(w * 0.98, h * 0.94, d * 0.98), 0, -h * 0.03, 0);
      // Heavy stepped base plinth
      addBevel('stoneTrim', w + 0.14, Math.min(0.28, h * 0.18), d + 0.14, 0, -h * 0.5 + Math.min(0.14, h * 0.09), 0);
      // Mid-height weathered stone set-off ledge
      addBevel('stoneTrim', w * 0.88, 0.14, d * 0.88, 0, 0.04, 0);
      // Sloped cap stone at apex
      addBevel('stoneTrim', w * 0.72, 0.16, d * 0.72, 0, h * 0.5 - 0.08, 0);
      // Forged iron masonry anchor strap
      addBox('iron', w * 0.92, 0.08, d * 0.92, 0, -h * 0.22, 0);
      break;
    }

    case 'arch_stone': {
      // True Romanesque semicircular arched stone portal + sculpted keystone + impost capitals!
      pushGeo('primary', createRomanesqueArchGeometry(w, h, d), 0, 0, 0);
      const spanAlongX = w >= d;
      const span = spanAlongX ? w : d;
      const depth = spanAlongX ? d : w;
      const legW = Math.max(0.24, span * 0.2);

      // Raised sculpted trapezoidal keystone at the crown of the arch
      if (spanAlongX) {
        addBevel('stoneTrim', Math.min(0.42, span * 0.14), Math.min(0.46, h * 0.24), depth + 0.12, 0, h * 0.5 - Math.min(0.24, h * 0.13), 0);
        // Moulded impost blocks & footing plinths on both piers
        for (const s of [-1, 1]) {
          const lx = s * (span * 0.5 - legW * 0.5);
          addBevel('stoneTrim', legW + 0.14, 0.16, depth + 0.14, lx, -h * 0.5 + 0.08, 0);
          addBevel('stoneTrim', legW + 0.12, 0.14, depth + 0.12, lx, -h * 0.5 + h * 0.44, 0);
        }
        // Upper cornice band along arch crown
        addBevel('stoneTrim', span + 0.1, 0.12, depth + 0.1, 0, h * 0.5 - 0.06, 0);
      } else {
        addBevel('stoneTrim', depth + 0.12, Math.min(0.46, h * 0.24), Math.min(0.42, span * 0.14), 0, h * 0.5 - Math.min(0.24, h * 0.13), 0);
        for (const s of [-1, 1]) {
          const lz = s * (span * 0.5 - legW * 0.5);
          addBevel('stoneTrim', depth + 0.14, 0.16, legW + 0.14, 0, -h * 0.5 + 0.08, lz);
          addBevel('stoneTrim', depth + 0.12, 0.14, legW + 0.12, 0, -h * 0.5 + h * 0.44, lz);
        }
        addBevel('stoneTrim', depth + 0.1, 0.12, span + 0.1, 0, h * 0.5 - 0.06, 0);
      }
      break;
    }

    case 'merlon': {
      // Sculpted battlement merlon: beveled stone body + overhanging saddleback capstone + arrow-slit notch
      addBevel('primary', w * 0.94, h * 0.78, d * 0.94, 0, -h * 0.11, 0);
      // Overhanging beveled saddleback coping cap
      addBevel('stoneTrim', w + 0.14, h * 0.24, d + 0.14, 0, h * 0.5 - h * 0.14, 0);
      addBevel('stoneTrim', w * 0.72, h * 0.12, d * 0.72, 0, h * 0.5 + 0.02, 0);
      // Dark arrow-slit vertical detail
      addBox('iron', w + 0.02, h * 0.36, 0.08, 0, -0.04, 0);
      addBox('iron', 0.08, h * 0.36, d + 0.02, 0, -0.04, 0);
      break;
    }

    case 'window_glass': {
      // Gothic leaded crown-glass window: thick beveled crystal + heavy forged-iron frame, mullions & rosette
      const ft = Math.min(0.09, Math.min(w, h, d) * 0.2);
      addBevel(
        'primary',
        Math.max(0.08, w - ft * 0.65),
        Math.max(0.08, h - ft * 0.65),
        Math.max(0.08, d - ft * 0.65),
      );
      // Outer iron sill & head lintel (slightly proud so frame casts crisp shadows)
      addBox('glassFrame', w + 0.06, ft * 1.15, d + 0.06, 0, h * 0.5 - ft * 0.48, 0);
      addBox('glassFrame', w + 0.08, ft * 1.25, d + 0.08, 0, -h * 0.5 + ft * 0.5, 0);

      const wideX = w >= d;
      if (wideX) {
        addBox('glassFrame', ft, h, d + 0.04, -w * 0.5 + ft * 0.45, 0, 0);
        addBox('glassFrame', ft, h, d + 0.04, w * 0.5 - ft * 0.45, 0, 0);
        // Horizontal gothic transom bar + vertical mullion
        addBox('glassFrame', w - ft, ft * 0.68, d + 0.02, 0, h * 0.16, 0);
        if (w >= 1.2) {
          addBox('glassFrame', ft * 0.68, h - ft, d + 0.02, 0, 0, 0);
          // Gothic diagonal tracery struts at upper corners
          const strutL = Math.min(w * 0.32, h * 0.25);
          addBox('glassFrame', strutL, ft * 0.52, d + 0.01, -w * 0.28, h * 0.32, 0, 0, 0, 0.75);
          addBox('glassFrame', strutL, ft * 0.52, d + 0.01, w * 0.28, h * 0.32, 0, 0, 0, -0.75);
        }
        // Forged iron corner gusset rivets
        addRivetsOnFace([-w * 0.5 + ft * 0.45, w * 0.5 - ft * 0.45], [-h * 0.42, h * 0.42], [-d * 0.5 - 0.03, d * 0.5 + 0.03], 0.042);
      } else {
        addBox('glassFrame', w + 0.04, h, ft, 0, 0, -d * 0.5 + ft * 0.45);
        addBox('glassFrame', w + 0.04, h, ft, 0, 0, d * 0.5 - ft * 0.45);
        addBox('glassFrame', w + 0.02, ft * 0.68, d - ft, 0, h * 0.16, 0);
        if (d >= 1.2) {
          addBox('glassFrame', w + 0.02, h - ft, ft * 0.68, 0, 0, 0);
          const strutL = Math.min(d * 0.32, h * 0.25);
          addBox('glassFrame', w + 0.01, ft * 0.52, strutL, 0, h * 0.32, -d * 0.28, -0.75, 0, 0);
          addBox('glassFrame', w + 0.01, ft * 0.52, strutL, 0, h * 0.32, d * 0.28, 0.75, 0, 0);
        }
        addRivetsOnFace([-w * 0.5 - 0.03, w * 0.5 + 0.03], [-h * 0.42, h * 0.42], [-d * 0.5 + ft * 0.45, d * 0.5 - ft * 0.45], 0.042);
      }
      break;
    }

    case 'lantern_glass': {
      // 4-sided medieval watchtower lantern cupola with wrought-iron corner stanchions & glowing fire-brazier!
      const st = 0.095;
      addBevel('primary', Math.max(0.12, w - st * 1.1), Math.max(0.12, h - st * 1.2), Math.max(0.12, d - st * 1.1));
      // Iron bottom curb & top ring cornice
      addBox('glassFrame', w + 0.08, st * 1.15, d + 0.08, 0, -h * 0.5 + st * 0.5, 0);
      addBox('glassFrame', w + 0.1, st * 1.15, d + 0.1, 0, h * 0.5 - st * 0.5, 0);
      // 4 forged-iron corner stanchions
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox('glassFrame', st, h, st, sx * (w * 0.5 - st * 0.4), 0, sz * (d * 0.5 - st * 0.4));
        }
      }
      // Mid glazing muntin bars on all 4 faces
      addBox('glassFrame', w + 0.02, st * 0.55, st * 0.55, 0, 0, -d * 0.5 + 0.02);
      addBox('glassFrame', w + 0.02, st * 0.55, st * 0.55, 0, 0, d * 0.5 - 0.02);
      addBox('glassFrame', st * 0.55, st * 0.55, d + 0.02, -w * 0.5 + 0.02, 0, 0);
      addBox('glassFrame', st * 0.55, st * 0.55, d + 0.02, w * 0.5 - 0.02, 0, 0);

      // Warm flickering interior watchtower brazier when lanternGlow is enabled
      if (bp.lanternGlow) {
        const bowlR = Math.min(w, d) * 0.24;
        pushGeo('iron', new THREE.CylinderGeometry(bowlR * 1.1, bowlR * 0.65, h * 0.22, 8), 0, -h * 0.22, 0);
        pushGeo('ember', new THREE.OctahedronGeometry(bowlR * 0.88, 1), 0, -h * 0.02, 0);
      }
      break;
    }

    case 'roof_wood':
    case 'roof_stone': {
      // True pitched alpine slate roof with overhanging timber eaves fascia, ridge beam & forged-iron finial!
      const roofH = Math.max(h, Math.min(w, d) * 0.56);
      const yShift = (roofH - h) * 0.5;
      // Structural lower eave plate (primary material so damage/fracture color reads authentically)
      addBevel('primary', w * 0.96, Math.min(0.24, h * 0.55), d * 0.96, 0, -h * 0.5 + Math.min(0.12, h * 0.28), 0);
      // Overhanging dark oak eaves fascia trim
      addBox('darkWood', w + 0.26, 0.11, d + 0.26, 0, -h * 0.5 + 0.08, 0);
      // Pitched alpine slate shingle roof shell
      pushGeo('slate', createPitchedRoofGeometry(w + 0.34, roofH, d + 0.34), 0, yShift + 0.04, 0);
      // Forged-iron roof ridge crest & tall spire finial
      const peakY = -h * 0.5 + roofH + 0.04;
      pushGeo('iron', new THREE.CylinderGeometry(0.032, 0.055, 0.68, 6), 0, peakY + 0.32, 0);
      pushGeo('iron', new THREE.OctahedronGeometry(0.1, 0), 0, peakY + 0.68, 0);
      break;
    }

    case 'crate': {
      // Iron-bound medieval timber supply crate with recessed oak panels, framing battens & X cross-braces
      addBevel('primary', w * 0.9, h * 0.9, d * 0.9, 0, 0, 0);
      const b = 0.11;
      // Top & bottom perimeter frames
      addBox('darkWood', w + 0.02, b, d + 0.02, 0, h * 0.5 - b * 0.45, 0);
      addBox('darkWood', w + 0.02, b, d + 0.02, 0, -h * 0.5 + b * 0.45, 0);
      // 4 vertical corner posts
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox('darkWood', b, h, b, sx * (w * 0.5 - b * 0.42), 0, sz * (d * 0.5 - b * 0.42));
        }
      }
      // Diagonal oak X-braces on all 4 vertical faces
      const diagXY = Math.hypot(w * 0.78, h * 0.78);
      const angXY = Math.atan2(h, w);
      addBox('darkWood', diagXY, 0.095, d * 0.96, 0, 0, 0, 0, 0, angXY);
      addBox('darkWood', diagXY, 0.095, d * 0.96, 0, 0, 0, 0, 0, -angXY);
      const diagZY = Math.hypot(d * 0.78, h * 0.78);
      const angZY = Math.atan2(h, d);
      addBox('darkWood', w * 0.96, 0.095, diagZY, 0, 0, 0, angZY, 0, 0);
      // Forged-iron corner brackets with bolt heads
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addBox('iron', 0.16, 0.14, 0.16, sx * (w * 0.5 - 0.03), sy * (h * 0.5 - 0.03), sz * (d * 0.5 - 0.03));
          }
        }
      }
      break;
    }

    case 'palisade': {
      // Sharpened alpine timber log palisade lashed with horizontal oak cross-rails & forged iron bands!
      const alongZ = d >= w;
      const span = alongZ ? d : w;
      const thick = alongZ ? w : d;
      const logCount = Math.max(4, Math.min(8, Math.round(span / 0.34)));
      const logR = Math.min(thick * 0.46, (span / logCount) * 0.52);

      for (let i = 0; i < logCount; i++) {
        const t = logCount === 1 ? 0 : i / (logCount - 1) - 0.5;
        // Deterministic organic height & lean variation
        const seed = Math.sin(i * 12.9898 + bp.x * 3.1 + bp.z * 7.3) * 43758.5453;
        const frac = seed - Math.floor(seed);
        const logH = h * (0.78 + frac * 0.16);
        const tipH = Math.min(0.42, h * 0.24);
        const offset = t * (span - logR * 2.05);
        const tilt = (frac - 0.5) * 0.06;

        const px = alongZ ? (frac - 0.5) * 0.04 : offset;
        const pz = alongZ ? offset : (frac - 0.5) * 0.04;
        const shaftCenterY = -h * 0.5 + logH * 0.5;
        const tipCenterY = -h * 0.5 + logH + tipH * 0.48;

        pushGeo(
          'primary',
          new THREE.CylinderGeometry(logR * 0.88, logR * 1.04, logH, 7),
          px,
          shaftCenterY,
          pz,
          alongZ ? tilt : 0,
          0,
          alongZ ? 0 : tilt,
        );
        pushGeo(
          'darkWood',
          new THREE.ConeGeometry(logR * 0.88, tipH, 7),
          px,
          tipCenterY,
          pz,
          alongZ ? tilt : 0,
          0,
          alongZ ? 0 : tilt,
        );
      }

      // Two heavy horizontal oak cross-rails + forged-iron lash straps
      for (const railY of [-h * 0.22, h * 0.14]) {
        if (alongZ) {
          addBevel('darkWood', thick + 0.06, 0.16, span + 0.04, 0, railY, 0);
          addBox('iron', thick + 0.1, 0.1, 0.14, 0, railY, -span * 0.34);
          addBox('iron', thick + 0.1, 0.1, 0.14, 0, railY, span * 0.34);
        } else {
          addBevel('darkWood', span + 0.04, 0.16, thick + 0.06, 0, railY, 0);
          addBox('iron', 0.14, 0.1, thick + 0.1, -span * 0.34, railY, 0);
          addBox('iron', 0.14, 0.1, thick + 0.1, span * 0.34, railY, 0);
        }
      }
      break;
    }
  }

  let bannerCloth: THREE.BufferGeometry | null = null;
  let bannerVariant: 'crimson' | 'royal' | null = null;

  // Optional medieval banner pole + fluttering heraldic pennant (mounted cleanly on merlons or roofs!)
  if (bp.banner) {
    const poleBaseY = role === 'roof_wood' || role === 'roof_stone'
      ? -h * 0.5 + Math.max(h, Math.min(w, d) * 0.56) + 0.1
      : h * 0.5;
    const poleH = 2.05;
    const poleX = role === 'merlon' ? -w * 0.15 : 0;
    const poleZ = 0;

    // Iron banner pole, spearhead finial, and crossbar
    pushGeo('iron', new THREE.CylinderGeometry(0.028, 0.04, poleH, 6), poleX, poleBaseY + poleH * 0.5, poleZ);
    pushGeo('iron', new THREE.ConeGeometry(0.068, 0.24, 5), poleX, poleBaseY + poleH + 0.11, poleZ);
    pushGeo('iron', new THREE.CylinderGeometry(0.024, 0.024, 0.68, 6), poleX, poleBaseY + poleH - 0.12, poleZ, Math.PI * 0.5, 0, 0);

    // Subdivided cloth pennant mesh (keep original 0..1 UVs for heraldic crest + wind pinning)
    const indexedCloth = new THREE.PlaneGeometry(0.62, 1.38, 4, 10);
    indexedCloth.rotateY(Math.PI * 0.5);
    indexedCloth.translate(poleX - 0.04, poleBaseY + poleH - 0.82, poleZ);
    const nonIndexedCloth = indexedCloth.toNonIndexed();
    indexedCloth.dispose();
    for (const attr of Object.keys(nonIndexedCloth.attributes)) {
      if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
        nonIndexedCloth.deleteAttribute(attr);
      }
    }
    nonIndexedCloth.computeBoundingBox();
    nonIndexedCloth.computeBoundingSphere();
    bannerCloth = nonIndexedCloth;
    bannerVariant = bp.banner;
  }

  const mergedBuckets: Partial<Record<BucketKey, THREE.BufferGeometry>> = {};
  (Object.keys(buckets) as BucketKey[]).forEach((bKey) => {
    const merged = mergeBucket(buckets[bKey]);
    if (merged) {
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      mergedBuckets[bKey] = merged;
    }
  });

  return {
    key,
    material,
    buckets: mergedBuckets,
    bannerCloth,
    bannerVariant,
  };
}

/**
 * Persistent prototype cache so repeated fortress blocks (and level retries/switches)
 * reuse identical merged geometries without regenerating extrusions or Voronoi UVs.
 */
export class ArchitecturalGeometryCache {
  private readonly cache = new Map<string, CachedBlockPrototype>();

  public getPrototype(bp: BlockBlueprint): CachedBlockPrototype {
    const role = inferBlockRole(bp);
    const palisadeSalt = role === 'palisade' ? `|${bp.x.toFixed(2)},${bp.z.toFixed(2)}` : '';
    const key = `${role}|${bp.material}|${bp.w.toFixed(3)}|${bp.h.toFixed(3)}|${bp.d.toFixed(3)}|${bp.lanternGlow ? 1 : 0}|${bp.banner ?? ''}${palisadeSalt}`;
    let proto = this.cache.get(key);
    if (!proto) {
      proto = buildBlockPrototypeGeometries(bp, key);
      this.cache.set(key, proto);
    }
    return proto;
  }

  public clear(): void {
    for (const proto of this.cache.values()) {
      for (const geo of Object.values(proto.buckets)) {
        geo?.dispose();
      }
      proto.bannerCloth?.dispose();
    }
    this.cache.clear();
  }

  public dispose(): void {
    this.clear();
  }
}

export function createArchitecturalBlockVisual(
  bp: BlockBlueprint,
  mats: ArchitecturalMaterialSet,
  isSoftwareGl: boolean,
): DetailedBlockVisual {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const primaryMat = mats[bp.material].clone();
  const damageUniforms = enhanceBlockMaterialWithDamage(primaryMat, bp.material);
  const proto = buildBlockPrototypeGeometries(bp, 'standalone');

  if (proto.bannerCloth && proto.bannerVariant) {
    geometries.push(proto.bannerCloth);
    const bannerMat = proto.bannerVariant === 'royal' ? mats.bannerRoyal : mats.bannerCrimson;
    const bannerMesh = new THREE.Mesh(proto.bannerCloth, bannerMat);
    bannerMesh.castShadow = false;
    bannerMesh.receiveShadow = false;
    group.add(bannerMesh);
  }

  const bucketDefs: Array<{
    key: BucketKey;
    mat: THREE.Material;
    cast: boolean;
  }> = [
    { key: 'primary', mat: primaryMat, cast: !isSoftwareGl && bp.material !== 'glass' },
    { key: 'stoneTrim', mat: mats.stoneTrim, cast: !isSoftwareGl },
    { key: 'darkWood', mat: mats.darkWoodTrim, cast: !isSoftwareGl },
    { key: 'iron', mat: mats.ironTrim, cast: false },
    { key: 'glassFrame', mat: mats.glassFrame, cast: !isSoftwareGl },
    { key: 'slate', mat: mats.slateRoof, cast: !isSoftwareGl },
    { key: 'ember', mat: mats.emberGlow, cast: false },
  ];

  for (const def of bucketDefs) {
    const merged = proto.buckets[def.key];
    if (!merged) continue;
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, def.mat);
    mesh.castShadow = def.cast;
    mesh.receiveShadow = def.key !== 'ember';
    group.add(mesh);
  }

  return { group, primaryMat, damageUniforms, geometries };
}

// ============================================================================
// FORTRESS BATCHED MESH MANAGER (<= 11 DRAW CALLS FOR ENTIRE CASTLE + OCCLUSION)
// ============================================================================

export type BatchLayerKey =
  | 'wood'
  | 'stone'
  | 'glass'
  | 'metal'
  | 'stoneTrim'
  | 'darkWood'
  | 'iron'
  | 'glassFrame'
  | 'slate'
  | 'ember'
  | 'bannerCrimson'
  | 'bannerRoyal';

interface LayerBatchEntry {
  key: BatchLayerKey;
  mesh: THREE.BatchedMesh;
  geoIdMap: Map<string, number>;
  damageSurface?: BatchDamageSurface;
  instances: Array<{ instanceId: number; alive: boolean; cameraVisible: boolean }>;
  culledCount: number;
  shadowOverrideActive: boolean;
}

interface RegisteredBlockBatch {
  id: string;
  material: BlockMaterialType;
  primaryLayer: 'wood' | 'stone' | 'glass' | 'metal';
  primaryInstanceId: number;
  parts: Array<{ layer: BatchLayerKey; instanceId: number; slotIdx: number }>;
  alive: boolean;
  cameraVisible: boolean;
  px: number;
  py: number;
  pz: number;
  hx: number;
  hy: number;
  hz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  // Last cached world-space AABB for O(1) occlusion culling queries
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface BlockCullerLike {
  isBoxVisible(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    minScreenPx?: number,
  ): boolean;
}

export class FortressBatchManager {
  public readonly group = new THREE.Group();
  private layers = new Map<BatchLayerKey, LayerBatchEntry>();
  private blocks = new Map<string, RegisteredBlockBatch>();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3(1, 1, 1);

  public buildForLevel(
    specs: Array<{
      id: string;
      bp: BlockBlueprint;
      hx: number;
      hy: number;
      hz: number;
      qx: number;
      qy: number;
      qz: number;
      qw: number;
    }>,
    mats: ArchitecturalMaterialSet,
    geoCache: ArchitecturalGeometryCache,
    isSoftwareGl: boolean,
  ): void {
    this.clear();
    mats.woodBatchSurface.clear();
    mats.stoneBatchSurface.clear();
    mats.glassBatchSurface.clear();
    mats.metalBatchSurface.clear();

    if (specs.length === 0) return;

    // 1. Collect exact unique geometry budgets & instance counts per layer
    const layerMeta: Record<
      BatchLayerKey,
      {
        mat: THREE.Material;
        castShadow: boolean;
        receiveShadow: boolean;
        damageSurface?: BatchDamageSurface;
        uniqueGeos: Map<string, THREE.BufferGeometry>;
        totalVerts: number;
        instanceCount: number;
      }
    > = {
      wood: { mat: mats.wood, castShadow: !isSoftwareGl, receiveShadow: true, damageSurface: mats.woodBatchSurface, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      stone: { mat: mats.stone, castShadow: !isSoftwareGl, receiveShadow: true, damageSurface: mats.stoneBatchSurface, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      glass: { mat: mats.glass, castShadow: false, receiveShadow: true, damageSurface: mats.glassBatchSurface, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      metal: { mat: mats.metal, castShadow: !isSoftwareGl, receiveShadow: true, damageSurface: mats.metalBatchSurface, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      stoneTrim: { mat: mats.stoneTrim, castShadow: !isSoftwareGl, receiveShadow: true, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      darkWood: { mat: mats.darkWoodTrim, castShadow: !isSoftwareGl, receiveShadow: true, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      iron: { mat: mats.ironTrim, castShadow: false, receiveShadow: true, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      glassFrame: { mat: mats.glassFrame, castShadow: !isSoftwareGl, receiveShadow: true, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      slate: { mat: mats.slateRoof, castShadow: !isSoftwareGl, receiveShadow: true, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      ember: { mat: mats.emberGlow, castShadow: false, receiveShadow: false, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      bannerCrimson: { mat: mats.bannerCrimson, castShadow: false, receiveShadow: false, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
      bannerRoyal: { mat: mats.bannerRoyal, castShadow: false, receiveShadow: false, uniqueGeos: new Map(), totalVerts: 0, instanceCount: 0 },
    };

    const resolved = specs.map((spec) => ({
      spec,
      proto: geoCache.getPrototype(spec.bp),
    }));

    const registerGeo = (layer: BatchLayerKey, geoKey: string, geo: THREE.BufferGeometry) => {
      const m = layerMeta[layer];
      m.instanceCount++;
      if (!m.uniqueGeos.has(geoKey)) {
        m.uniqueGeos.set(geoKey, geo);
        m.totalVerts += geo.getAttribute('position').count;
      }
    };

    for (const { proto } of resolved) {
      if (proto.buckets.primary) {
        registerGeo(proto.material, proto.key, proto.buckets.primary);
      }
      if (proto.buckets.stoneTrim) registerGeo('stoneTrim', proto.key, proto.buckets.stoneTrim);
      if (proto.buckets.darkWood) registerGeo('darkWood', proto.key, proto.buckets.darkWood);
      if (proto.buckets.iron) registerGeo('iron', proto.key, proto.buckets.iron);
      if (proto.buckets.glassFrame) registerGeo('glassFrame', proto.key, proto.buckets.glassFrame);
      if (proto.buckets.slate) registerGeo('slate', proto.key, proto.buckets.slate);
      if (proto.buckets.ember) registerGeo('ember', proto.key, proto.buckets.ember);
      if (proto.bannerCloth && proto.bannerVariant) {
        const bLayer: BatchLayerKey = proto.bannerVariant === 'royal' ? 'bannerRoyal' : 'bannerCrimson';
        registerGeo(bLayer, proto.key, proto.bannerCloth);
      }
    }

    // 2. Allocate precisely-sized BatchedMesh containers
    (Object.keys(layerMeta) as BatchLayerKey[]).forEach((layerKey) => {
      const m = layerMeta[layerKey];
      if (m.instanceCount === 0 || m.totalVerts === 0) return;

      const maxInst = m.damageSurface
        ? Math.min(m.damageSurface.maxInstances, Math.max(4, m.instanceCount))
        : Math.max(4, m.instanceCount);
      const bm = new THREE.BatchedMesh(maxInst, Math.max(64, m.totalVerts), 0, m.mat);
      bm.castShadow = m.castShadow;
      bm.receiveShadow = m.receiveShadow;
      bm.frustumCulled = false; // Individual parts culled cleanly via perObjectFrustumCulled + OcclusionCuller
      bm.perObjectFrustumCulled = true;
      bm.sortObjects = layerKey === 'glass';

      const geoIdMap = new Map<string, number>();
      for (const [geoKey, geo] of m.uniqueGeos.entries()) {
        const gid = bm.addGeometry(geo);
        geoIdMap.set(geoKey, gid);
      }

      const entry: LayerBatchEntry = {
        key: layerKey,
        mesh: bm,
        geoIdMap,
        damageSurface: m.damageSurface,
        instances: [],
        culledCount: 0,
        shadowOverrideActive: false,
      };

      // Shadow-safe occlusion hooks: shadow pass renders all alive instances; restore in onAfterShadow cleanly
      bm.onBeforeShadow = function (
        renderer,
        object,
        camera,
        shadowCamera,
        geometry,
        depthMaterial,
        groupArg,
      ) {
        if (entry.culledCount > 0) {
          for (let i = 0; i < entry.instances.length; i++) {
            const inst = entry.instances[i];
            if (inst.alive && !inst.cameraVisible) {
              bm.setVisibleAt(inst.instanceId, true);
              entry.shadowOverrideActive = true;
            }
          }
        }
        THREE.BatchedMesh.prototype.onBeforeShadow.call(
          bm,
          renderer,
          object,
          camera,
          shadowCamera,
          geometry,
          depthMaterial,
          groupArg,
        );
      };

      bm.onAfterShadow = function () {
        if (entry.shadowOverrideActive) {
          for (let i = 0; i < entry.instances.length; i++) {
            const inst = entry.instances[i];
            bm.setVisibleAt(inst.instanceId, inst.alive && inst.cameraVisible);
          }
          entry.shadowOverrideActive = false;
        }
        (bm as unknown as { _visibilityChanged: boolean })._visibilityChanged = true;
      };

      this.layers.set(layerKey, entry);
      this.group.add(bm);
    });

    // 3. Instantiate every block's sub-parts into its layers
    for (const { spec, proto } of resolved) {
      const { id, bp, hx, hy, hz, qx, qy, qz, qw } = spec;
      this.tmpPos.set(bp.x, bp.y, bp.z);
      this.tmpQuat.set(qx, qy, qz, qw);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);

      const parts: RegisteredBlockBatch['parts'] = [];
      let primaryInstanceId = -1;

      const addPart = (layer: BatchLayerKey) => {
        const entry = this.layers.get(layer);
        if (!entry) return;
        const gid = entry.geoIdMap.get(proto.key);
        if (gid === undefined) return;
        const instanceId = entry.mesh.addInstance(gid);
        entry.mesh.setMatrixAt(instanceId, this.tmpMat);
        entry.mesh.setVisibleAt(instanceId, true);
        const slotIdx = entry.instances.length;
        entry.instances.push({ instanceId, alive: true, cameraVisible: true });
        parts.push({ layer, instanceId, slotIdx });
        if (layer === bp.material) {
          primaryInstanceId = instanceId;
        }
      };

      if (proto.buckets.primary) addPart(bp.material);
      if (proto.buckets.stoneTrim) addPart('stoneTrim');
      if (proto.buckets.darkWood) addPart('darkWood');
      if (proto.buckets.iron) addPart('iron');
      if (proto.buckets.glassFrame) addPart('glassFrame');
      if (proto.buckets.slate) addPart('slate');
      if (proto.buckets.ember) addPart('ember');
      if (proto.bannerCloth && proto.bannerVariant) {
        addPart(proto.bannerVariant === 'royal' ? 'bannerRoyal' : 'bannerCrimson');
      }

      const reg: RegisteredBlockBatch = {
        id,
        material: bp.material,
        primaryLayer: bp.material,
        primaryInstanceId,
        parts,
        alive: true,
        cameraVisible: true,
        px: bp.x,
        py: bp.y,
        pz: bp.z,
        hx,
        hy,
        hz,
        qx,
        qy,
        qz,
        qw,
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
      };
      this.updateBlockBounds(reg);
      this.blocks.set(id, reg);

      // Initialize damage state to pristine (damage=0, hitFlash=0, wearShade=1)
      const primaryEntry = this.layers.get(reg.primaryLayer);
      primaryEntry?.damageSurface?.setBlockState(primaryInstanceId, 0, 0, 0, 0, 0, 1);
    }
  }

  private updateBlockBounds(reg: RegisteredBlockBatch): void {
    const qx = reg.qx, qy = reg.qy, qz = reg.qz, qw = reg.qw;
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;

    const m00 = Math.abs(1 - 2 * (yy + zz));
    const m01 = Math.abs(2 * (xy - wz));
    const m02 = Math.abs(2 * (xz + wy));
    const m10 = Math.abs(2 * (xy + wz));
    const m11 = Math.abs(1 - 2 * (xx + zz));
    const m12 = Math.abs(2 * (yz - wx));
    const m20 = Math.abs(2 * (xz - wy));
    const m21 = Math.abs(2 * (yz + wx));
    const m22 = Math.abs(1 - 2 * (xx + yy));

    // Generous +0.28m/+1.8m Y margin for roofs, spires, and fluttering banners
    const ex = m00 * reg.hx + m01 * reg.hy + m02 * reg.hz + 0.25;
    const ey = m10 * reg.hx + m11 * reg.hy + m12 * reg.hz + 0.35;
    const ez = m20 * reg.hx + m21 * reg.hy + m22 * reg.hz + 0.25;

    reg.minX = reg.px - ex;
    reg.minY = reg.py - ey;
    reg.minZ = reg.pz - ez;
    reg.maxX = reg.px + ex;
    reg.maxY = reg.py + ey + 1.65;
    reg.maxZ = reg.pz + ez;
  }

  public setBlockTransform(
    id: string,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
  ): void {
    const reg = this.blocks.get(id);
    if (!reg || !reg.alive) return;
    if (
      reg.px === px &&
      reg.py === py &&
      reg.pz === pz &&
      reg.qx === qx &&
      reg.qy === qy &&
      reg.qz === qz &&
      reg.qw === qw
    ) {
      return;
    }
    reg.px = px;
    reg.py = py;
    reg.pz = pz;
    reg.qx = qx;
    reg.qy = qy;
    reg.qz = qz;
    reg.qw = qw;
    this.updateBlockBounds(reg);

    this.tmpPos.set(px, py, pz);
    this.tmpQuat.set(qx, qy, qz, qw);
    this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    for (let i = 0; i < reg.parts.length; i++) {
      const part = reg.parts[i];
      const entry = this.layers.get(part.layer);
      entry?.mesh.setMatrixAt(part.instanceId, this.tmpMat);
    }
  }

  public setBlockDamageState(
    id: string,
    damage: number,
    ix: number,
    iy: number,
    iz: number,
    hitFlash: number,
    wearShade: number,
  ): void {
    const reg = this.blocks.get(id);
    if (!reg || !reg.alive || reg.primaryInstanceId < 0) return;
    const entry = this.layers.get(reg.primaryLayer);
    entry?.damageSurface?.setBlockState(
      reg.primaryInstanceId,
      damage,
      ix,
      iy,
      iz,
      hitFlash,
      wearShade,
    );
  }

  public removeBlock(id: string): void {
    const reg = this.blocks.get(id);
    if (!reg || !reg.alive) return;
    reg.alive = false;
    const wasHidden = !reg.cameraVisible;
    reg.cameraVisible = false;
    for (let i = 0; i < reg.parts.length; i++) {
      const part = reg.parts[i];
      const entry = this.layers.get(part.layer);
      if (entry) {
        const inst = entry.instances[part.slotIdx];
        if (wasHidden && !inst.cameraVisible && inst.alive) {
          entry.culledCount = Math.max(0, entry.culledCount - 1);
        }
        inst.alive = false;
        inst.cameraVisible = false;
        entry.mesh.setVisibleAt(part.instanceId, false);
      }
    }
    this.blocks.delete(id);
  }

  public updateOcclusion(culler: BlockCullerLike): void {
    for (const reg of this.blocks.values()) {
      if (!reg.alive) continue;
      const vis = culler.isBoxVisible(
        reg.minX,
        reg.minY,
        reg.minZ,
        reg.maxX,
        reg.maxY,
        reg.maxZ,
        4,
      );
      if (vis !== reg.cameraVisible) {
        reg.cameraVisible = vis;
        for (let i = 0; i < reg.parts.length; i++) {
          const part = reg.parts[i];
          const entry = this.layers.get(part.layer);
          if (entry) {
            entry.instances[part.slotIdx].cameraVisible = vis;
            entry.culledCount = Math.max(0, entry.culledCount + (vis ? -1 : 1));
            entry.mesh.setVisibleAt(part.instanceId, vis);
          }
        }
      }
    }
  }

  public clear(): void {
    for (const entry of this.layers.values()) {
      this.group.remove(entry.mesh);
      entry.mesh.dispose();
    }
    this.layers.clear();
    this.blocks.clear();
  }

  public dispose(): void {
    this.clear();
  }
}
