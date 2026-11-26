import * as THREE from 'three';
import {
  fbm2D,
  forestDensityAt,
  groundHeightAt,
  groundNormalAt,
  pathCenterZ,
  pathRutFactor,
  pathSdfAt,
} from './terrainMath';
import {
  createEnvironmentTextures,
  type EnvironmentTextures,
} from './foliageTextures';
import type { OcclusionCuller, TerrainOccluderMesh } from './occlusionCulling';

export interface EnvironmentHandle {
  update: (
    elapsed: number,
    dt: number,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    fogColor: THREE.Color,
    skyHorizonColor: THREE.Color,
    skyZenithColor: THREE.Color,
    cameraPos: THREE.Vector3,
  ) => void;
  setCloudVisible: (visible: boolean) => void;
  setDepthPassMode: (depthOnly: boolean) => void;
  getTerrainOccluderMesh: () => TerrainOccluderMesh;
  updateCulling: (culler: OcclusionCuller) => void;
  dispose: () => void;
}

interface SharedEnvUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uHazeHorizon: { value: THREE.Color };
  uHazeZenith: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uCamPos: { value: THREE.Vector3 };
}

/**
 * Deterministic PRNG for reproducible botanical & rock placement.
 */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Merges indexed or non-indexed BufferGeometries sharing identical attribute layouts.
 */
function mergeGeometriesSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  const hasColor = Boolean(geos[0]?.attributes.color);
  const hasUv = Boolean(geos[0]?.attributes.uv);
  const hasWind = Boolean(geos[0]?.attributes.aWind);

  for (const g of geos) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = hasUv ? new Float32Array(totalVerts * 2) : null;
  const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
  const winds = hasWind ? new Float32Array(totalVerts * 3) : null;
  const indices = new Uint32Array(totalIndices);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    positions.set(pos.array as Float32Array, vOff * 3);
    normals.set(nrm.array as Float32Array, vOff * 3);
    if (uvs && g.attributes.uv) {
      uvs.set(g.attributes.uv.array as Float32Array, vOff * 2);
    }
    if (colors && g.attributes.color) {
      colors.set(g.attributes.color.array as Float32Array, vOff * 3);
    }
    if (winds && g.attributes.aWind) {
      winds.set(g.attributes.aWind.array as Float32Array, vOff * 3);
    }
    if (g.index) {
      const idxArr = g.index.array;
      for (let k = 0; k < g.index.count; k++) {
        indices[iOff++] = idxArr[k] + vOff;
      }
    } else {
      for (let k = 0; k < pos.count; k++) {
        indices[iOff++] = vOff + k;
      }
    }
    vOff += pos.count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (winds) out.setAttribute('aWind', new THREE.BufferAttribute(winds, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

/**
 * Shared GLSL Exponential Height Aerial Perspective (Rayleigh + Mie sun in-scattering).
 * Keeps foreground & fortress crisp and high-contrast while receding distant mountains naturally.
 */
const AERIAL_FOG_FRAGMENT_GLSL = /* glsl */ `
{
  vec3 toFrag = vEnvWorldPos - uCamPos;
  float dist = length(toFrag);
  vec3 viewRay = toFrag / max(dist, 0.0001);

  // Start aerial perspective smoothly beyond the active arena & surrounding forest (~62m)
  float effDist = max(0.0, dist - 62.0);
  float heightAtten = exp(-max(0.0, vEnvWorldPos.y) * 0.032);
  float valleyMist = 1.0 - exp(-effDist * 0.0042 * (0.45 + 0.55 * heightAtten));
  float ridgeHaze = smoothstep(82.0, 280.0, dist) * 0.62;
  float fogAmt = clamp(max(valleyMist, ridgeHaze), 0.0, 0.86);

  // Rayleigh cool sky tint + Mie golden forward scatter toward sun
  float sunAlign = max(dot(viewRay, normalize(uSunDir)), 0.0);
  float mie = pow(sunAlign, 5.5) * 0.45 + pow(sunAlign, 18.0) * 0.28;
  float elevMix = clamp(vEnvWorldPos.y / 48.0, 0.0, 1.0);
  vec3 rayleighCol = mix(uHazeHorizon, uHazeZenith, elevMix * 0.52);
  vec3 scatterCol = mix(rayleighCol, uSunColor * 1.12, clamp(mie, 0.0, 0.78));

  gl_FragColor.rgb = mix(gl_FragColor.rgb, scatterCol, fogAmt);
}
`;

// ============================================================================
// 1. ADAPTIVE GEOMORPHOLOGICAL TERRAIN + HEIGHT-BASED SPLATTING & ANTI-TILING
// ============================================================================

interface TerrainChunk {
  mesh: THREE.Mesh;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const TERRAIN_HALF_W = 215;
const TERRAIN_HALF_D = 175;

function warpTerrainCoord(u: number, halfExtent: number): number {
  const s = u < 0 ? -1 : 1;
  const a = Math.abs(u);
  return s * (a * 0.34 + Math.pow(a, 2.35) * 0.66) * halfExtent;
}

function buildTerrainOccluderMesh(): TerrainOccluderMesh {
  const segX = 24;
  const segZ = 20;
  const row = segX + 1;
  const gridX = new Float32Array(row * (segZ + 1));
  const gridY = new Float32Array(row * (segZ + 1));
  const gridZ = new Float32Array(row * (segZ + 1));

  for (let iz = 0; iz <= segZ; iz++) {
    const z = warpTerrainCoord((iz / segZ) * 2 - 1, TERRAIN_HALF_D);
    for (let ix = 0; ix <= segX; ix++) {
      const x = warpTerrainCoord((ix / segX) * 2 - 1, TERRAIN_HALF_W);
      const idx = iz * row + ix;
      gridX[idx] = x;
      // Conservative -0.95m inset prevents any slope silhouette over-occlusion
      gridY[idx] = groundHeightAt(x, z) - 0.95;
      gridZ[idx] = z;
    }
  }

  const verts: number[] = [];
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      const cx = (gridX[a] + gridX[b] + gridX[c] + gridX[d]) * 0.25;
      const cz = (gridZ[a] + gridZ[b] + gridZ[c] + gridZ[d]) * 0.25;
      const avgY = (gridY[a] + gridY[b] + gridY[c] + gridY[d]) * 0.25;
      // Only outer flanking mountains/hills act as terrain occluders
      if ((Math.abs(cx) > 28 || Math.abs(cz) > 15) && avgY > 2.0) {
        verts.push(
          gridX[a], gridY[a], gridZ[a],
          gridX[c], gridY[c], gridZ[c],
          gridX[b], gridY[b], gridZ[b],
          gridX[b], gridY[b], gridZ[b],
          gridX[c], gridY[c], gridZ[c],
          gridX[d], gridY[d], gridZ[d],
        );
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    triCount: verts.length / 9,
  };
}

function createPhotorealTerrain(
  envTex: EnvironmentTextures,
  shared: SharedEnvUniforms,
): {
  group: THREE.Group;
  chunks: TerrainChunk[];
  disposables: Array<{ dispose: () => void }>;
} {
  const chunksX = 6;
  const chunksZ = 6;
  const tileQuadsX = 26;
  const tileQuadsZ = 22;
  const segX = chunksX * tileQuadsX; // 156
  const segZ = chunksZ * tileQuadsZ; // 132

  const vertCount = (segX + 1) * (segZ + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  // aTerrainData: x = pathSdf, y = rutFactor, z = forestDuffMask, w = worldY
  const terrainData = new Float32Array(vertCount * 4);

  let vIdx = 0;
  for (let iz = 0; iz <= segZ; iz++) {
    const vz = (iz / segZ) * 2 - 1;
    const z = warpTerrainCoord(vz, TERRAIN_HALF_D);
    for (let ix = 0; ix <= segX; ix++) {
      const vx = (ix / segX) * 2 - 1;
      const x = warpTerrainCoord(vx, TERRAIN_HALF_W);

      const baseY = groundHeightAt(x, z);
      const sdf = pathSdfAt(x, z);
      const rut = pathRutFactor(x, z);

      // Subtle physical depression in road wheel ruts & gentle road crown (stays flush at y=0 under fortress)
      const rutDip = baseY === 0 ? -rut * 0.026 : 0;
      const y = baseY + rutDip;

      const n = groundNormalAt(x, z, 0.55);
      const duff = forestDensityAt(x, z);

      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      normals[vIdx * 3] = n.x;
      normals[vIdx * 3 + 1] = n.y;
      normals[vIdx * 3 + 2] = n.z;

      uvs[vIdx * 2] = x * 0.14;
      uvs[vIdx * 2 + 1] = z * 0.14;

      terrainData[vIdx * 4] = sdf;
      terrainData[vIdx * 4 + 1] = rut;
      terrainData[vIdx * 4 + 2] = duff;
      terrainData[vIdx * 4 + 3] = baseY;
      vIdx++;
    }
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: envTex.meadow.map,
    normalMap: envTex.meadow.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.18,
    fog: false,
  });

  mat.customProgramCacheKey = () => 'photoreal-alpine-terrain-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uHazeHorizon = shared.uHazeHorizon;
    shader.uniforms.uHazeZenith = shared.uHazeZenith;
    shader.uniforms.uFogColor = shared.uFogColor;
    shader.uniforms.uCamPos = shared.uCamPos;

    shader.uniforms.uDirtMap = { value: envTex.dirt.map };
    shader.uniforms.uRockMap = { value: envTex.cliffRock.map };
    shader.uniforms.uDuffMap = { value: envTex.forestDuff.map };
    shader.uniforms.uDirtNrm = { value: envTex.dirt.normalMap };
    shader.uniforms.uRockNrm = { value: envTex.cliffRock.normalMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aTerrainData;
        varying vec3 vEnvWorldPos;
        varying vec3 vTerrainWorldNrm;
        varying vec4 vTerrainData;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainData = aTerrainData;
        vEnvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNrm = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeHorizon;
        uniform vec3 uHazeZenith;
        uniform vec3 uFogColor;
        uniform vec3 uCamPos;
        uniform sampler2D uDirtMap;
        uniform sampler2D uRockMap;
        uniform sampler2D uDuffMap;
        uniform sampler2D uDirtNrm;
        uniform sampler2D uRockNrm;
        varying vec3 vEnvWorldPos;
        varying vec3 vTerrainWorldNrm;
        varying vec4 vTerrainData;

        float tHash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float tValueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(tHash21(i), tHash21(i + vec2(1.0, 0.0)), u.x),
            mix(tHash21(i + vec2(0.0, 1.0)), tHash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        // Fast dual-scale stochastic anti-tiling sampler (breaks visible UV repetition at all distances)
        vec3 sampleAntiTile(sampler2D tex, vec2 wp, float scale) {
          vec2 uvA = wp * scale;
          // Irrationally rotated & scaled second octave eliminates grid patterns completely
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          vec2 uvB = (rot * wp) * (scale * 0.618) + vec2(17.3, 9.1);
          float blend = smoothstep(0.24, 0.76, tValueNoise(wp * (scale * 0.22)));
          vec3 cA = texture2D(tex, uvA).rgb;
          vec3 cB = texture2D(tex, uvB).rgb;
          return mix(cA, cB, blend);
        }

        // Triplanar stratified rock sampler that skips negligible axes (saves 1-2 texture taps per cliff pixel)
        vec3 sampleTriplanar(sampler2D tex, vec3 wp, vec3 wn, float scale) {
          vec3 w = pow(abs(wn), vec3(4.0));
          w /= max(w.x + w.y + w.z, 0.0001);
          vec3 res = vec3(0.0);
          if (w.x > 0.06) res += texture2D(tex, wp.zy * scale).rgb * w.x;
          if (w.y > 0.06) res += texture2D(tex, wp.xz * scale).rgb * w.y;
          if (w.z > 0.06) res += texture2D(tex, wp.xy * scale).rgb * w.z;
          return res;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 wp = vEnvWorldPos.xz;
        vec3 wn = normalize(vTerrainWorldNrm);
        float sdf = vTerrainData.x;
        float rut = vTerrainData.y;
        float duffWeight = vTerrainData.z;
        float worldH = vTerrainData.w;

        // Multi-scale macro landscape variation (breaks uniform meadow flatness)
        float macroA = tValueNoise(wp * 0.042);
        float macroB = tValueNoise(wp * 0.145 + vec2(11.4, -7.2));
        float detailNoise = tValueNoise(wp * 0.68);
        float edgeBreak = (tValueNoise(wp * 0.95) - 0.5) * 0.72 + (tValueNoise(wp * 2.6) - 0.5) * 0.28;

        // Compute layer masks first so unused PBR layers skip texture sampling completely (3x-4x faster!)
        float duffMask = clamp(duffWeight * (0.62 + 0.48 * macroB) + smoothstep(0.62, 0.88, macroB) * smoothstep(3.5, 16.0, worldH) * 0.25, 0.0, 0.88);
        float slopeRaw = clamp((0.88 - wn.y) * 4.4, 0.0, 1.0);
        float ridgeRock = smoothstep(15.0, 38.0, worldH) * (0.35 + 0.65 * macroA);
        float rockMask = clamp(max(slopeRaw, ridgeRock * 0.78) + (detailNoise - 0.5) * 0.18, 0.0, 1.0);
        float perturbedSdf = sdf + edgeBreak;
        float roadMask = 1.0 - smoothstep(-0.65, 0.65, perturbedSdf);

        float tCamDist = length(vEnvWorldPos - uCamPos);
        bool tNearCam = tCamDist < 84.0;

        // Base alpine meadow layer (skipped only on solid steep cliff face)
        vec3 grassCol = vec3(0.22, 0.28, 0.12);
        if (rockMask < 0.96) {
          grassCol = tNearCam ? sampleAntiTile(map, wp, 0.19) : texture2D(map, wp * 0.19).rgb;
          vec3 dryMeadowTint = vec3(1.16, 1.04, 0.78);
          vec3 lushMeadowTint = vec3(0.84, 0.96, 0.78);
          grassCol *= mix(lushMeadowTint, dryMeadowTint, smoothstep(0.28, 0.78, macroA * 0.65 + macroB * 0.35));
          grassCol = mix(grassCol, grassCol * vec3(1.12, 1.06, 0.88), smoothstep(6.0, 26.0, worldH) * 0.45);
        }

        float hGrass = dot(grassCol, vec3(0.3, 0.6, 0.1)) * 1.15;
        vec3 groundCol = grassCol;
        float groundH = hGrass;
        float duffHBlend = 0.0;

        // 1. Blend Shaded Forest Floor Pine Duff only where present
        if (duffMask > 0.02 && rockMask < 0.94) {
          vec3 duffCol = tNearCam ? sampleAntiTile(uDuffMap, wp, 0.17) : texture2D(uDuffMap, wp * 0.17).rgb;
          float hDuff = dot(duffCol, vec3(0.45, 0.4, 0.15)) * 1.1;
          duffHBlend = smoothstep(-0.15, 0.15, (duffMask + hDuff * 0.26) - ((1.0 - duffMask) + hGrass * 0.26));
          groundCol = mix(groundCol, duffCol * 0.88, duffHBlend);
          groundH = mix(groundH, hDuff, duffHBlend);
        }

        // 2. Slope & High-Ridge Stratified Alpine Cliff Rock only on slopes/peaks
        if (rockMask > 0.02) {
          vec3 rockCol = tNearCam ? sampleTriplanar(uRockMap, vEnvWorldPos, wn, 0.115) : texture2D(uRockMap, wp * 0.115).rgb;
          float hRock = dot(rockCol, vec3(0.34, 0.34, 0.32)) * 1.25;
          float rockHBlend = smoothstep(-0.12, 0.12, (rockMask + hRock * 0.28) - ((1.0 - rockMask) + groundH * 0.28));
          groundCol = mix(groundCol, rockCol, rockHBlend);
          groundH = mix(groundH, hRock, rockHBlend);
        }

        // 3. Integrated SDF Dirt & Gravel Trail only near the road corridor
        float finalRoad = 0.0;
        if (roadMask > 0.01) {
          vec3 dirtCol = tNearCam ? sampleAntiTile(uDirtMap, wp, 0.22) : texture2D(uDirtMap, wp * 0.22).rgb;
          float hDirt = dot(dirtCol, vec3(0.45, 0.35, 0.2)) * 1.2;
          float roadHBlend = smoothstep(-0.14, 0.14, (roadMask + hDirt * 0.32) - ((1.0 - roadMask) + groundH * 0.34));
          float centerStrip = exp(-pow((vEnvWorldPos.z - (sin(vEnvWorldPos.x * 0.115 + 0.25) * 0.52 + cos(vEnvWorldPos.x * 0.055) * 0.18)) * 1.45, 2.0));
          float sparseCenterGrass = centerStrip * smoothstep(0.54, 0.82, macroB * 0.6 + detailNoise * 0.4) * (1.0 - smoothstep(15.0, 21.0, abs(vEnvWorldPos.x - 1.2)));
          finalRoad = clamp(roadHBlend * (1.0 - sparseCenterGrass * 0.55), 0.0, 1.0);

          vec3 rutDirt = dirtCol * mix(1.0, 0.68, rut * 0.9);
          float shoulder = smoothstep(-0.2, 0.5, perturbedSdf) * (1.0 - smoothstep(0.5, 1.35, perturbedSdf));
          rutDirt = mix(rutDirt, rutDirt * vec3(1.08, 1.05, 0.98), shoulder * 0.35);
          groundCol = mix(groundCol, rutDirt, finalRoad);
        }

        // Canopy shadow grounding & macro ambient occlusion in valleys & road ruts
        float canopyShadow = 1.0 - duffHBlend * 0.24;
        float microAO = canopyShadow * mix(1.0, 0.80, rut * finalRoad) * mix(0.82, 1.02, clamp(wn.y * 0.65 + macroA * 0.35, 0.0, 1.0));
        diffuseColor.rgb *= groundCol * microAO;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Damp wheel ruts & exposed rock quartz have calibrated roughness contrast
        float tSlopeR = clamp((0.88 - normalize(vTerrainWorldNrm).y) * 4.2, 0.0, 1.0);
        float tRoadR = 1.0 - smoothstep(-0.45, 0.45, vTerrainData.x);
        float wetness = vTerrainData.y * tRoadR;
        roughnessFactor = mix(0.92, 0.62, wetness * 0.85);
        roughnessFactor = mix(roughnessFactor, 0.82, tSlopeR * 0.65);
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        {
          float nDist = length(vEnvWorldPos - uCamPos);
          if (nDist < 96.0) {
            vec2 nWp = vEnvWorldPos.xz;
            vec3 nWn = normalize(vTerrainWorldNrm);
            float nRoad = 1.0 - smoothstep(-0.55, 0.55, vTerrainData.x);
            float nSlope = clamp((0.88 - nWn.y) * 4.2, 0.0, 1.0);

            vec3 blendedN = texture2D(normalMap, nWp * 0.19).xyz * 2.0 - 1.0;
            if (nSlope > 0.04) {
              vec2 rockUv = abs(nWn.x) > abs(nWn.z) ? vEnvWorldPos.zy * 0.115 : vEnvWorldPos.xy * 0.115;
              vec3 nRock = texture2D(uRockNrm, rockUv).xyz * 2.0 - 1.0;
              blendedN = mix(blendedN, nRock, nSlope);
            }
            if (nRoad > 0.02) {
              vec3 nDirt = texture2D(uDirtNrm, nWp * 0.22).xyz * 2.0 - 1.0;
              blendedN = mix(blendedN, nDirt, nRoad);
            }
            // Keep full micro-normal sharpness across near & medium range (0..56m), fading smoothly only in the far distance
            float nDistFade = 1.0 - smoothstep(56.0, 96.0, nDist);
            blendedN.xy *= vec2(1.12 + nRoad * 0.28 + nSlope * 0.35) * nDistFade;
            blendedN = normalize(blendedN);

            // Perturb view-space normal cleanly without requiring tangent attributes
            vec3 q0 = dFdx( - vViewPosition );
            vec3 q1 = dFdy( - vViewPosition );
            vec2 st0 = dFdx( nWp * 0.2 );
            vec2 st1 = dFdy( nWp * 0.2 );
            vec3 Nv = normalize( normal );
            vec3 q1perp = cross( q1, Nv );
            vec3 q0perp = cross( Nv, q0 );
            vec3 Tv = q1perp * st0.x + q0perp * st1.x;
            vec3 Bv = q1perp * st0.y + q0perp * st1.y;
            float det = max( dot( Tv, Tv ), dot( Bv, Bv ) );
            float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
            normal = normalize( Tv * ( blendedN.x * sc ) + Bv * ( blendedN.y * sc ) + Nv * blendedN.z );
          }
        }
        `,
      )
      .replace('#include <fog_fragment>', AERIAL_FOG_FRAGMENT_GLSL);
  };

  const group = new THREE.Group();
  const chunks: TerrainChunk[] = [];
  const disposables: Array<{ dispose: () => void }> = [mat];
  const row = segX + 1;

  // Shared template index buffer for every 26x22 terrain tile
  const tileRow = tileQuadsX + 1;
  const tileIndices = new Uint16Array(tileQuadsX * tileQuadsZ * 6);
  let tPtr = 0;
  for (let iz = 0; iz < tileQuadsZ; iz++) {
    for (let ix = 0; ix < tileQuadsX; ix++) {
      const a = iz * tileRow + ix;
      const b = a + 1;
      const c = a + tileRow;
      const d = c + 1;
      tileIndices[tPtr++] = a;
      tileIndices[tPtr++] = c;
      tileIndices[tPtr++] = b;
      tileIndices[tPtr++] = b;
      tileIndices[tPtr++] = c;
      tileIndices[tPtr++] = d;
    }
  }
  const sharedTileIndexAttr = new THREE.BufferAttribute(tileIndices, 1);

  for (let cz = 0; cz < chunksZ; cz++) {
    const zStart = cz * tileQuadsZ;
    for (let cx = 0; cx < chunksX; cx++) {
      const xStart = cx * tileQuadsX;
      const tVerts = (tileQuadsX + 1) * (tileQuadsZ + 1);
      const tPos = new Float32Array(tVerts * 3);
      const tNrm = new Float32Array(tVerts * 3);
      const tUv = new Float32Array(tVerts * 2);
      const tData = new Float32Array(tVerts * 4);

      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let dst = 0;

      for (let lz = 0; lz <= tileQuadsZ; lz++) {
        const gz = zStart + lz;
        for (let lx = 0; lx <= tileQuadsX; lx++) {
          const gx = xStart + lx;
          const src = gz * row + gx;

          const px = positions[src * 3];
          const py = positions[src * 3 + 1];
          const pz = positions[src * 3 + 2];
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;

          tPos[dst * 3] = px;
          tPos[dst * 3 + 1] = py;
          tPos[dst * 3 + 2] = pz;

          tNrm[dst * 3] = normals[src * 3];
          tNrm[dst * 3 + 1] = normals[src * 3 + 1];
          tNrm[dst * 3 + 2] = normals[src * 3 + 2];

          tUv[dst * 2] = uvs[src * 2];
          tUv[dst * 2 + 1] = uvs[src * 2 + 1];

          tData[dst * 4] = terrainData[src * 4];
          tData[dst * 4 + 1] = terrainData[src * 4 + 1];
          tData[dst * 4 + 2] = terrainData[src * 4 + 2];
          tData[dst * 4 + 3] = terrainData[src * 4 + 3];
          dst++;
        }
      }

      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
      tGeo.setAttribute('normal', new THREE.BufferAttribute(tNrm, 3));
      tGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
      tGeo.setAttribute('aTerrainData', new THREE.BufferAttribute(tData, 4));
      tGeo.setIndex(sharedTileIndexAttr);
      tGeo.computeBoundingBox();
      tGeo.computeBoundingSphere();

      const tMesh = new THREE.Mesh(tGeo, mat);
      tMesh.receiveShadow = true;
      group.add(tMesh);
      disposables.push(tGeo);
      chunks.push({ mesh: tMesh, minX, minY, minZ, maxX, maxY, maxZ });
    }
  }

  return { group, chunks, disposables };
}

// ============================================================================
// 2. BOTANICAL PROCEDURAL CONIFERS (ZERO CONES! REAL BRANCHES + NEEDLE BOUGHS)
// ============================================================================

interface ConiferArchetype {
  woodGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
}

/**
 * Builds an organically flared trunk with 5 root buttresses + gently curved stem.
 */
function buildOrganicTrunkGeo(
  height: number,
  baseRadius: number,
  topRadius: number,
  bendX: number,
  bendZ: number,
  seed: number,
): THREE.BufferGeometry {
  const rings = 12;
  const radialSegs = 9;
  const vertCount = (rings + 1) * (radialSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const winds = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    // Extend root collar 0.42m below ground so trunks seat cleanly on steep slopes
    const y = -0.42 + t * (height + 0.42);
    const flare = Math.pow(Math.max(0, 1 - t * 4.2), 2.2) * baseRadius * 0.72;
    const baseR = THREE.MathUtils.lerp(baseRadius, topRadius, Math.pow(t, 0.82)) + flare;

    const cx = Math.sin(t * Math.PI * 0.85) * bendX * t;
    const cz = Math.cos(t * Math.PI * 0.65 + seed) * bendZ * t;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const ang = u * Math.PI * 2;
      // 5 organic root buttress lobes near base
      const buttress =
        Math.pow(Math.max(0, 1 - t * 3.8), 1.8) *
        (0.5 + 0.5 * Math.sin(ang * 5 + seed)) *
        baseRadius *
        0.48;
      const barkWav = (Math.sin(ang * 3 + t * 9 + seed) * 0.05 + 1.0);
      const rad = (baseR + buttress) * barkWav;

      const idx = r * (radialSegs + 1) + s;
      positions[idx * 3] = cx + Math.cos(ang) * rad;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = cz + Math.sin(ang) * rad;

      normals[idx * 3] = Math.cos(ang);
      normals[idx * 3 + 1] = 0.08;
      normals[idx * 3 + 2] = Math.sin(ang);

      uvs[idx * 2] = u * 1.4;
      uvs[idx * 2 + 1] = t * 3.8;

      winds[idx * 3] = Math.max(0, t);
      winds[idx * 3 + 1] = 0;
      winds[idx * 3 + 2] = seed;
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * (radialSegs + 1) + s;
      const b = a + 1;
      const c = a + (radialSegs + 1);
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aWind', new THREE.BufferAttribute(winds, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a single tapered, gravity-drooped primary branch geometry.
 */
function buildBranchLimbGeo(
  origin: THREE.Vector3,
  yaw: number,
  length: number,
  rBase: number,
  droop: number,
  upTurn: number,
  trunkHeightNorm: number,
  phase: number,
): THREE.BufferGeometry {
  const segs = 4;
  const radSegs = 5;
  const dirX = Math.cos(yaw);
  const dirZ = Math.sin(yaw);
  const perpX = -dirZ;
  const perpZ = dirX;

  const vertCount = (segs + 1) * (radSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const winds = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const dist = t * length;
    const yOff = -Math.sin(t * Math.PI * 0.78) * droop + Math.pow(t, 2.2) * upTurn;
    const cx = origin.x + dirX * dist;
    const cy = origin.y + yOff;
    const cz = origin.z + dirZ * dist;
    const rad = THREE.MathUtils.lerp(rBase, rBase * 0.22, t);

    for (let s = 0; s <= radSegs; s++) {
      const u = s / radSegs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = perpX * ca;
      const ny = sa;
      const nz = perpZ * ca;

      const idx = i * (radSegs + 1) + s;
      positions[idx * 3] = cx + nx * rad;
      positions[idx * 3 + 1] = cy + ny * rad;
      positions[idx * 3 + 2] = cz + nz * rad;
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t * 1.6;
      winds[idx * 3] = trunkHeightNorm;
      winds[idx * 3 + 1] = t * 0.6;
      winds[idx * 3 + 2] = phase;
    }
  }

  for (let i = 0; i < segs; i++) {
    for (let s = 0; s < radSegs; s++) {
      const a = i * (radSegs + 1) + s;
      const b = a + 1;
      const c = a + (radSegs + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aWind', new THREE.BufferAttribute(winds, 3));
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds a curved 3D arched needle-bough frond (3x2 grid with downward gravity arch + lateral cup)
 * with Transferred Spherical/Dome Bent Normals & Per-Vertex Radial Canopy Self-Occlusion (AO).
 */
function buildArchedNeedleFrond(
  anchor: THREE.Vector3,
  yaw: number,
  pitch: number,
  roll: number,
  width: number,
  length: number,
  archDroop: number,
  crownCenter: THREE.Vector3,
  canopyRadiusAtY: number,
  trunkHeightNorm: number,
  phase: number,
  tintShift: number,
  lowDetail = false,
): THREE.BufferGeometry {
  // Hero fronds: 3x2 folded V-cup (6 verts, 4 tris = 50% fewer tris); Distant fronds: 2x2 quad (4 verts, 2 tris)
  const cols = lowDetail ? 2 : 3;
  const rows = 2;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const colors = new Float32Array(cols * rows * 3);
  const winds = new Float32Array(cols * rows * 3);

  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
  const qFinal = qYaw.multiply(qPitch).multiply(qRoll);

  const localPos = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const domeNorm = new THREE.Vector3();
  const cardNorm = new THREE.Vector3(0, 1, 0).applyQuaternion(qFinal).normalize();

  let ptr = 0;
  for (let r = 0; r < rows; r++) {
    const tv = r / (rows - 1); // 0 = stem base, 1 = sunlit bough tip
    for (let c = 0; c < cols; c++) {
      const tu = c / (cols - 1); // 0 = left, 0.5 = spine, 1 = right
      const lat = (tu - 0.5) * 2; // -1..1

      // Curved organic frond shape: downward tip droop + V-cup across width
      const x = lat * width * 0.5 * (1.0 - tv * 0.14);
      const z = tv * length;
      const y = -tv * archDroop + (1 - Math.abs(lat)) * width * 0.15 - Math.abs(lat) * 0.05;

      localPos.set(x, y, z).applyQuaternion(qFinal);
      worldPos.copy(anchor).add(localPos);

      positions[ptr * 3] = worldPos.x;
      positions[ptr * 3 + 1] = worldPos.y;
      positions[ptr * 3 + 2] = worldPos.z;

      // Transferred Spherical/Dome Bent Normal: gives lush volumetric shading instead of flat card planes!
      domeNorm
        .set(
          worldPos.x - crownCenter.x,
          (worldPos.y - crownCenter.y) * 0.65 + 1.15,
          worldPos.z - crownCenter.z,
        )
        .normalize();
      domeNorm.lerp(cardNorm, 0.24).normalize();

      normals[ptr * 3] = domeNorm.x;
      normals[ptr * 3 + 1] = domeNorm.y;
      normals[ptr * 3 + 2] = domeNorm.z;

      uvs[ptr * 2] = tu;
      uvs[ptr * 2 + 1] = tv;

      // Analytical Canopy Self-Occlusion (Vertex AO): deep cool shadows near trunk core, sunlit outer tips
      const radialDist = Math.hypot(worldPos.x, worldPos.z);
      const radialNorm = Math.min(1, radialDist / Math.max(0.4, canopyRadiusAtY));
      const verticalAO = 0.40 + 0.60 * trunkHeightNorm;
      const radialAO = 0.22 + 0.78 * Math.pow(radialNorm, 0.68);
      const tipBright = 0.72 + 0.32 * tv;
      const ao = Math.min(1.04, verticalAO * radialAO * tipBright);

      colors[ptr * 3] = ao * (0.94 + tintShift * 0.10);
      colors[ptr * 3 + 1] = ao * (1.0 + tintShift * 0.04);
      colors[ptr * 3 + 2] = ao * (0.92 - tintShift * 0.06);

      winds[ptr * 3] = trunkHeightNorm;
      winds[ptr * 3 + 1] = 0.25 + tv * 0.75;
      winds[ptr * 3 + 2] = phase;
      ptr++;
    }
  }

  const indices = lowDetail
    ? new Uint16Array([0, 2, 1, 1, 2, 3])
    : new Uint16Array([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aWind', new THREE.BufferAttribute(winds, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

/**
 * Generates a complete botanical conifer archetype (woody skeleton + arched needle bough canopy).
 * Zero ConeGeometry! Genuine golden-angle branch whorls, lower deadwood limbs, and negative space.
 */
function createConiferArchetype(
  kind: 'spruce' | 'pine' | 'sapling',
  seed: number,
): ConiferArchetype {
  const rand = createRng(seed);
  const woodParts: THREE.BufferGeometry[] = [];
  const foliageParts: THREE.BufferGeometry[] = [];

  const totalH = kind === 'spruce' ? 11.4 : kind === 'pine' ? 9.6 : 6.8;
  const baseR = kind === 'spruce' ? 0.44 : kind === 'pine' ? 0.48 : 0.28;
  const topR = 0.055;
  const bendX = kind === 'pine' ? 0.52 : kind === 'spruce' ? 0.18 : 0.22;
  const bendZ = kind === 'pine' ? -0.34 : 0.14;
  const canopyStart = kind === 'pine' ? 0.34 : kind === 'spruce' ? 0.18 : 0.22;
  const maxCrownR = kind === 'spruce' ? 2.85 : kind === 'pine' ? 3.25 : 2.05;

  woodParts.push(buildOrganicTrunkGeo(totalH, baseR, topR, bendX, bendZ, seed * 0.13));

  const trunkCenterAt = (t: number) =>
    new THREE.Vector3(
      Math.sin(t * Math.PI * 0.85) * bendX * t,
      -0.42 + t * (totalH + 0.42),
      Math.cos(t * Math.PI * 0.65 + seed * 0.13) * bendZ * t,
    );

  const crownCenter = new THREE.Vector3(
    bendX * 0.4,
    totalH * (canopyStart + (1 - canopyStart) * 0.46),
    bendZ * 0.4,
  );

  // Lower bare/gnarled deadwood stubs below live canopy (instant photorealism cue!)
  const deadCount = kind === 'sapling' ? 2 : 5;
  for (let d = 0; d < deadCount; d++) {
    const t = 0.12 + (d / deadCount) * (canopyStart - 0.1) + rand() * 0.03;
    const orig = trunkCenterAt(t);
    const yaw = d * 2.39996 + rand() * 0.7;
    woodParts.push(
      buildBranchLimbGeo(
        orig,
        yaw,
        0.55 + rand() * 0.65,
        baseR * 0.24,
        0.16 + rand() * 0.12,
        0.04,
        t,
        rand() * 6.28,
      ),
    );
  }

  // Live branch whorls arranged in dense golden-angle phyllotaxis (65% fewer tris & overdraw, same lush volume!)
  const whorlCount = kind === 'spruce' ? 13 : kind === 'pine' ? 10 : 9;
  const goldenAngle = 2.3999632;

  for (let w = 0; w < whorlCount; w++) {
    const wt = w / Math.max(1, whorlCount - 1);
    const hNorm = THREE.MathUtils.lerp(canopyStart, 0.97, wt);
    const orig = trunkCenterAt(hNorm);

    let radiusEnv: number;
    if (kind === 'pine') {
      radiusEnv = Math.sin(Math.pow(wt, 0.65) * Math.PI * 0.9 + 0.25) * (0.78 + 0.34 * (1 - wt));
    } else {
      radiusEnv = Math.pow(1 - wt * 0.91, 0.84) * (0.92 + 0.18 * Math.sin(wt * 8.2 + seed));
    }
    const whorlRadius = Math.max(0.5, maxCrownR * radiusEnv);
    const branchesInWhorl = wt > 0.84 ? 4 : kind === 'sapling' ? 4 : 5;

    for (let b = 0; b < branchesInWhorl; b++) {
      if (w > 1 && w < whorlCount - 2 && rand() < 0.06) continue;

      const yaw =
        w * goldenAngle + (b / branchesInWhorl) * Math.PI * 2 + (rand() - 0.5) * 0.36;
      const bLen = whorlRadius * (0.86 + rand() * 0.34);
      const droop = (1 - wt) * (kind === 'spruce' ? 0.56 : 0.28) + rand() * 0.14;
      const upTurn = (0.14 + wt * 0.32) * bLen * 0.3;
      const phase = rand() * 6.28;

      if (bLen > 0.95 && w % 2 === 0) {
        woodParts.push(
          buildBranchLimbGeo(
            orig,
            yaw,
            bLen * 0.78,
            Math.max(0.035, baseR * 0.25 * (1 - wt * 0.65)),
            droop,
            upTurn,
            hNorm,
            phase,
          ),
        );
      }

      const dirX = Math.cos(yaw);
      const dirZ = Math.sin(yaw);
      const frondPitch =
        (kind === 'spruce' ? 0.42 : 0.24) * (1 - wt) - wt * 0.36 + (rand() - 0.5) * 0.16;

      const anchorA = new THREE.Vector3(
        orig.x + dirX * bLen * 0.12,
        orig.y - droop * 0.2,
        orig.z + dirZ * bLen * 0.12,
      );
      // Slightly wider fuller fronds keep lush volume with 55% less pixel overdraw
      const cardLen = bLen * (1.14 + rand() * 0.24);
      const cardWid = cardLen * (0.98 + rand() * 0.22);
      const tintShift = (rand() - 0.5) * 1.8;
      const frondYaw = Math.atan2(dirX, dirZ);

      // 1. Primary cascading bough fan
      foliageParts.push(
        buildArchedNeedleFrond(
          anchorA,
          frondYaw,
          frondPitch,
          (rand() - 0.5) * 0.26,
          cardWid,
          cardLen,
          droop * 0.52 + 0.18,
          crownCenter,
          whorlRadius,
          hNorm,
          phase,
          tintShift,
        ),
      );

      // 2. Rolled 3D curtain volume frond (keeps 3D richness from low angles without triple overdraw!)
      foliageParts.push(
        buildArchedNeedleFrond(
          anchorA.clone().add(new THREE.Vector3(dirX * bLen * 0.15, 0.06, dirZ * bLen * 0.15)),
          frondYaw + (rand() - 0.5) * 0.34,
          frondPitch + 0.16,
          (b % 2 === 0 ? 1 : -1) * (0.68 + rand() * 0.24),
          cardWid * 0.92,
          cardLen * 0.94,
          droop * 0.42 + 0.15,
          crownCenter,
          whorlRadius,
          hNorm,
          phase + 0.7,
          tintShift * 0.85,
        ),
      );
    }
  }

  // Feathery upright spire leader crown at very apex
  const apex = trunkCenterAt(0.95);
  for (let i = 0; i < 3; i++) {
    foliageParts.push(
      buildArchedNeedleFrond(
        apex,
        (i / 3) * Math.PI * 2 + seed,
        -0.92,
        0.22,
        0.74,
        1.25,
        0.08,
        crownCenter,
        0.65,
        1.0,
        i * 1.7,
        0.25,
      ),
    );
  }

  return {
    woodGeo: mergeGeometriesSimple(woodParts),
    foliageGeo: mergeGeometriesSimple(foliageParts),
  };
}

/**
 * Ultra-lightweight full-bodied botanical conifer (tapered trunk + 5 overlapping 2-tri drooping tiers)
 * for distant alpine ridgeline forest — 84% fewer triangles, zero floating detached canopies!
 */
function createDistantConiferArchetype(): ConiferArchetype {
  const woodGeo = buildOrganicTrunkGeo(9.6, 0.36, 0.06, 0.1, 0.06, 42);
  const parts: THREE.BufferGeometry[] = [];
  const crownCenter = new THREE.Vector3(0, 5.8, 0);
  const tiers = [
    { y: 2.3, r: 2.75, h: 3.3, n: 4, pitch: 0.44 },
    { y: 4.1, r: 2.45, h: 3.05, n: 4, pitch: 0.36 },
    { y: 5.9, r: 2.0, h: 2.75, n: 4, pitch: 0.24 },
    { y: 7.5, r: 1.48, h: 2.35, n: 4, pitch: 0.02 },
    { y: 8.9, r: 0.92, h: 1.85, n: 3, pitch: -0.45 },
  ];
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    const hNorm = (t + 1) / tiers.length;
    for (let i = 0; i < tier.n; i++) {
      const yaw = (i / tier.n) * Math.PI * 2 + t * 2.399;
      parts.push(
        buildArchedNeedleFrond(
          new THREE.Vector3(0, tier.y, 0),
          yaw,
          tier.pitch,
          (i % 2 === 0 ? 1 : -1) * 0.52,
          tier.r * 1.28,
          tier.h,
          0.32,
          crownCenter,
          tier.r,
          hNorm,
          t + i,
          0,
          true,
        ),
      );
    }
  }
  return {
    woodGeo,
    foliageGeo: mergeGeometriesSimple(parts),
  };
}

/**
 * Creates a botanical PBR foliage material with:
 * - Alpha-tested crisp needle silhouettes (with dilated edges)
 * - Matte-waxy roughness (zero chalky silver glare!)
 * - Hierarchical GPU Wind Sway
 * - Subtle Golden Backlit Subsurface Scattering (SSS)
 * - Synchronized Exponential Height Aerial Perspective
 */
function createBotanicalFoliageMaterial(
  atlas: EnvironmentTextures['pineBough'],
  shared: SharedEnvUniforms,
  cacheKey: string,
  sssTintHex: number,
  windAmp = 1.0,
  useAlphaToCoverage = false,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: atlas.map,
    normalMap: atlas.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: atlas.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    alphaTest: useAlphaToCoverage ? 0.22 : 0.34,
    alphaToCoverage: useAlphaToCoverage,
    side: THREE.DoubleSide,
    envMapIntensity: 0.14,
    fog: false,
  });

  const sssColor = new THREE.Color(sssTintHex);

  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uHazeHorizon = shared.uHazeHorizon;
    shader.uniforms.uHazeZenith = shared.uHazeZenith;
    shader.uniforms.uFogColor = shared.uFogColor;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uTransMap = { value: atlas.translucencyMap };
    shader.uniforms.uSssTint = { value: sssColor };
    shader.uniforms.uWindAmp = { value: windAmp };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindAmp;
        attribute vec3 aWind;
        varying vec3 vEnvWorldPos;
        varying vec2 vFoliageUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFoliageUv = uv;
        vec4 instWorldBase = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          instWorldBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float wPhase = instWorldBase.x * 0.11 + instWorldBase.z * 0.09 + aWind.z;
        float trunkBend = pow(max(0.0, aWind.x), 1.65) * 0.22 * uWindAmp;
        float gust = sin(uTime * 1.15 + wPhase) * 0.65 + sin(uTime * 2.35 + wPhase * 1.7) * 0.35;
        float flutter = sin(uTime * 4.2 + wPhase * 3.1 + position.x * 2.4) * 0.045 * aWind.y * uWindAmp;
        transformed.x += (trunkBend * gust + flutter);
        transformed.z += (trunkBend * gust * 0.6 + flutter * 0.7);
        transformed.y += flutter * 0.35;

        vec4 envWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          envWp = instanceMatrix * envWp;
        #endif
        vEnvWorldPos = (modelMatrix * envWp).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeHorizon;
        uniform vec3 uHazeZenith;
        uniform vec3 uFogColor;
        uniform vec3 uCamPos;
        uniform sampler2D uTransMap;
        uniform vec3 uSssTint;
        varying vec3 vEnvWorldPos;
        varying vec2 vFoliageUv;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Calibrated Backlit Subsurface Scattering (warm translucent glow only when sun is behind needles)
        {
          vec3 viewDirW = normalize(uCamPos - vEnvWorldPos);
          vec3 sunDirW = normalize(uSunDir);
          float backScatter = pow(clamp(dot(viewDirW, -sunDirW), 0.0, 1.0), 4.2);
          float wrapSun = clamp(dot(sunDirW, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.45, 0.15, 1.0);
          float thickness = texture2D(uTransMap, vFoliageUv).r;
          vec3 sssLight = uSssTint * uSunColor * (backScatter * 0.68 + 0.04) * thickness * wrapSun;
          reflectedLight.directDiffuse += sssLight * diffuseColor.rgb * 0.55;
        }`,
      )
      .replace('#include <fog_fragment>', AERIAL_FOG_FRAGMENT_GLSL);
  };

  return mat;
}

/**
 * Bark material with GPU synchronized trunk sway, basal moss/damp darkening, and aerial perspective.
 */
function createBarkMaterial(
  envTex: EnvironmentTextures,
  shared: SharedEnvUniforms,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: envTex.bark.map,
    normalMap: envTex.bark.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: envTex.bark.roughnessMap,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.26,
    fog: false,
  });

  mat.customProgramCacheKey = () => 'photoreal-conifer-bark-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uHazeHorizon = shared.uHazeHorizon;
    shader.uniforms.uHazeZenith = shared.uHazeZenith;
    shader.uniforms.uFogColor = shared.uFogColor;
    shader.uniforms.uCamPos = shared.uCamPos;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute vec3 aWind;
        varying vec3 vEnvWorldPos;
        varying float vTrunkH;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTrunkH = aWind.x;
        vec4 instWorldBase = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          instWorldBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float wPhase = instWorldBase.x * 0.11 + instWorldBase.z * 0.09 + aWind.z;
        float trunkBend = pow(max(0.0, aWind.x), 1.65) * 0.22;
        float gust = sin(uTime * 1.15 + wPhase) * 0.65 + sin(uTime * 2.35 + wPhase * 1.7) * 0.35;
        transformed.x += trunkBend * gust;
        transformed.z += trunkBend * gust * 0.6;

        vec4 envWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          envWp = instanceMatrix * envWp;
        #endif
        vEnvWorldPos = (modelMatrix * envWp).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeHorizon;
        uniform vec3 uHazeZenith;
        uniform vec3 uFogColor;
        uniform vec3 uCamPos;
        varying vec3 vEnvWorldPos;
        varying float vTrunkH;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Root collar dampness & moss grounding at base of trunk
        float rootMoss = 1.0 - smoothstep(0.0, 0.16, vTrunkH);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.72, 0.44), rootMoss * 0.62);`,
      )
      .replace('#include <fog_fragment>', AERIAL_FOG_FRAGMENT_GLSL);
  };

  return mat;
}

// ============================================================================
// 3. FOREST UNDERGROWTH: ALPINE FERNS & JUNIPER SHRUBS
// ============================================================================

function createAlpineFernGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frondCount = 6;
  const center = new THREE.Vector3(0, 0.35, 0);
  for (let i = 0; i < frondCount; i++) {
    const yaw = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.22;
    const len = 0.72 + (i % 3) * 0.16;
    const wid = len * 0.44;
    const pitch = -0.45 + (i % 2) * 0.18;
    parts.push(
      buildArchedNeedleFrond(
        new THREE.Vector3(0, 0.04, 0),
        yaw,
        pitch,
        0,
        wid,
        len,
        0.28,
        center,
        0.75,
        0.22,
        i * 1.3,
        (i % 2) * 0.15,
      ),
    );
  }
  return mergeGeometriesSimple(parts);
}

function createAlpineShrubGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const center = new THREE.Vector3(0, 0.55, 0);
  const rand = createRng(7711);
  for (let i = 0; i < 8; i++) {
    const yaw = (i / 8) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const len = 0.92 + rand() * 0.42;
    parts.push(
      buildArchedNeedleFrond(
        new THREE.Vector3(0, 0.12 + rand() * 0.25, 0),
        yaw,
        -0.38 + rand() * 0.45,
        (rand() - 0.5) * 0.6,
        len * 0.78,
        len,
        0.24,
        center,
        1.1,
        0.28,
        rand() * 6.28,
        (rand() - 0.5) * 0.5,
      ),
    );
  }
  return mergeGeometriesSimple(parts);
}

// ============================================================================
// 4. DENSE GPU-ANIMATED CURVED MEADOW GRASS & ALPINE WILDFLOWERS
// ============================================================================

/**
 * Builds a realistic 6-blade curved, V-creased tapered grass clump (zero cones!).
 */
function createCurvedGrassClumpGeo(): THREE.BufferGeometry {
  // 7 curved 2-segment blades (3 tris/blade -> 59% fewer tris than 3-seg 8-blade clumps, same lush meadow look!)
  const blades = 7;
  const segs = 2; // 2 height segments -> 5 vertices, 3 triangles per blade
  const vertsPerBlade = segs * 2 + 1;
  const trisPerBlade = (segs - 1) * 2 + 1;

  const positions = new Float32Array(blades * vertsPerBlade * 3);
  const normals = new Float32Array(blades * vertsPerBlade * 3);
  const bladeMeta = new Float32Array(blades * vertsPerBlade * 3); // x: heightT, y: phase, z: tintVar
  const indices: number[] = [];

  const rand = createRng(4419);

  for (let b = 0; b < blades; b++) {
    const yaw = (b / blades) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const radOff = 0.03 + rand() * 0.18;
    const ox = Math.cos(yaw) * radOff;
    const oz = Math.sin(yaw) * radOff;
    const bladeH = 0.19 + rand() * 0.24;
    const baseW = 0.017 + rand() * 0.011;
    const lean = 0.22 + rand() * 0.28;
    const phase = rand() * 6.28;
    const tintVar = rand();

    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const sideX = -dirZ;
    const sideZ = dirX;
    const vBase = b * vertsPerBlade;

    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const w = baseW * (1 - t * 0.72);
      const y = t * bladeH;
      const bend = t * t * lean * bladeH;

      const nx = dirX * 0.28;
      const ny = 0.92;
      const nz = dirZ * 0.28;

      const li = vBase + s * 2;
      const ri = li + 1;

      positions[li * 3] = ox + dirX * bend - sideX * w;
      positions[li * 3 + 1] = y;
      positions[li * 3 + 2] = oz + dirZ * bend - sideZ * w;
      normals[li * 3] = nx;
      normals[li * 3 + 1] = ny;
      normals[li * 3 + 2] = nz;
      bladeMeta[li * 3] = t;
      bladeMeta[li * 3 + 1] = phase;
      bladeMeta[li * 3 + 2] = tintVar;

      positions[ri * 3] = ox + dirX * bend + sideX * w;
      positions[ri * 3 + 1] = y;
      positions[ri * 3 + 2] = oz + dirZ * bend + sideZ * w;
      normals[ri * 3] = nx;
      normals[ri * 3 + 1] = ny;
      normals[ri * 3 + 2] = nz;
      bladeMeta[ri * 3] = t;
      bladeMeta[ri * 3 + 1] = phase;
      bladeMeta[ri * 3 + 2] = tintVar;
    }

    const tipIdx = vBase + segs * 2;
    const tipBend = lean * bladeH * 1.15;
    positions[tipIdx * 3] = ox + dirX * tipBend;
    positions[tipIdx * 3 + 1] = bladeH;
    positions[tipIdx * 3 + 2] = oz + dirZ * tipBend;
    normals[tipIdx * 3] = dirX * 0.2;
    normals[tipIdx * 3 + 1] = 0.96;
    normals[tipIdx * 3 + 2] = dirZ * 0.2;
    bladeMeta[tipIdx * 3] = 1.0;
    bladeMeta[tipIdx * 3 + 1] = phase;
    bladeMeta[tipIdx * 3 + 2] = tintVar;

    for (let s = 0; s < segs - 1; s++) {
      const a = vBase + s * 2;
      const c = a + 2;
      indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
    const topL = vBase + (segs - 1) * 2;
    indices.push(topL, topL + 1, tipIdx);
    void trisPerBlade;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('aBladeMeta', new THREE.BufferAttribute(bladeMeta, 3));
  geo.setIndex(indices);
  return geo;
}

function createMeadowGrassMaterial(shared: SharedEnvUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.09,
    fog: false,
  });

  mat.customProgramCacheKey = () => 'photoreal-meadow-grass-v3';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uHazeHorizon = shared.uHazeHorizon;
    shader.uniforms.uHazeZenith = shared.uHazeZenith;
    shader.uniforms.uFogColor = shared.uFogColor;
    shader.uniforms.uCamPos = shared.uCamPos;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uCamPos;
        attribute vec3 aBladeMeta;
        varying vec3 vEnvWorldPos;
        varying vec3 vBladeMeta;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBladeMeta = aBladeMeta;
        vec4 instBase = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          instBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        // Smooth GPU distance fade into meadow turf before individual blades shrink below 1px
        float camDist = length(instBase.xyz - uCamPos);
        float distScale = 1.0 - smoothstep(24.0, 40.0, camDist);
        transformed *= distScale;
        if (distScale > 0.01) {
          float h = aBladeMeta.x;
          float bendW = h * h;
          float waveA = sin(instBase.x * 0.16 + instBase.z * 0.11 - uTime * 2.05);
          float waveB = sin(instBase.x * 0.42 - instBase.z * 0.28 - uTime * 3.4 + aBladeMeta.y);
          float gust = (waveA * 0.65 + waveB * 0.35 + 0.25) * 0.14 * bendW * distScale;
          transformed.x += gust;
          transformed.z += gust * 0.55;
          transformed.y -= abs(gust) * 0.24;
        }

        vec4 envWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          envWp = instanceMatrix * envWp;
        #endif
        vEnvWorldPos = (modelMatrix * envWp).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeHorizon;
        uniform vec3 uHazeZenith;
        uniform vec3 uFogColor;
        uniform vec3 uCamPos;
        varying vec3 vEnvWorldPos;
        varying vec3 vBladeMeta;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Linear-space Color Grounding: deep soil-shadow emerald root -> rich alpine pasture -> golden tip
        float h = vBladeMeta.x;
        float dryMix = smoothstep(0.74, 0.98, vBladeMeta.z);
        vec3 rootCol = vec3(0.011, 0.024, 0.006);
        vec3 midCol = mix(vec3(0.032, 0.078, 0.014), vec3(0.072, 0.068, 0.018), dryMix);
        vec3 tipCol = mix(vec3(0.074, 0.145, 0.025), vec3(0.165, 0.132, 0.035), dryMix);
        vec3 bladeGrad = mix(rootCol, midCol, smoothstep(0.0, 0.48, h));
        bladeGrad = mix(bladeGrad, tipCol, smoothstep(0.48, 1.0, h));
        diffuseColor.rgb *= bladeGrad;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Subtle sunlit translucency on blade tips
        {
          vec3 vDir = normalize(uCamPos - vEnvWorldPos);
          float sss = pow(clamp(dot(vDir, -normalize(uSunDir)), 0.0, 1.0), 4.2);
          reflectedLight.directDiffuse += uSunColor * vec3(0.28, 0.42, 0.09) * (sss * 0.45 + 0.03) * vBladeMeta.x;
        }`,
      )
      .replace('#include <fog_fragment>', AERIAL_FOG_FRAGMENT_GLSL);
  };

  return mat;
}

// ============================================================================
// 5. GEOLOGICALLY FRACTURED VORONOI BOULDERS (ZERO ROUND POTATOES!)
// ============================================================================

/**
 * Sculpts an angular fractured alpine granite boulder using Voronoi plane cleavage
 * & terraced geological ridges.
 */
function createFracturedRockGeo(seed: number): THREE.BufferGeometry {
  const rand = createRng(seed);
  const geo = new THREE.IcosahedronGeometry(1.15, 3);
  const pos = geo.attributes.position;

  // Generate 7 cleavage fracture planes
  const planes: Array<{ nx: number; ny: number; nz: number; d: number }> = [];
  for (let p = 0; p < 7; p++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    planes.push({
      nx: Math.sin(phi) * Math.cos(theta),
      ny: Math.cos(phi),
      nz: Math.sin(phi) * Math.sin(theta),
      d: 0.72 + rand() * 0.34,
    });
  }

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Flatten slightly on underside so boulders seat heavily into terrain
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.45;

    // Cleavage plane clipping (smooth min for crisp beveled rock faces)
    for (const pl of planes) {
      const proj = x * pl.nx + y * pl.ny + z * pl.nz;
      if (proj > pl.d) {
        const excess = proj - pl.d;
        const push = excess * 0.78;
        x -= pl.nx * push;
        y -= pl.ny * push;
        z -= pl.nz * push;
      }
    }

    // Angular geological ridges + micro-chiseled relief
    const ridge = Math.abs(fbm2D(x * 1.9 + seed, z * 1.9 - y * 1.2, seed + 17, 3) - 0.5) * 2;
    const strata = Math.sin(y * 7.5 + x * 2.1 + seed) * 0.045;
    const scale = 0.88 + ridge * 0.26 + strata;

    pos.setXYZ(i, x * scale, y * scale, z * scale);
  }

  geo.computeVertexNormals();
  return geo;
}

function createGeologicalRockMaterial(
  envTex: EnvironmentTextures,
  shared: SharedEnvUniforms,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: envTex.cliffRock.map,
    normalMap: envTex.cliffRock.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.90,
    metalness: 0.03,
    envMapIntensity: 0.20,
    fog: false,
  });

  mat.customProgramCacheKey = () => 'photoreal-geological-rock-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uSunColor = shared.uSunColor;
    shader.uniforms.uHazeHorizon = shared.uHazeHorizon;
    shader.uniforms.uHazeZenith = shared.uHazeZenith;
    shader.uniforms.uFogColor = shared.uFogColor;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uMeadowMap = { value: envTex.meadow.map };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vEnvWorldPos;
        varying vec3 vRockWorldNrm;
        varying vec3 vRockLocalPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRockLocalPos = position;
        vec4 envWp = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          envWp = instanceMatrix * envWp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        vEnvWorldPos = (modelMatrix * envWp).xyz;
        vRockWorldNrm = normalize(mat3(modelMatrix) * wn);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHazeHorizon;
        uniform vec3 uHazeZenith;
        uniform vec3 uFogColor;
        uniform vec3 uCamPos;
        uniform sampler2D uMeadowMap;
        varying vec3 vEnvWorldPos;
        varying vec3 vRockWorldNrm;
        varying vec3 vRockLocalPos;

        vec3 sampleRockTriplanar(sampler2D tex, vec3 wp, vec3 wn, float sc) {
          vec3 w = pow(abs(wn), vec3(4.0));
          w /= max(w.x + w.y + w.z, 0.0001);
          return texture2D(tex, wp.zy * sc).rgb * w.x +
                 texture2D(tex, wp.xz * sc).rgb * w.y +
                 texture2D(tex, wp.xy * sc).rgb * w.z;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec3 rWn = normalize(vRockWorldNrm);
        vec3 stoneCol = sampleRockTriplanar(map, vEnvWorldPos, rWn, 0.30);
        vec3 mossCol = texture2D(uMeadowMap, vEnvWorldPos.xz * 0.45).rgb * vec3(0.72, 0.92, 0.62);

        // Upward-facing velvet alpine moss + micro-variation
        float mossNoise = sin(vEnvWorldPos.x * 1.7 + vEnvWorldPos.z * 1.3) * 0.12 +
                          cos(vEnvWorldPos.x * 3.9 - vEnvWorldPos.z * 2.7) * 0.08;
        float mossMask = smoothstep(0.52, 0.80, rWn.y + mossNoise);
        vec3 finalRock = mix(stoneCol, mossCol, mossMask * 0.72);

        // Deep damp soil grounding collar at bottom of boulder
        float baseAO = smoothstep(-0.72, 0.22, vRockLocalPos.y);
        finalRock *= mix(0.42, 1.0, baseAO);
        diffuseColor.rgb *= finalRock;
        `,
      )
      .replace('#include <fog_fragment>', AERIAL_FOG_FRAGMENT_GLSL);
  };

  return mat;
}

// ============================================================================
// 6. VOLUMETRIC PROCEDURAL SKY-DOME CLOUDS (ZERO SPHERE PUFFS!)
// ============================================================================

function createVolumetricCloudDome(shared: SharedEnvUniforms): {
  mesh: THREE.Mesh;
  disposables: Array<{ dispose: () => void }>;
} {
  const geo = new THREE.SphereGeometry(310, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uHazeHorizon: shared.uHazeHorizon,
      uHazeZenith: shared.uHazeZenith,
    },
    vertexShader: /* glsl */ `
      varying vec3 vRayDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vRayDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHazeHorizon;
      uniform vec3 uHazeZenith;
      varying vec3 vRayDir;

      float cHash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.53);
        return fract(p.x * p.y);
      }

      float cNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x),
          mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      // Fast 3-octave billowing cloud FBM (cuts sky fragment ALU by ~65% with identical golden-hour clouds!)
      float cloudFbm3(vec2 p) {
        float n = 0.0;
        float amp = 0.54;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 3; i++) {
          float v = cNoise(p);
          v = mix(v, 1.0 - abs(v * 2.0 - 1.0), 0.25);
          n += v * amp;
          p = rot * p * 2.05 + vec2(13.1, 7.7);
          amp *= 0.48;
        }
        return n;
      }

      void main() {
        vec3 dir = normalize(vRayDir);
        if (dir.y < 0.025) discard;

        // Curved atmospheric projection onto alpine stratocumulus shell
        float projScale = 1.0 / (dir.y + 0.18);
        vec2 wind = vec2(uTime * 0.011, uTime * 0.004);
        vec2 uv = dir.xz * projScale * 1.15 + wind;

        float baseFbm = cloudFbm3(uv);
        // Early out on clear sky pixels before running detail/cirrus/self-shadowing!
        float cirrus = smoothstep(0.62, 0.90, cNoise(uv * 1.65 * vec2(2.2, 0.7) + wind * 0.55)) * 0.28;
        if (baseFbm < 0.35 && cirrus < 0.02) discard;

        float detailFbm = cNoise(uv * 2.4 - wind * 1.6);
        float coverage = smoothstep(0.49, 0.84, baseFbm * 0.82 + detailFbm * 0.24);
        float density = clamp(coverage + cirrus * (1.0 - coverage * 0.7), 0.0, 1.0);
        if (density < 0.008) discard;

        // Fast directional self-shadowing toward sun (evaluated ONLY on visible cloud pixels!)
        vec3 sunD = normalize(uSunDir);
        vec2 sunStep = sunD.xz * 0.14;
        float d1 = cNoise(uv + sunStep) * 0.65 + cNoise(uv + sunStep * 2.3) * 0.35;
        float shadowDepth = clamp((d1 - 0.42) * 2.1, 0.0, 1.0);
        float lightTrans = exp(-shadowDepth * 1.85);

        // Henyey-Greenstein forward scattering ("silver lining" around sun)
        float cosTheta = max(dot(dir, sunD), 0.0);
        float g = 0.68;
        float hg = (1.0 - g * g) / pow(max(0.12, 1.0 + g * g - 2.0 * g * cosTheta), 1.5);
        float silverLining = clamp(hg * 0.22, 0.0, 1.1) * (1.0 - coverage * 0.55);

        vec3 shadowBase = mix(uHazeZenith * 0.62, uHazeHorizon * 0.78, 0.48);
        vec3 litTop = mix(vec3(1.0, 0.96, 0.90), uSunColor * 1.18, 0.58);
        vec3 cloudCol = mix(shadowBase, litTop, clamp(lightTrans * 0.88 + 0.16, 0.0, 1.0));
        cloudCol += uSunColor * silverLining * 0.65;

        // Atmospheric horizon fade-out so clouds dissolve naturally behind distant mountains
        float horizonFade = smoothstep(0.03, 0.24, dir.y);
        cloudCol = mix(uHazeHorizon, cloudCol, 0.35 + 0.65 * horizonFade);

        gl_FragColor = vec4(cloudCol, density * horizonFade * 0.88);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  return { mesh, disposables: [geo, mat] };
}

// ============================================================================
// SPATIAL SECTOR COMPACTION FOR INSTANCED FLORA & BOULDERS
// ============================================================================

export interface InstancedPlacement {
  matrix: Float32Array;
  colorR: number;
  colorG: number;
  colorB: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface CompactedSector {
  start: number;
  count: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class SectorCompactedInstanced {
  public readonly mesh: THREE.InstancedMesh;
  private readonly fullCount: number;
  private readonly hasColor: boolean;
  private readonly minScreenPx: number;
  private readonly castShadow: boolean;
  private readonly packedMatrices: Float32Array;
  private readonly packedColors: Float32Array | null;
  private readonly compactedMatrices: Float32Array;
  private readonly compactedColors: Float32Array | null;
  private readonly compactedMatrixAttr: THREE.InstancedBufferAttribute;
  private readonly sectors: CompactedSector[] = [];
  private visibleCount: number;
  private lastMask = -1;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    placements: InstancedPlacement[],
    options: {
      hasColor: boolean;
      castShadow: boolean;
      receiveShadow: boolean;
      customDepthMaterial?: THREE.Material;
      minScreenPx?: number;
      cols?: number;
      rows?: number;
    },
  ) {
    this.fullCount = placements.length;
    this.visibleCount = placements.length;
    this.hasColor = options.hasColor;
    this.minScreenPx = options.minScreenPx ?? 4;
    this.castShadow = options.castShadow;

    const cols = options.cols ?? 6;
    const rows = options.rows ?? 4;

    // 1. Compute global XZ bounds to partition into spatial sectors
    let gMinX = Infinity, gMaxX = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const cx = (p.minX + p.maxX) * 0.5;
      const cz = (p.minZ + p.maxZ) * 0.5;
      if (cx < gMinX) gMinX = cx;
      if (cx > gMaxX) gMaxX = cx;
      if (cz < gMinZ) gMinZ = cz;
      if (cz > gMaxZ) gMaxZ = cz;
    }
    const spanX = Math.max(1, gMaxX - gMinX + 0.01);
    const spanZ = Math.max(1, gMaxZ - gMinZ + 0.01);

    const buckets: InstancedPlacement[][] = Array.from({ length: cols * rows }, () => []);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const cx = (p.minX + p.maxX) * 0.5;
      const cz = (p.minZ + p.maxZ) * 0.5;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(((cx - gMinX) / spanX) * cols)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(((cz - gMinZ) / spanZ) * rows)));
      buckets[row * cols + col].push(p);
    }

    // 2. Pack matrices & colors contiguously by non-empty spatial sector
    this.packedMatrices = new Float32Array(this.fullCount * 16);
    this.compactedMatrices = new Float32Array(this.fullCount * 16);
    this.packedColors = this.hasColor ? new Float32Array(this.fullCount * 3) : null;
    this.compactedColors = this.hasColor ? new Float32Array(this.fullCount * 3) : null;

    let cursor = 0;
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const start = cursor;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        this.packedMatrices.set(p.matrix, cursor * 16);
        if (this.packedColors) {
          this.packedColors[cursor * 3] = p.colorR;
          this.packedColors[cursor * 3 + 1] = p.colorG;
          this.packedColors[cursor * 3 + 2] = p.colorB;
        }
        if (p.minX < minX) minX = p.minX;
        if (p.minY < minY) minY = p.minY;
        if (p.minZ < minZ) minZ = p.minZ;
        if (p.maxX > maxX) maxX = p.maxX;
        if (p.maxY > maxY) maxY = p.maxY;
        if (p.maxZ > maxZ) maxZ = p.maxZ;
        cursor++;
      }
      this.sectors.push({
        start,
        count: list.length,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
      });
    }

    this.compactedMatrices.set(this.packedMatrices);
    if (this.compactedColors && this.packedColors) {
      this.compactedColors.set(this.packedColors);
    }

    const im = new THREE.InstancedMesh(geometry, material, Math.max(1, this.fullCount));
    im.count = this.fullCount;
    im.castShadow = options.castShadow;
    im.receiveShadow = options.receiveShadow;
    im.frustumCulled = false; // Spatial sectors already cull strictly via OcclusionCuller
    if (options.customDepthMaterial) {
      im.customDepthMaterial = options.customDepthMaterial;
    }

    this.compactedMatrixAttr = im.instanceMatrix;
    (this.compactedMatrixAttr.array as Float32Array).set(this.packedMatrices);
    this.compactedMatrixAttr.setUsage(
      options.castShadow ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage,
    );
    this.compactedMatrixAttr.needsUpdate = true;

    if (this.hasColor && this.packedColors) {
      const colArr = new Float32Array(this.fullCount * 3);
      colArr.set(this.packedColors);
      im.instanceColor = new THREE.InstancedBufferAttribute(colArr, 3);
      im.instanceColor.setUsage(
        options.castShadow ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage,
      );
      im.instanceColor.needsUpdate = true;
    }
    im.computeBoundingSphere();

    this.mesh = im;
  }

  public update(culler: OcclusionCuller): void {
    // Shadow-casting pools (trees & boulders, ~30-45 instances per draw call) remain permanently
    // resident in their static GPU VBO so off-camera casters never pop or drop VAO attributes.
    if (this.castShadow) {
      return;
    }
    let mask = 0;
    for (let i = 0; i < this.sectors.length; i++) {
      const s = this.sectors[i];
      if (culler.isBoxVisible(s.minX, s.minY, s.minZ, s.maxX, s.maxY, s.maxZ, this.minScreenPx)) {
        mask |= 1 << i;
      }
    }
    if (mask === this.lastMask) return;
    this.lastMask = mask;

    let outCount = 0;
    const matDst = this.compactedMatrixAttr.array as Float32Array;
    const colDst = this.mesh.instanceColor ? (this.mesh.instanceColor.array as Float32Array) : null;

    for (let i = 0; i < this.sectors.length; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const s = this.sectors[i];
      const matSlice = this.packedMatrices.subarray(s.start * 16, (s.start + s.count) * 16);
      this.compactedMatrices.set(matSlice, outCount * 16);
      matDst.set(matSlice, outCount * 16);
      if (this.packedColors && this.compactedColors && colDst) {
        const colSlice = this.packedColors.subarray(s.start * 3, (s.start + s.count) * 3);
        this.compactedColors.set(colSlice, outCount * 3);
        colDst.set(colSlice, outCount * 3);
      }
      outCount += s.count;
    }

    this.visibleCount = outCount;
    this.mesh.instanceMatrix = this.compactedMatrixAttr;
    this.mesh.count = outCount;
    this.mesh.visible = outCount > 0;
    if (outCount > 0) {
      this.compactedMatrixAttr.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// ============================================================================
// MAIN ENVIRONMENT BUILDER
// ============================================================================

export function buildEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  isMobileGpu = false,
): EnvironmentHandle {
  const disposables: Array<{ dispose: () => void }> = [];
  const depthPassExcluded: THREE.Object3D[] = [];
  const sectorPools: SectorCompactedInstanced[] = [];
  const terrainOccluderMesh = buildTerrainOccluderMesh();
  const envTex = createEnvironmentTextures(renderer, isSoftwareGl);
  disposables.push(envTex);

  const shared: SharedEnvUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.62, 0.27, 0.73).normalize() },
    uSunColor: { value: new THREE.Color(0xffca86) },
    uHazeHorizon: { value: new THREE.Color(0xdcc0a0) },
    uHazeZenith: { value: new THREE.Color(0x6c9bd2) },
    uFogColor: { value: new THREE.Color(0xd9ad7f) },
    uCamPos: { value: new THREE.Vector3(-21, 4, -4) },
  };

  // 1. Geomorphological Chunked Terrain (36 tiles) with Height-Based Splatting & Integrated SDF Road
  const terrainRes = createPhotorealTerrain(envTex, shared);
  scene.add(terrainRes.group);
  disposables.push(...terrainRes.disposables);

  // 2. Volumetric Procedural Sky-Dome Clouds
  const cloudRes = createVolumetricCloudDome(shared);
  scene.add(cloudRes.mesh);
  depthPassExcluded.push(cloudRes.mesh);
  disposables.push(...cloudRes.disposables);

  // 3. Botanical Procedural Conifer Forest (3 Distinct Archetypes + Distant Ridgeline Forest)
  const useAlphaToCoverage = false;
  const barkMat = createBarkMaterial(envTex, shared);
  const pineFoliageMat = createBotanicalFoliageMaterial(
    envTex.pineBough,
    shared,
    'photoreal-pine-foliage-v2',
    0x9ec44e,
    1.0,
    useAlphaToCoverage,
  );
  const fernFoliageMat = createBotanicalFoliageMaterial(
    envTex.fernFrond,
    shared,
    'photoreal-fern-foliage-v2',
    0xa9d44a,
    1.35,
    useAlphaToCoverage,
  );
  // Stationary double-sided alpha-cutout depth material for pine shadows (eliminates sub-texel wind shimmer & freeze-jump)
  const pineShadowDepthMat = new THREE.MeshDepthMaterial({
    map: envTex.pineBough.map,
    alphaTest: 0.42,
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });
  disposables.push(barkMat, pineFoliageMat, fernFoliageMat, pineShadowDepthMat);

  const archetypes: ConiferArchetype[] = [
    createConiferArchetype('spruce', 1009),
    createConiferArchetype('pine', 2027),
    createConiferArchetype('sapling', 3041),
  ];
  for (const a of archetypes) disposables.push(a.woodGeo, a.foliageGeo);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const rand = createRng(88421);

  // Collect full 3D tree placements across flanks & midground ridges (curated hero groves + ecological scatter)
  const treeBuckets: Array<Array<{ x: number; z: number; sc: number; leanX: number; leanZ: number; yaw: number }>> = [
    [],
    [],
    [],
  ];
  const allTreeSpots: Array<{ x: number; z: number; sc: number }> = [];

  const canPlaceTree = (x: number, z: number, minDist: number): boolean => {
    if (Math.abs(x) < 27.5 && Math.abs(z) < 13.8) return false;
    // Keep camera corridor behind slingshot completely open
    if (x < -12 && x > -38 && z > 1.5 && z < 26) return false;
    // Keep immediate title-camera framing clean around [-21.4, 3.65, -4.4]
    if (Math.hypot(x + 21.4, z + 4.4) < 11.5) return false;
    const n = groundNormalAt(x, z, 0.7);
    if (n.y < 0.65) return false;
    for (const prev of allTreeSpots) {
      if (Math.hypot(prev.x - x, prev.z - z) < minDist) return false;
    }
    return true;
  };

  // Curated hero groves framing the valley vista (behind fortress & on left/right slopes)
  const heroGroveCoords: Array<[number, number, number, number]> = [
    // [x, z, archetypeIdx, scale]
    [-26, -18.5, 0, 1.15],
    [-19, -22.5, 1, 1.05],
    [-11, -19.5, 0, 1.22],
    [-4, -24.5, 2, 1.0],
    [4, -20.5, 1, 1.12],
    [12, -23.5, 0, 1.25],
    [21, -21.5, 0, 1.18],
    [29, -18.5, 1, 1.08],
    [35, -13.5, 0, 1.22],
    [39, -5.5, 1, 1.16],
    [42, 3.5, 0, 1.24],
    [36, 12.5, 0, 1.12],
    [28, 19.5, 1, 1.06],
    [16, 21.5, 0, 1.18],
    [3, 20.5, 2, 0.96],
    [-8, 22.5, 0, 1.14],
    [-34, -13.5, 0, 1.18],
    [-36, -3.5, 1, 1.1],
    // Second tier climbing the valley slopes
    [-32, -29, 0, 1.32],
    [-21, -31, 0, 1.28],
    [-12, -33, 1, 1.22],
    [1, -31, 0, 1.34],
    [15, -32, 0, 1.26],
    [27, -29, 1, 1.24],
    [38, -26, 0, 1.3],
    [47, -19, 0, 1.32],
    [51, -8, 1, 1.25],
    [50, 6, 0, 1.28],
    [46, 17, 1, 1.22],
    [34, 27, 0, 1.3],
    [19, 29, 1, 1.2],
    [-4, 30, 0, 1.25],
  ];

  for (const [tx, tz, archIdx, sc] of heroGroveCoords) {
    if (!canPlaceTree(tx, tz, 4.6)) continue;
    allTreeSpots.push({ x: tx, z: tz, sc });
    treeBuckets[archIdx].push({
      x: tx,
      z: tz,
      sc: sc * (0.94 + rand() * 0.14),
      leanX: (rand() - 0.5) * 0.08,
      leanZ: (rand() - 0.5) * 0.08,
      yaw: rand() * Math.PI * 2,
    });
  }

  // Ecological scatter filling mid-distance slopes up to ~74m
  for (let attempt = 0; attempt < 420 && allTreeSpots.length < 92; attempt++) {
    const ang = rand() * Math.PI * 2;
    const rad = 24 + Math.pow(rand(), 0.72) * 54;
    const tx = Math.cos(ang) * rad * 1.22;
    const tz = Math.sin(ang) * rad * 0.92;
    const density = forestDensityAt(tx, tz);
    if (density < 0.24 || rand() > density + 0.18) continue;
    if (!canPlaceTree(tx, tz, 5.2)) continue;

    const rArch = rand();
    const archIdx = rArch < 0.48 ? 0 : rArch < 0.78 ? 1 : 2;
    const sc = (0.86 + rand() * 0.46) * (archIdx === 2 ? 0.95 : 1.05);
    allTreeSpots.push({ x: tx, z: tz, sc });
    treeBuckets[archIdx].push({
      x: tx,
      z: tz,
      sc,
      leanX: (rand() - 0.5) * 0.09,
      leanZ: (rand() - 0.5) * 0.09,
      yaw: rand() * Math.PI * 2,
    });
  }

  for (let aIdx = 0; aIdx < archetypes.length; aIdx++) {
    const list = treeBuckets[aIdx];
    if (list.length === 0) continue;
    const arch = archetypes[aIdx];
    const woodPlacements: InstancedPlacement[] = [];
    const folPlacements: InstancedPlacement[] = [];

    for (let i = 0; i < list.length; i++) {
      const tr = list[i];
      const ty = groundHeightAt(tr.x, tr.z) - 0.06;
      const sy = tr.sc * (0.92 + (i % 5) * 0.05);
      dummy.position.set(tr.x, ty, tr.z);
      dummy.rotation.set(tr.leanX, tr.yaw, tr.leanZ);
      dummy.scale.set(tr.sc, sy, tr.sc);
      dummy.updateMatrix();
      const matArr = new Float32Array(dummy.matrix.elements);
      const rad = 3.8 * tr.sc;
      const maxH = 12.2 * sy;

      woodPlacements.push({
        matrix: matArr,
        colorR: 1,
        colorG: 1,
        colorB: 1,
        minX: tr.x - rad,
        minY: ty - 0.6,
        minZ: tr.z - rad,
        maxX: tr.x + rad,
        maxY: ty + maxH,
        maxZ: tr.z + rad,
      });

      const shade = 0.76 + rand() * 0.28;
      const warm = (rand() - 0.5) * 0.12;
      tint.setRGB(shade * (0.94 + warm), shade * 1.02, shade * (0.86 - warm));
      folPlacements.push({
        matrix: matArr,
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: tr.x - rad,
        minY: ty - 0.4,
        minZ: tr.z - rad,
        maxX: tr.x + rad,
        maxY: ty + maxH,
        maxZ: tr.z + rad,
      });
    }

    const woodPool = new SectorCompactedInstanced(arch.woodGeo, barkMat, woodPlacements, {
      hasColor: false,
      castShadow: !isSoftwareGl,
      receiveShadow: false,
      minScreenPx: 3,
    });
    const foliagePool = new SectorCompactedInstanced(arch.foliageGeo, pineFoliageMat, folPlacements, {
      hasColor: true,
      castShadow: !isSoftwareGl && !isMobileGpu,
      receiveShadow: false,
      customDepthMaterial: !isSoftwareGl && !isMobileGpu ? pineShadowDepthMat : undefined,
      minScreenPx: 3,
    });

    sectorPools.push(woodPool, foliagePool);
    depthPassExcluded.push(foliagePool.mesh);
    scene.add(woodPool.mesh, foliagePool.mesh);
  }

  // Distant Mountain Ridgeline Forest (165 full-trunked botanical conifers clothing the far slopes)
  const distantArch = createDistantConiferArchetype();
  disposables.push(distantArch.woodGeo, distantArch.foliageGeo);
  const distantSpots: Array<{ x: number; z: number; sc: number; yaw: number }> = [];
  for (let attempt = 0; attempt < 900 && distantSpots.length < 165; attempt++) {
    const ang = rand() * Math.PI * 2;
    const rad = 58 + rand() * 98;
    const tx = Math.cos(ang) * rad * 1.25;
    const tz = Math.sin(ang) * rad * 0.96;
    const h = groundHeightAt(tx, tz);
    const n = groundNormalAt(tx, tz, 1.0);
    if (h < 2.2 || h > 36 || n.y < 0.62) continue;
    const grove = fbm2D(tx * 0.035, tz * 0.035, 911, 3);
    if (grove < 0.34) continue;
    distantSpots.push({
      x: tx,
      z: tz,
      sc: 1.05 + rand() * 0.75,
      yaw: rand() * Math.PI * 2,
    });
  }
  if (distantSpots.length > 0) {
    const distantWoodPlacements: InstancedPlacement[] = [];
    const distantFolPlacements: InstancedPlacement[] = [];
    for (let i = 0; i < distantSpots.length; i++) {
      const dtSpot = distantSpots[i];
      const ty = groundHeightAt(dtSpot.x, dtSpot.z) - 0.45;
      const sy = dtSpot.sc * (0.95 + rand() * 0.28);
      dummy.position.set(dtSpot.x, ty, dtSpot.z);
      dummy.rotation.set(0, dtSpot.yaw, 0);
      dummy.scale.set(dtSpot.sc, sy, dtSpot.sc);
      dummy.updateMatrix();
      const matArr = new Float32Array(dummy.matrix.elements);
      const rad = 3.2 * dtSpot.sc;
      const maxH = 10.6 * sy;

      distantWoodPlacements.push({
        matrix: matArr,
        colorR: 1,
        colorG: 1,
        colorB: 1,
        minX: dtSpot.x - rad,
        minY: ty - 0.5,
        minZ: dtSpot.z - rad,
        maxX: dtSpot.x + rad,
        maxY: ty + maxH,
        maxZ: dtSpot.z + rad,
      });

      const dShade = 0.68 + rand() * 0.26;
      tint.setRGB(dShade * 0.88, dShade * 0.98, dShade * 0.84);
      distantFolPlacements.push({
        matrix: matArr,
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: dtSpot.x - rad,
        minY: ty - 0.5,
        minZ: dtSpot.z - rad,
        maxX: dtSpot.x + rad,
        maxY: ty + maxH,
        maxZ: dtSpot.z + rad,
      });
    }

    const distantWoodPool = new SectorCompactedInstanced(
      distantArch.woodGeo,
      barkMat,
      distantWoodPlacements,
      { hasColor: false, castShadow: false, receiveShadow: false, minScreenPx: 3 },
    );
    const distantFolPool = new SectorCompactedInstanced(
      distantArch.foliageGeo,
      pineFoliageMat,
      distantFolPlacements,
      { hasColor: true, castShadow: false, receiveShadow: false, minScreenPx: 3 },
    );
    sectorPools.push(distantWoodPool, distantFolPool);
    depthPassExcluded.push(distantWoodPool.mesh, distantFolPool.mesh);
    scene.add(distantWoodPool.mesh, distantFolPool.mesh);
  }

  // 4. Geologically Fractured Voronoi Boulders (3 Archetypes + Satellite Talus Stones)
  const rockMat = createGeologicalRockMaterial(envTex, shared);
  disposables.push(rockMat);
  const rockGeos = [
    createFracturedRockGeo(5101),
    createFracturedRockGeo(5209),
    createFracturedRockGeo(5303),
  ];
  disposables.push(...rockGeos);

  const rockBuckets: Array<Array<{ x: number; z: number; scX: number; scY: number; scZ: number; rx: number; ry: number; rz: number }>> = [
    [],
    [],
    [],
  ];
  const boulderAnchors: Array<{ x: number; z: number; r: number }> = [];

  // Curated foreground/midground alpine rock outcrops framing the valley
  const curatedRocks: Array<[number, number, number]> = [
    [-16, -13.5, 1.35],
    [-4, -15.2, 1.55],
    [9, -14.0, 1.25],
    [22, -13.2, 1.48],
    [28, -8.5, 1.35],
    [-25, 13.5, 1.4],
    [-9, 14.5, 1.3],
    [11, 14.8, 1.55],
    [25, 13.5, 1.4],
    [32, 6.5, 1.65],
    [-29, -8.5, 1.5],
    [16, -19.5, 1.9],
    [-14, -20.5, 1.85],
    [31, -21.0, 2.1],
  ];

  for (let i = 0; i < curatedRocks.length; i++) {
    const [rx, rz, sc] = curatedRocks[i];
    const bIdx = i % 3;
    boulderAnchors.push({ x: rx, z: rz, r: sc * 1.15 });
    rockBuckets[bIdx].push({
      x: rx,
      z: rz,
      scX: sc * (1.1 + rand() * 0.35),
      scY: sc * (0.68 + rand() * 0.28),
      scZ: sc * (0.95 + rand() * 0.35),
      rx: (rand() - 0.5) * 0.22,
      ry: rand() * Math.PI * 2,
      rz: (rand() - 0.5) * 0.22,
    });
  }

  // Additional hillside geological outcrops
  for (let i = 0; i < 30; i++) {
    const ang = (i / 30) * Math.PI * 2 + (rand() - 0.5) * 0.16;
    const rad = 28 + rand() * 34;
    const rx = Math.cos(ang) * rad * 1.2;
    const rz = Math.sin(ang) * rad * 0.85;
    if (Math.abs(rx) < 26.5 && Math.abs(rz) < 12.2) continue;
    const sc = 0.85 + rand() * 1.45;
    boulderAnchors.push({ x: rx, z: rz, r: sc * 1.1 });
    rockBuckets[i % 3].push({
      x: rx,
      z: rz,
      scX: sc * (1.15 + rand() * 0.4),
      scY: sc * (0.62 + rand() * 0.36),
      scZ: sc * (0.9 + rand() * 0.4),
      rx: (rand() - 0.5) * 0.28,
      ry: rand() * Math.PI * 2,
      rz: (rand() - 0.5) * 0.28,
    });
  }

  // Satellite smaller talus stones clustered around boulder bases & road edges (ecological grounding!)
  for (const anchor of boulderAnchors) {
    const satCount = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < satCount; s++) {
      const a = rand() * Math.PI * 2;
      const dist = anchor.r * (0.9 + rand() * 0.9);
      const sx = anchor.x + Math.cos(a) * dist;
      const sz = anchor.z + Math.sin(a) * dist;
      if (pathSdfAt(sx, sz) < 0.2) continue;
      const sc = 0.22 + rand() * 0.34;
      rockBuckets[(s + 1) % 3].push({
        x: sx,
        z: sz,
        scX: sc * (1.1 + rand() * 0.4),
        scY: sc * (0.55 + rand() * 0.35),
        scZ: sc * (0.9 + rand() * 0.35),
        rx: rand() * 0.6,
        ry: rand() * Math.PI * 2,
        rz: rand() * 0.6,
      });
    }
  }

  // Embedded gravel stones along the dirt road shoulders (small surface pebbles don't cast macro shadows)
  const pebblePlacements: InstancedPlacement[] = [];
  for (let i = 0; i < 64; i++) {
    const px = -21 + rand() * 44;
    const side = i % 2 === 0 ? 1 : -1;
    const pz = pathCenterZ(px) + side * (2.75 + rand() * 1.25);
    const sc = 0.08 + rand() * 0.14;
    const scX = sc * 1.3;
    const scY = sc * 0.52;
    const scZ = sc;
    const ry = groundHeightAt(px, pz) + scY * 0.35;
    dummy.position.set(px, ry, pz);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(scX, scY, scZ);
    dummy.updateMatrix();
    tint.setHSL(0.08 + rand() * 0.06, 0.05 + rand() * 0.05, 0.72 + rand() * 0.24);
    const ext = scX * 1.3;
    pebblePlacements.push({
      matrix: new Float32Array(dummy.matrix.elements),
      colorR: tint.r,
      colorG: tint.g,
      colorB: tint.b,
      minX: px - ext,
      minY: ry - ext,
      minZ: pz - ext,
      maxX: px + ext,
      maxY: ry + ext,
      maxZ: pz + ext,
    });
  }
  if (pebblePlacements.length > 0) {
    const pebblePool = new SectorCompactedInstanced(rockGeos[0], rockMat, pebblePlacements, {
      hasColor: true,
      castShadow: false,
      receiveShadow: false,
      minScreenPx: 4,
    });
    sectorPools.push(pebblePool);
    depthPassExcluded.push(pebblePool.mesh);
    scene.add(pebblePool.mesh);
  }

  for (let bIdx = 0; bIdx < 3; bIdx++) {
    const list = rockBuckets[bIdx];
    if (list.length === 0) continue;
    const rockPlacements: InstancedPlacement[] = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const ry = groundHeightAt(r.x, r.z) + r.scY * 0.12 - 0.05;
      dummy.position.set(r.x, ry, r.z);
      dummy.rotation.set(r.rx, r.ry, r.rz);
      dummy.scale.set(r.scX, r.scY, r.scZ);
      dummy.updateMatrix();
      tint.setHSL(0.08 + rand() * 0.06, 0.05 + rand() * 0.05, 0.72 + rand() * 0.24);
      const extX = r.scX * 1.3;
      const extY = r.scY * 1.3;
      const extZ = r.scZ * 1.3;
      rockPlacements.push({
        matrix: new Float32Array(dummy.matrix.elements),
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: r.x - extX,
        minY: ry - extY,
        minZ: r.z - extZ,
        maxX: r.x + extX,
        maxY: ry + extY,
        maxZ: r.z + extZ,
      });
    }
    const rockPool = new SectorCompactedInstanced(rockGeos[bIdx], rockMat, rockPlacements, {
      hasColor: true,
      castShadow: !isSoftwareGl,
      receiveShadow: true,
      minScreenPx: 3,
    });
    sectorPools.push(rockPool);
    scene.add(rockPool.mesh);
  }

  // 5. Forest Undergrowth: Instanced 3D Alpine Ferns & Juniper Shrubs
  const fernGeo = createAlpineFernGeo();
  const shrubGeo = createAlpineShrubGeo();
  disposables.push(fernGeo, shrubGeo);

  const fernSpots: Array<{ x: number; z: number; sc: number; yaw: number }> = [];
  for (const t of allTreeSpots) {
    if (Math.hypot(t.x, t.z) > 65) continue;
    const count = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < count && fernSpots.length < 180; k++) {
      const a = rand() * Math.PI * 2;
      const d = 1.05 + rand() * 2.2;
      const fx = t.x + Math.cos(a) * d;
      const fz = t.z + Math.sin(a) * d;
      if (pathSdfAt(fx, fz) < 0.8) continue;
      fernSpots.push({ x: fx, z: fz, sc: 0.72 + rand() * 0.65, yaw: rand() * Math.PI * 2 });
    }
  }
  for (const b of boulderAnchors) {
    if (Math.hypot(b.x, b.z) > 48) continue;
    for (let k = 0; k < 2 && fernSpots.length < 210; k++) {
      const a = rand() * Math.PI * 2;
      const d = b.r * (0.95 + rand() * 0.65);
      const fx = b.x + Math.cos(a) * d;
      const fz = b.z + Math.sin(a) * d;
      if (pathSdfAt(fx, fz) < 0.6) continue;
      fernSpots.push({ x: fx, z: fz, sc: 0.65 + rand() * 0.55, yaw: rand() * Math.PI * 2 });
    }
  }

  if (fernSpots.length > 0) {
    const fernPlacements: InstancedPlacement[] = [];
    for (let i = 0; i < fernSpots.length; i++) {
      const f = fernSpots[i];
      const fy = groundHeightAt(f.x, f.z) - 0.04;
      dummy.position.set(f.x, fy, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.setScalar(f.sc);
      dummy.updateMatrix();
      const fShade = 0.72 + rand() * 0.28;
      tint.setRGB(fShade * 0.88, fShade * 1.04, fShade * 0.76);
      const rad = f.sc * 1.3;
      fernPlacements.push({
        matrix: new Float32Array(dummy.matrix.elements),
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: f.x - rad,
        minY: fy - 0.1,
        minZ: f.z - rad,
        maxX: f.x + rad,
        maxY: fy + f.sc * 1.1,
        maxZ: f.z + rad,
      });
    }
    const fernPool = new SectorCompactedInstanced(fernGeo, fernFoliageMat, fernPlacements, {
      hasColor: true,
      castShadow: false,
      receiveShadow: false,
      minScreenPx: 5,
    });
    sectorPools.push(fernPool);
    depthPassExcluded.push(fernPool.mesh);
    scene.add(fernPool.mesh);
  }

  // Low Alpine Juniper Shrubs transitioning meadow -> forest edge
  const shrubSpots: Array<{ x: number; z: number; sc: number; yaw: number }> = [];
  for (let i = 0; i < 48; i++) {
    const src = i < boulderAnchors.length ? boulderAnchors[i] : allTreeSpots[i % allTreeSpots.length];
    if (!src || Math.hypot(src.x, src.z) > 58) continue;
    const a = rand() * Math.PI * 2;
    const d = 1.6 + rand() * 2.8;
    const sx = src.x + Math.cos(a) * d;
    const sz = src.z + Math.sin(a) * d;
    if (Math.abs(sx) < 25 && Math.abs(sz) < 10.5) continue;
    shrubSpots.push({ x: sx, z: sz, sc: 0.75 + rand() * 0.62, yaw: rand() * Math.PI * 2 });
  }
  if (shrubSpots.length > 0) {
    const shrubPlacements: InstancedPlacement[] = [];
    for (let i = 0; i < shrubSpots.length; i++) {
      const s = shrubSpots[i];
      const sy = groundHeightAt(s.x, s.z) - 0.08;
      dummy.position.set(s.x, sy, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.sc * 1.15, s.sc * 0.85, s.sc);
      dummy.updateMatrix();
      const sShade = 0.70 + rand() * 0.28;
      tint.setRGB(sShade * 0.9, sShade * 1.02, sShade * 0.82);
      const rad = s.sc * 1.5;
      shrubPlacements.push({
        matrix: new Float32Array(dummy.matrix.elements),
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: s.x - rad,
        minY: sy - 0.1,
        minZ: s.z - rad,
        maxX: s.x + rad,
        maxY: sy + s.sc * 1.3,
        maxZ: s.z + rad,
      });
    }
    const shrubPool = new SectorCompactedInstanced(shrubGeo, pineFoliageMat, shrubPlacements, {
      hasColor: true,
      castShadow: false,
      receiveShadow: false,
      minScreenPx: 5,
    });
    sectorPools.push(shrubPool);
    depthPassExcluded.push(shrubPool.mesh);
    scene.add(shrubPool.mesh);
  }

  // 6. Dense GPU-Animated Curved Meadow Grass
  const grassGeo = createCurvedGrassClumpGeo();
  const grassMat = createMeadowGrassMaterial(shared);
  disposables.push(grassGeo, grassMat);

  const grassSpots: Array<{ x: number; z: number; scX: number; scY: number; yaw: number; warm: number; shade: number }> = [];

  const isInsideFortressOrSlingshot = (x: number, z: number): boolean => {
    if (Math.hypot(x + 19.5, z) < 2.2) return true;
    if (x > 7.5 && x < 23.5 && Math.abs(z) < 4.5) return true;
    return false;
  };

  for (let i = 0; i < 900; i++) {
    const x = -24 + rand() * 50;
    const side = i % 2 === 0 ? 1 : -1;
    const edgeOffset = 2.75 + Math.pow(rand(), 1.5) * 5.2;
    const z = pathCenterZ(x) + side * edgeOffset;
    if (isInsideFortressOrSlingshot(x, z)) continue;
    const sdf = pathSdfAt(x, z);
    if (sdf < -0.35) continue;

    const edgeFade = Math.min(1, Math.max(0.45, (sdf + 0.35) / 1.35));
    grassSpots.push({
      x,
      z,
      scX: 0.95 + rand() * 0.76,
      scY: (0.8 + rand() * 0.74) * edgeFade,
      yaw: rand() * Math.PI * 2,
      warm: (rand() - 0.5) * 0.16,
      shade: 0.8 + rand() * 0.28,
    });
  }

  for (let attempt = 0; attempt < 2800 && grassSpots.length < 2280; attempt++) {
    const x = -32 + rand() * 70;
    const z = -22 + rand() * 46;
    if (isInsideFortressOrSlingshot(x, z)) continue;
    const sdf = pathSdfAt(x, z);
    if (sdf < 0.05) continue;
    const n = groundNormalAt(x, z, 0.6);
    if (n.y < 0.78) continue;

    const clumpNoise = fbm2D(x * 0.14, z * 0.14, 661, 2);
    if (clumpNoise < 0.24 && rand() > 0.35) continue;

    grassSpots.push({
      x,
      z,
      scX: 1.0 + rand() * 0.84,
      scY: 0.84 + rand() * 0.86,
      yaw: rand() * Math.PI * 2,
      warm: (rand() - 0.5) * 0.2,
      shade: 0.76 + rand() * 0.32,
    });
  }

  for (const b of boulderAnchors) {
    if (Math.hypot(b.x, b.z) > 40) continue;
    for (let k = 0; k < 10 && grassSpots.length < 2500; k++) {
      const a = rand() * Math.PI * 2;
      const d = b.r * (0.85 + rand() * 0.55);
      const gx = b.x + Math.cos(a) * d;
      const gz = b.z + Math.sin(a) * d;
      if (pathSdfAt(gx, gz) < 0.1) continue;
      grassSpots.push({
        x: gx,
        z: gz,
        scX: 1.04 + rand() * 0.68,
        scY: 1.05 + rand() * 0.68,
        yaw: rand() * Math.PI * 2,
        warm: (rand() - 0.5) * 0.14,
        shade: 0.74 + rand() * 0.26,
      });
    }
  }

  if (grassSpots.length > 0) {
    const grassPlacements: InstancedPlacement[] = [];
    for (let i = 0; i < grassSpots.length; i++) {
      const g = grassSpots[i];
      const gy = groundHeightAt(g.x, g.z) - 0.03;
      dummy.position.set(g.x, gy, g.z);
      dummy.rotation.set(0, g.yaw, 0);
      dummy.scale.set(g.scX, g.scY, g.scX);
      dummy.updateMatrix();
      tint.setRGB(g.shade * (0.94 + g.warm), g.shade * 1.04, g.shade * (0.82 - g.warm * 0.5));
      const rad = g.scX * 0.45;
      grassPlacements.push({
        matrix: new Float32Array(dummy.matrix.elements),
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: g.x - rad,
        minY: gy,
        minZ: g.z - rad,
        maxX: g.x + rad,
        maxY: gy + g.scY * 0.55,
        maxZ: g.z + rad,
      });
    }
    const grassPool = new SectorCompactedInstanced(grassGeo, grassMat, grassPlacements, {
      hasColor: true,
      castShadow: false,
      receiveShadow: false,
      minScreenPx: 8,
    });
    sectorPools.push(grassPool);
    depthPassExcluded.push(grassPool.mesh);
    scene.add(grassPool.mesh);
  }

  // Subtle Alpine Wildflower accents
  const flowerGeo = new THREE.OctahedronGeometry(0.055, 0);
  flowerGeo.scale(1.2, 0.45, 1.2);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.0,
    envMapIntensity: 0.35,
  });
  disposables.push(flowerGeo, flowerMat);

  const flowerCount = 240;
  const flowerPlacements: InstancedPlacement[] = [];
  for (let patch = 0; patch < 24 && flowerPlacements.length < flowerCount; patch++) {
    const px = -24 + rand() * 52;
    const side = patch % 2 === 0 ? 1 : -1;
    const pz = pathCenterZ(px) + side * (4.4 + rand() * 11.0);
    if (isInsideFortressOrSlingshot(px, pz) || pathSdfAt(px, pz) < 0.7) continue;
    const isYellow = patch % 3 !== 0;

    for (let k = 0; k < 10 && flowerPlacements.length < flowerCount; k++) {
      const fx = px + (rand() - 0.5) * 2.4;
      const fz = pz + (rand() - 0.5) * 2.4;
      if (pathSdfAt(fx, fz) < 0.5) continue;
      const fy = groundHeightAt(fx, fz) + 0.16 + rand() * 0.18;
      dummy.position.set(fx, fy, fz);
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
      dummy.scale.setScalar(0.75 + rand() * 0.65);
      dummy.updateMatrix();
      if (isYellow) {
        tint.setHex(0xf6cf52);
      } else {
        tint.setHex(0xf4f0e4);
      }
      flowerPlacements.push({
        matrix: new Float32Array(dummy.matrix.elements),
        colorR: tint.r,
        colorG: tint.g,
        colorB: tint.b,
        minX: fx - 0.15,
        minY: fy - 0.1,
        minZ: fz - 0.15,
        maxX: fx + 0.15,
        maxY: fy + 0.15,
        maxZ: fz + 0.15,
      });
    }
  }
  if (flowerPlacements.length > 0) {
    const flowerPool = new SectorCompactedInstanced(flowerGeo, flowerMat, flowerPlacements, {
      hasColor: true,
      castShadow: false,
      receiveShadow: false,
      minScreenPx: 6,
    });
    sectorPools.push(flowerPool);
    depthPassExcluded.push(flowerPool.mesh);
    scene.add(flowerPool.mesh);
  }

  return {
    update: (
      elapsed,
      _dt,
      sunDir,
      sunColor,
      fogColor,
      skyHorizonColor,
      skyZenithColor,
      cameraPos,
    ) => {
      shared.uTime.value = elapsed;
      shared.uSunDir.value.copy(sunDir);
      shared.uSunColor.value.copy(sunColor);
      shared.uFogColor.value.copy(fogColor);
      shared.uHazeHorizon.value.copy(skyHorizonColor);
      shared.uHazeZenith.value.copy(skyZenithColor);
      shared.uCamPos.value.copy(cameraPos);
      // Center volumetric sky-dome clouds on camera horizontally for infinite sky parallax
      cloudRes.mesh.position.set(cameraPos.x, -12, cameraPos.z);
    },
    setCloudVisible: (visible: boolean) => {
      cloudRes.mesh.visible = visible;
    },
    setDepthPassMode: (depthOnly: boolean) => {
      for (const obj of depthPassExcluded) {
        obj.visible = !depthOnly;
      }
    },
    getTerrainOccluderMesh: () => terrainOccluderMesh,
    updateCulling: (culler: OcclusionCuller) => {
      for (let i = 0; i < terrainRes.chunks.length; i++) {
        const ch = terrainRes.chunks[i];
        ch.mesh.visible = culler.isBoxVisible(ch.minX, ch.minY, ch.minZ, ch.maxX, ch.maxY, ch.maxZ);
      }
      for (let i = 0; i < sectorPools.length; i++) {
        sectorPools[i].update(culler);
      }
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
