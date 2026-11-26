import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BirdType, BlockMaterialType, PigVariant } from './types';
import type { TextureLibrary } from './textures';
export { groundHeightAt } from './terrainMath';
export { buildEnvironment, type EnvironmentHandle } from './environment';

export interface SlingshotRig {
  group: THREE.Group;
  leftAnchor: THREE.Vector3;
  rightAnchor: THREE.Vector3;
  pouchGroup: THREE.Group;
  leftBand: THREE.Mesh;
  rightBand: THREE.Mesh;
  updateBands: (pouchWorldPos: THREE.Vector3, lookDir: THREE.Vector3) => void;
}

export interface BirdVisual {
  group: THREE.Group;
  fuseTip?: THREE.Mesh;
  fuseLight?: THREE.PointLight;
  wingLeft: THREE.Object3D;
  wingRight: THREE.Object3D;
}

export {
  ArchitecturalGeometryCache,
  FortressBatchManager,
  createArchitecturalMaterials as createBlockMaterials,
  createArchitecturalBlockVisual as createDetailedBlockVisual,
  createBeveledBlockGeometry,
  enhanceBlockMaterialWithDamage,
  inferBlockRole,
  type ArchitecturalMaterialSet as BlockMaterialSet,
  type DamageUniforms,
  type DetailedBlockVisual,
} from './architecture';

const sharedGeoCache = new Map<string, THREE.BufferGeometry>();
const sharedMatCache = new Map<string, THREE.Material>();

function getCachedGeometry(
  key: string,
  factory: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
  let geo = sharedGeoCache.get(key);
  if (!geo) {
    geo = factory();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.sharedCached = true;
    sharedGeoCache.set(key, geo);
  }
  return geo;
}

function getCachedMaterial<T extends THREE.Material>(key: string, factory: () => T): T {
  let mat = sharedMatCache.get(key) as T | undefined;
  if (!mat) {
    mat = factory();
    mat.userData.sharedCached = true;
    sharedMatCache.set(key, mat);
  }
  return mat;
}

const CRACK_GLSL_HELPERS = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
`;

export function createFractureSurfaceMaterial(
  textures: TextureLibrary,
  materialType: BlockMaterialType,
  isSoftwareGl: boolean,
): THREE.MeshStandardMaterial {
  let mat: THREE.MeshStandardMaterial;
  if (materialType === 'glass') {
    mat = new THREE.MeshPhysicalMaterial({
      color: 0xd8eef7,
      map: textures.glass.map,
      roughnessMap: textures.glass.roughnessMap,
      normalMap: textures.glass.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.06,
      metalness: 0.06,
      ior: 1.52,
      reflectivity: 0.96,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      specularIntensity: 1.0,
      transmission: 0,
      transparent: true,
      opacity: isSoftwareGl ? 0.72 : 0.64,
      envMapIntensity: 1.75,
      side: THREE.DoubleSide,
    });
  } else if (materialType === 'wood') {
    mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.wood.map,
      roughnessMap: textures.wood.roughnessMap,
      normalMap: textures.wood.normalMap,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.46,
    });
  } else if (materialType === 'metal') {
    mat = new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      map: textures.iron.map,
      roughnessMap: textures.iron.roughnessMap,
      normalMap: textures.iron.normalMap,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughness: 0.36,
      metalness: 0.88,
      envMapIntensity: 1.2,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stone.map,
      roughnessMap: textures.stone.roughnessMap,
      normalMap: textures.stone.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.9,
      metalness: 0.04,
      envMapIntensity: 0.44,
    });
  }

  const typeCode =
    materialType === 'wood' ? 0 : materialType === 'stone' ? 1 : materialType === 'metal' ? 3 : 2;
  mat.customProgramCacheKey = () => `fracture-inner-v3-${typeCode}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aInnerFace;
        varying float vInnerFace;
        varying vec3 vFracLocalPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vInnerFace = aInnerFace;
        vFracLocalPos = position;`,
      );

    const innerColorPatch =
      typeCode === 0
        ? /* glsl */ `
          if (vInnerFace > 0.4) {
            float fiber = 0.84 + 0.16 * sin(vFracLocalPos.x * 58.0 + sin(vFracLocalPos.y * 26.0) * 1.6);
            vec3 rawWood = vec3(0.84, 0.67, 0.44) * fiber;
            diffuseColor.rgb = mix(diffuseColor.rgb, rawWood, clamp(vInnerFace * 0.88, 0.0, 1.0));
          }`
        : typeCode === 1
          ? /* glsl */ `
            if (vInnerFace > 0.4) {
              float grain = hash31(floor(vFracLocalPos * 42.0));
              float mica = step(0.84, grain) * 0.2;
              vec3 rawGranite = vec3(0.64, 0.62, 0.59) * (0.85 + grain * 0.28) + vec3(mica);
              diffuseColor.rgb = mix(diffuseColor.rgb, rawGranite, clamp(vInnerFace * 0.86, 0.0, 1.0));
            }`
          : typeCode === 3
            ? /* glsl */ `
              if (vInnerFace > 0.4) {
                float spark = hash31(floor(vFracLocalPos * 64.0));
                vec3 shearedSteel = vec3(0.76, 0.80, 0.86) * (0.86 + spark * 0.24);
                diffuseColor.rgb = mix(diffuseColor.rgb, shearedSteel, clamp(vInnerFace * 0.9, 0.0, 1.0));
              }`
            : /* glsl */ `
              if (vInnerFace > 0.4) {
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.98, 1.0), 0.68);
                diffuseColor.a = max(diffuseColor.a, 0.9);
              }`;

    const innerRoughnessPatch =
      typeCode === 0
        ? `if (vInnerFace > 0.4) { roughnessFactor = clamp(roughnessFactor + 0.14, 0.05, 1.0); }`
        : typeCode === 1
          ? `if (vInnerFace > 0.4) { roughnessFactor = clamp(roughnessFactor + 0.08, 0.05, 1.0); }`
          : typeCode === 3
            ? `if (vInnerFace > 0.4) { roughnessFactor = clamp(roughnessFactor - 0.14, 0.14, 0.6); }`
            : `if (vInnerFace > 0.4) { roughnessFactor = clamp(roughnessFactor + 0.14, 0.02, 0.42); }`;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vInnerFace;
        varying vec3 vFracLocalPos;
        ${CRACK_GLSL_HELPERS}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${innerColorPatch}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        ${innerRoughnessPatch}`,
      );
  };

  return mat;
}

function createBirdBodyGeometry(birdType: BirdType, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const segs = 22;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI;
    const y = -Math.cos(t) * radius;
    let r = Math.sin(t) * radius;
    if (birdType === 'yellow') {
      const factor = 1.18 - 0.58 * (i / segs);
      r *= Math.max(0.05, factor);
    } else if (birdType === 'black') {
      const pear = 1.07 - 0.19 * (i / segs);
      r *= pear;
    } else {
      r *= 1.0 + 0.09 * Math.sin(t * 2) - 0.04 * Math.cos(t * 3);
    }
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

function createSculptedFeatherGeometry(length: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -width * 0.25);
  shape.quadraticCurveTo(length * 0.55, -width * 0.58, length, 0);
  shape.quadraticCurveTo(length * 0.55, width * 0.58, 0, width * 0.25);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width * 0.14,
    bevelEnabled: true,
    bevelThickness: width * 0.06,
    bevelSize: width * 0.05,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.computeVertexNormals();
  return geo;
}

function createEyeMesh(size: number, irisHex = 0x3b2210): THREE.Group {
  const eyeGroup = new THREE.Group();
  const sKey = size.toFixed(4);

  const scleraMat = getCachedMaterial(
    'eye-sclera',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xfbf9f2,
        roughness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
      }),
  );
  const limbalMat = getCachedMaterial(
    'eye-limbal',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x160e08,
        roughness: 0.12,
        clearcoat: 1.0,
      }),
  );
  const irisMat = getCachedMaterial(
    `eye-iris-${irisHex}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: irisHex,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
      }),
  );
  const pupilMat = getCachedMaterial(
    'eye-pupil',
    () => new THREE.MeshBasicMaterial({ color: 0x050507 }),
  );
  const glintMat = getCachedMaterial(
    'eye-glint',
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );

  const sclera = new THREE.Mesh(
    getCachedGeometry(`eye-sclera-${sKey}`, () => new THREE.SphereGeometry(size, 18, 14)),
    scleraMat,
  );
  sclera.scale.set(0.85, 1.08, 0.72);
  eyeGroup.add(sclera);

  const limbal = new THREE.Mesh(
    getCachedGeometry(`eye-limbal-${sKey}`, () => new THREE.SphereGeometry(size * 0.62, 14, 12)),
    limbalMat,
  );
  limbal.position.set(size * 0.39, 0, 0);
  limbal.scale.set(0.54, 0.92, 0.92);
  eyeGroup.add(limbal);

  const iris = new THREE.Mesh(
    getCachedGeometry(`eye-iris-${sKey}`, () => new THREE.SphereGeometry(size * 0.54, 14, 12)),
    irisMat,
  );
  iris.position.set(size * 0.44, 0, 0);
  iris.scale.set(0.55, 0.9, 0.9);
  eyeGroup.add(iris);

  const pupil = new THREE.Mesh(
    getCachedGeometry(`eye-pupil-${sKey}`, () => new THREE.SphereGeometry(size * 0.33, 12, 10)),
    pupilMat,
  );
  pupil.position.set(size * 0.55, 0, 0);
  pupil.scale.set(0.5, 0.85, 0.85);
  eyeGroup.add(pupil);

  const glint = new THREE.Mesh(
    getCachedGeometry(`eye-glint-${sKey}`, () => new THREE.SphereGeometry(size * 0.13, 8, 8)),
    glintMat,
  );
  glint.position.set(size * 0.65, size * 0.24, size * 0.22);
  eyeGroup.add(glint);

  return eyeGroup;
}

export function createBirdModel(
  birdType: BirdType,
  radius: number,
  isSoftwareGl: boolean,
  shareAllMaterials = false,
): BirdVisual {
  const group = new THREE.Group();
  const rKey = radius.toFixed(4);

  const mainColor =
    birdType === 'red' ? 0xc81e1e : birdType === 'yellow' ? 0xebb815 : 0x20232a;
  const secondaryFeatherColor =
    birdType === 'red' ? 0x991212 : birdType === 'yellow' ? 0xc79208 : 0x15171c;
  const bellyColor =
    birdType === 'red' ? 0xf2dec2 : birdType === 'yellow' ? 0xf8f3db : 0x5c616d;

  const getDynamicOrShared = <T extends THREE.Material>(mKey: string, factory: () => T): T => {
    const cached = getCachedMaterial(mKey, factory);
    if (shareAllMaterials) return cached;
    const cloned = cached.clone() as T;
    cloned.userData = {};
    return cloned;
  };

  const bodyMat = getDynamicOrShared(
    `bird-body-${birdType}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: mainColor,
        roughness: birdType === 'black' ? 0.52 : 0.68,
        metalness: 0.03,
        sheen: birdType === 'black' ? 0.18 : 0.52,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(mainColor).lerp(new THREE.Color(0xffe9c2), 0.38),
      }),
  );
  const featherAccentMat = getDynamicOrShared(
    `bird-accent-${birdType}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: secondaryFeatherColor,
        roughness: 0.64,
        metalness: 0.04,
        sheen: 0.45,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0xffdfa8),
      }),
  );
  const bellyMat = getDynamicOrShared(
    `bird-belly-${birdType}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: bellyColor,
        roughness: 0.78,
        sheen: 0.35,
        sheenRoughness: 0.72,
        metalness: 0.0,
      }),
  );
  const beakMat = getDynamicOrShared(
    'bird-beak',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xf49d1a,
        roughness: 0.3,
        metalness: 0.04,
        clearcoat: 0.35,
        clearcoatRoughness: 0.25,
      }),
  );
  const darkMat = getDynamicOrShared(
    'bird-dark',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x16161a,
        roughness: 0.6,
        metalness: 0.06,
      }),
  );

  // 1. Primary sculpted body
  const bodyMesh = new THREE.Mesh(
    getCachedGeometry(`bird-body-${birdType}-${rKey}`, () => createBirdBodyGeometry(birdType, radius)),
    bodyMat,
  );
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = false;
  group.add(bodyMesh);

  // 2. Sculpted feathered belly patch
  const belly = new THREE.Mesh(
    getCachedGeometry(`bird-belly-${rKey}`, () => new THREE.SphereGeometry(radius * 0.72, 18, 14)),
    bellyMat,
  );
  belly.position.set(radius * 0.34, -radius * 0.28, 0);
  belly.scale.set(0.75, 0.78, 0.88);
  group.add(belly);

  // 3. Dual-part keratin beak (merged into 1 mesh)
  const beakGeo = getCachedGeometry(`bird-beak-merged-${rKey}`, () => {
    const up = new THREE.ConeGeometry(radius * 0.26, radius * 0.56, 16);
    up.scale(0.85, 1, 1.12);
    up.rotateZ(-Math.PI * 0.48);
    up.translate(radius * 1.04, -radius * 0.02, 0);

    const lo = new THREE.ConeGeometry(radius * 0.2, radius * 0.4, 14);
    lo.scale(0.7, 1, 0.96);
    lo.rotateZ(-Math.PI * 0.58);
    lo.translate(radius * 0.94, -radius * 0.16, 0);

    const merged = mergeGeometries([up, lo], false);
    up.dispose();
    lo.dispose();
    return merged ?? new THREE.ConeGeometry(radius * 0.26, radius * 0.56, 16);
  });
  const beakMesh = new THREE.Mesh(beakGeo, beakMat);
  beakMesh.castShadow = true;
  group.add(beakMesh);

  // 4 & 5. Glossy Clearcoat Corneal Eyes
  const eyeOffsetX = birdType === 'yellow' ? radius * 0.66 : radius * 0.8;
  const eyeY = radius * 0.14;
  const eyeZ = radius * 0.3;
  const irisTint = birdType === 'red' ? 0x6b2f10 : birdType === 'yellow' ? 0x455a1f : 0x523414;

  const eyeL = createEyeMesh(radius * 0.24, irisTint);
  eyeL.position.set(eyeOffsetX, eyeY, -eyeZ);
  eyeL.rotation.y = 0.25;
  group.add(eyeL);

  const eyeR = createEyeMesh(radius * 0.24, irisTint);
  eyeR.position.set(eyeOffsetX, eyeY, eyeZ);
  eyeR.rotation.y = -0.25;
  group.add(eyeR);

  // 6. Sculpted V-brows (merged pair)
  const browMat =
    birdType === 'red'
      ? darkMat
      : getDynamicOrShared(
          'bird-brow-brown',
          () => new THREE.MeshStandardMaterial({ color: 0x3b180e, roughness: 0.7 }),
        );
  const browGeo = getCachedGeometry(`bird-brows-merged-${birdType}-${rKey}`, () => {
    const base = new THREE.BoxGeometry(radius * 0.12, radius * 0.12, radius * 0.44);
    const bL = base.clone();
    bL.rotateX(0.32);
    bL.rotateY(0.2);
    bL.translate(eyeOffsetX + radius * 0.08, eyeY + radius * 0.25, -eyeZ * 0.85);
    const bR = base.clone();
    bR.rotateX(-0.32);
    bR.rotateY(-0.2);
    bR.translate(eyeOffsetX + radius * 0.08, eyeY + radius * 0.25, eyeZ * 0.85);
    base.dispose();
    const merged = mergeGeometries([bL, bR], false);
    bL.dispose();
    bR.dispose();
    return merged ?? new THREE.BoxGeometry(radius * 0.12, radius * 0.12, radius * 0.44);
  });
  group.add(new THREE.Mesh(browGeo, browMat));

  // 7. Layered multi-feather wings (3 overlapping primaries per side; 2 secondary feathers merged)
  const wingFeatherGeo = getCachedGeometry(
    `bird-wingf-${rKey}`,
    () => createSculptedFeatherGeometry(radius * 0.56, radius * 0.24),
  );
  const buildWing = (side: -1 | 1) => {
    const wg = new THREE.Group();
    wg.position.set(-radius * 0.06, -radius * 0.04, side * radius * 0.86);
    const fm0 = new THREE.Mesh(wingFeatherGeo, bodyMat);
    fm0.rotation.y = Math.PI + side * 0.28;
    fm0.rotation.z = -0.18;
    fm0.castShadow = true;
    wg.add(fm0);

    const secGeo = getCachedGeometry(`bird-wingsec-${rKey}-${side}`, () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let f = 1; f < 3; f++) {
        const g = wingFeatherGeo.clone();
        g.rotateY(Math.PI + side * (0.28 + f * 0.14));
        g.rotateZ(-0.18 + f * 0.22);
        g.translate(-f * radius * 0.06, -f * radius * 0.05, side * f * radius * 0.03);
        parts.push(g);
      }
      const merged = mergeGeometries(parts, false);
      parts.forEach((p) => p.dispose());
      return merged ?? wingFeatherGeo;
    });
    const secMesh = new THREE.Mesh(secGeo, featherAccentMat);
    secMesh.castShadow = true;
    wg.add(secMesh);

    group.add(wg);
    return wg;
  };
  const wingLeft = buildWing(-1);
  const wingRight = buildWing(1);

  // 8. Layered sculpted tail fan (4 overlapping feathers merged into 1 draw call)
  const tailGeo = getCachedGeometry(`bird-tail-merged-${rKey}`, () => {
    const base = createSculptedFeatherGeometry(radius * 0.62, radius * 0.2);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = -1.5; i <= 1.5; i += 1) {
      const g = base.clone();
      g.rotateY(Math.PI + i * 0.2);
      g.rotateZ(-0.16 - Math.abs(i) * 0.08);
      g.translate(-radius * 0.85, radius * 0.06 + Math.abs(i) * radius * 0.05, i * radius * 0.09);
      parts.push(g);
    }
    base.dispose();
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged ?? createSculptedFeatherGeometry(radius * 0.62, radius * 0.2);
  });
  group.add(new THREE.Mesh(tailGeo, darkMat));

  // 9. Species-specific Sculpted Crest / Fuse
  let fuseTip: THREE.Mesh | undefined;
  const fuseLight: THREE.PointLight | undefined = undefined;

  if (birdType === 'red') {
    const crestGeo = getCachedGeometry(
      `bird-crest-${rKey}`,
      () => createSculptedFeatherGeometry(radius * 0.54, radius * 0.22),
    );
    for (let i = 0; i < 2; i++) {
      const plume = new THREE.Mesh(crestGeo, i === 0 ? bodyMat : featherAccentMat);
      plume.position.set(-radius * (0.04 + i * 0.14), radius * (0.94 - i * 0.08), 0);
      plume.rotation.y = Math.PI;
      plume.rotation.z = -0.36 - i * 0.32;
      plume.castShadow = true;
      group.add(plume);
    }
  } else if (birdType === 'yellow') {
    const spikeGeo = getCachedGeometry(
      `bird-spike-${rKey}`,
      () => createSculptedFeatherGeometry(radius * 0.56, radius * 0.18),
    );
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(spikeGeo, i === 1 ? bodyMat : featherAccentMat);
      spike.position.set(-radius * 0.1 * i, radius * 0.92, (i - 1) * radius * 0.1);
      spike.rotation.y = Math.PI + (i - 1) * 0.16;
      spike.rotation.z = -0.45 - i * 0.18;
      group.add(spike);
    }
  } else {
    const fuseMesh = new THREE.Mesh(
      getCachedGeometry(`bird-fuse-${rKey}`, () => {
        const fuseCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, radius * 0.92, 0),
          new THREE.Vector3(-radius * 0.12, radius * 1.25, radius * 0.08),
          new THREE.Vector3(-radius * 0.28, radius * 1.44, -radius * 0.04),
        ]);
        return new THREE.TubeGeometry(fuseCurve, 12, radius * 0.065, 8, false);
      }),
      getCachedMaterial('bird-fuse-cord', () => new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.9 })),
    );
    group.add(fuseMesh);

    const fuseTipMat = shareAllMaterials
      ? getCachedMaterial(
          'bird-fuse-tip-static',
          () =>
            new THREE.MeshStandardMaterial({
              color: 0xffaa22,
              emissive: 0xff5500,
              emissiveIntensity: 3.6,
              roughness: 0.2,
            }),
        )
      : new THREE.MeshStandardMaterial({
          color: 0xffaa22,
          emissive: 0xff5500,
          emissiveIntensity: 3.6,
          roughness: 0.2,
        });
    fuseTip = new THREE.Mesh(
      getCachedGeometry(`bird-fusetip-${rKey}`, () => new THREE.SphereGeometry(radius * 0.13, 10, 10)),
      fuseTipMat,
    );
    fuseTip.position.set(-radius * 0.28, radius * 1.44, -radius * 0.04);
    group.add(fuseTip);
  }

  void isSoftwareGl;
  return { group, fuseTip, fuseLight, wingLeft, wingRight };
}

export function createPigModel(radius: number, variant: PigVariant): THREE.Group {
  const group = new THREE.Group();
  const rKey = radius.toFixed(4);

  const skinBase = getCachedMaterial(
    'pig-skin',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x67c43e,
        roughness: 0.36,
        metalness: 0.02,
        clearcoat: 0.42,
        clearcoatRoughness: 0.24,
      }),
  );
  const skinMat = skinBase.clone();
  skinMat.userData = {};

  const snoutBase = getCachedMaterial(
    'pig-snout',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x8ae05e,
        roughness: 0.3,
        metalness: 0.02,
        clearcoat: 0.48,
        clearcoatRoughness: 0.22,
      }),
  );
  const snoutMat = snoutBase.clone();
  snoutMat.userData = {};

  const nostrilMat = getCachedMaterial(
    'pig-nostril',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x1e4a12,
        roughness: 0.85,
      }),
  );

  const body = new THREE.Mesh(
    getCachedGeometry(`pig-body-${rKey}`, () => new THREE.SphereGeometry(radius, 24, 20)),
    skinMat,
  );
  body.scale.set(1.04, 0.94, 1.04);
  body.castShadow = true;
  body.receiveShadow = false;
  group.add(body);

  const snout = new THREE.Mesh(
    getCachedGeometry(
      `pig-snout-${rKey}`,
      () => new THREE.CylinderGeometry(radius * 0.36, radius * 0.42, radius * 0.28, 18),
    ),
    snoutMat,
  );
  snout.rotation.z = Math.PI * 0.5;
  snout.position.set(-radius * 0.92, -radius * 0.06, 0);
  snout.scale.set(1.0, 1.0, 1.24);
  snout.castShadow = true;
  group.add(snout);

  const nosGeo = getCachedGeometry(
    `pig-nos-${rKey}`,
    () => new THREE.SphereGeometry(radius * 0.085, 10, 8),
  );
  const nosL = new THREE.Mesh(nosGeo, nostrilMat);
  nosL.position.set(-radius * 1.05, -radius * 0.03, -radius * 0.16);
  nosL.scale.set(0.4, 1.15, 0.85);
  group.add(nosL);

  const nosR = new THREE.Mesh(nosGeo, nostrilMat);
  nosR.position.set(-radius * 1.05, -radius * 0.03, radius * 0.16);
  nosR.scale.set(0.4, 1.15, 0.85);
  group.add(nosR);

  const eyeL = createEyeMesh(radius * 0.21, 0x2b3612);
  eyeL.position.set(-radius * 0.72, radius * 0.16, -radius * 0.44);
  eyeL.rotation.y = Math.PI - 0.32;
  group.add(eyeL);

  const eyeR = createEyeMesh(radius * 0.21, 0x2b3612);
  eyeR.position.set(-radius * 0.72, radius * 0.16, radius * 0.44);
  eyeR.rotation.y = Math.PI + 0.32;
  group.add(eyeR);

  const earGeo = getCachedGeometry(
    `pig-ear-${rKey}`,
    () => new THREE.CylinderGeometry(radius * 0.18, radius * 0.14, radius * 0.14, 14),
  );
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-radius * 0.15, radius * 0.78, -radius * 0.62);
  earL.rotation.set(-0.45, 0.2, 0.35);
  group.add(earL);

  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(-radius * 0.15, radius * 0.78, radius * 0.62);
  earR.rotation.set(0.45, -0.2, 0.35);
  group.add(earR);

  const tailMesh = new THREE.Mesh(
    getCachedGeometry(`pig-tail-${rKey}`, () => {
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(radius * 0.94, -radius * 0.1, 0),
        new THREE.Vector3(radius * 1.12, radius * 0.05, radius * 0.1),
        new THREE.Vector3(radius * 1.05, radius * 0.18, -radius * 0.06),
      ]);
      return new THREE.TubeGeometry(tailCurve, 10, radius * 0.05, 8, false);
    }),
    snoutMat,
  );
  group.add(tailMesh);

  if (variant === 'helmet') {
    const steelMat = getCachedMaterial(
      'pig-helmet-steel',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0x6f7b87,
          roughness: 0.32,
          metalness: 0.86,
        }),
    );
    const dome = new THREE.Mesh(
      getCachedGeometry(
        `pig-helmet-dome-${rKey}`,
        () => new THREE.SphereGeometry(radius * 1.04, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      ),
      steelMat,
    );
    dome.position.y = radius * 0.12;
    dome.castShadow = true;
    group.add(dome);

    const rim = new THREE.Mesh(
      getCachedGeometry(
        `pig-helmet-rim-${rKey}`,
        () => new THREE.TorusGeometry(radius * 1.02, radius * 0.06, 10, 24),
      ),
      steelMat,
    );
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = radius * 0.15;
    group.add(rim);
  } else if (variant === 'king') {
    const goldMat = getCachedMaterial(
      'pig-crown-gold',
      () =>
        new THREE.MeshStandardMaterial({
          color: 0xf5bd2e,
          roughness: 0.2,
          metalness: 0.94,
        }),
    );
    const crownBand = new THREE.Mesh(
      getCachedGeometry(
        `pig-crown-band-${rKey}`,
        () => new THREE.CylinderGeometry(radius * 0.58, radius * 0.5, radius * 0.34, 18),
      ),
      goldMat,
    );
    crownBand.position.y = radius * 0.94;
    crownBand.castShadow = true;
    group.add(crownBand);

    const prongGeo = getCachedGeometry(
      `pig-crown-prong-${rKey}`,
      () => new THREE.ConeGeometry(radius * 0.12, radius * 0.28, 8),
    );
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const prong = new THREE.Mesh(prongGeo, goldMat);
      prong.position.set(
        Math.cos(ang) * radius * 0.45,
        radius * 1.2,
        Math.sin(ang) * radius * 0.45,
      );
      group.add(prong);
    }

    const gem = new THREE.Mesh(
      getCachedGeometry(`pig-crown-gem-${rKey}`, () => new THREE.OctahedronGeometry(radius * 0.12, 0)),
      getCachedMaterial(
        'pig-crown-gem-mat',
        () =>
          new THREE.MeshPhysicalMaterial({
            color: 0xe6294b,
            roughness: 0.06,
            clearcoat: 1.0,
          }),
      ),
    );
    gem.position.set(-radius * 0.52, radius * 0.95, 0);
    group.add(gem);
  }

  return group;
}

export function createSlingshotModel(
  origin: { x: number; y: number; z: number },
  textures: TextureLibrary,
): SlingshotRig {
  const group = new THREE.Group();
  group.position.set(origin.x, 0, origin.z);

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.slingshotWood.map,
    roughnessMap: textures.slingshotWood.roughnessMap,
    normalMap: textures.slingshotWood.normalMap,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughness: 0.82,
    metalness: 0.02,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stone.map,
    roughnessMap: textures.stone.roughnessMap,
    normalMap: textures.stone.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.88,
  });

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.leather.map,
    roughnessMap: textures.leather.roughnessMap,
    normalMap: textures.leather.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.66,
  });

  const forgedIronMat = new THREE.MeshStandardMaterial({
    color: 0x272b32,
    roughness: 0.36,
    metalness: 0.88,
    envMapIntensity: 0.95,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd9a84e,
    roughness: 0.24,
    metalness: 0.92,
    envMapIntensity: 1.05,
  });

  // 1. Two-tier carved stone & wrought-iron anchor plinth (grounded at y = 0)
  const plinthBase = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.48, 0.24, 18), stoneMat);
  plinthBase.position.y = 0.12;
  plinthBase.receiveShadow = true;
  plinthBase.castShadow = true;
  group.add(plinthBase);

  const plinthCap = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.12, 0.22, 16), stoneMat);
  plinthCap.position.y = 0.33;
  plinthCap.receiveShadow = true;
  plinthCap.castShadow = true;
  group.add(plinthCap);

  // Forged iron socket flange + 4 anchor bolts
  const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.2, 16), forgedIronMat);
  baseCollar.position.y = 0.5;
  baseCollar.castShadow = true;
  group.add(baseCollar);

  const boltGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.12, 6);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const bolt = new THREE.Mesh(boltGeo, brassMat);
    bolt.position.set(Math.cos(a) * 0.42, 0.54, Math.sin(a) * 0.42);
    group.add(bolt);
  }

  // 2. Main carved walnut trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.75, 18), woodMat);
  trunk.position.y = 1.32;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Stitched leather grip wrap + brass binding rings
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.305, 0.78, 18), leatherMat);
  grip.position.y = 1.15;
  grip.castShadow = true;
  group.add(grip);

  const ringGeo = new THREE.TorusGeometry(0.295, 0.028, 8, 22);
  for (const ry of [0.76, 1.54]) {
    const ring = new THREE.Mesh(ringGeo, brassMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = ry;
    group.add(ring);
  }

  // Forged iron Y-junction reinforcement yoke & rivets
  const yokeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.27, 0.32, 16), forgedIronMat);
  yokeBand.position.y = 1.98;
  yokeBand.castShadow = true;
  group.add(yokeBand);

  const rivetGeo = new THREE.SphereGeometry(0.036, 8, 8);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const rivet = new THREE.Mesh(rivetGeo, brassMat);
    rivet.position.set(Math.cos(ang) * 0.29, 1.98, Math.sin(ang) * 0.29);
    group.add(rivet);
  }

  // 3 & 4. Left & Right curved carved Y-fork branches (TubeGeometry)
  const leftForkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.95, 0),
    new THREE.Vector3(0.05, 2.45, -0.58),
    new THREE.Vector3(0.0, 3.15, -0.92),
  ]);
  const leftFork = new THREE.Mesh(new THREE.TubeGeometry(leftForkCurve, 16, 0.17, 14, false), woodMat);
  leftFork.castShadow = true;
  group.add(leftFork);

  const rightForkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.95, 0),
    new THREE.Vector3(0.05, 2.45, 0.58),
    new THREE.Vector3(0.0, 3.15, 0.92),
  ]);
  const rightFork = new THREE.Mesh(
    new THREE.TubeGeometry(rightForkCurve, 16, 0.17, 14, false),
    woodMat,
  );
  rightFork.castShadow = true;
  group.add(rightFork);

  // 5 & 6. Forged iron & brass fork ferrules + leather anchor collars
  for (const zSide of [-0.92, 0.92]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 12), woodMat);
    cap.position.set(0, 3.16, zSide);
    group.add(cap);

    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.24, 16), brassMat);
    ferrule.position.set(0, 3.04, zSide);
    ferrule.castShadow = true;
    group.add(ferrule);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.032, 8, 18), forgedIronMat);
    collar.rotation.x = Math.PI * 0.5;
    collar.position.set(0, 2.93, zSide);
    group.add(collar);
  }

  // 7. Worn Stitched Leather Pouch (beveled ExtrudeGeometry)
  const pouchGroup = new THREE.Group();
  const pouchShape = new THREE.Shape();
  pouchShape.moveTo(-0.28, -0.22);
  pouchShape.quadraticCurveTo(0, -0.34, 0.28, -0.22);
  pouchShape.lineTo(0.32, 0.22);
  pouchShape.quadraticCurveTo(0, 0.34, -0.32, 0.22);
  pouchShape.closePath();
  const pouchGeo = new THREE.ExtrudeGeometry(pouchShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  pouchGeo.center();
  const pouchMesh = new THREE.Mesh(pouchGeo, leatherMat);
  pouchMesh.rotation.y = Math.PI * 0.5;
  pouchMesh.castShadow = false;
  pouchGroup.add(pouchMesh);
  group.add(pouchGroup);

  // 8 & 9. Tensioned tanned-leather elastic bands
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.leather.map,
    roughnessMap: textures.leather.roughnessMap,
    roughness: 0.48,
    metalness: 0.04,
  });
  const bandGeo = new THREE.CylinderGeometry(0.068, 0.068, 1, 10);
  const leftBand = new THREE.Mesh(bandGeo, bandMat);
  leftBand.castShadow = false;
  const rightBand = new THREE.Mesh(bandGeo, bandMat);
  rightBand.castShadow = false;
  group.add(leftBand, rightBand);

  const leftAnchor = new THREE.Vector3(origin.x, 3.05, origin.z - 0.92);
  const rightAnchor = new THREE.Vector3(origin.x, 3.05, origin.z + 0.92);

  const upAxis = new THREE.Vector3(0, 1, 0);
  const tmpLocalPouch = new THREE.Vector3();
  const tmpLocalAnchor = new THREE.Vector3();
  const tmpDiff = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpLookTarget = new THREE.Vector3();

  const updateBands = (pouchWorldPos: THREE.Vector3, lookDir: THREE.Vector3) => {
    tmpLocalPouch.copy(pouchWorldPos).sub(group.position);
    pouchGroup.position.copy(tmpLocalPouch);
    tmpLookTarget.copy(pouchWorldPos).add(lookDir);
    pouchGroup.lookAt(tmpLookTarget);

    const updateOne = (band: THREE.Mesh, anchorWorld: THREE.Vector3) => {
      tmpLocalAnchor.copy(anchorWorld).sub(group.position);
      tmpDiff.copy(tmpLocalPouch).sub(tmpLocalAnchor);
      const len = Math.max(0.05, tmpDiff.length());
      band.position.copy(tmpLocalAnchor).addScaledVector(tmpDiff, 0.5);
      tmpDiff.normalize();
      tmpQuat.setFromUnitVectors(upAxis, tmpDiff);
      band.quaternion.copy(tmpQuat);
      const thickness = Math.max(0.45, 1.15 - len * 0.11);
      band.scale.set(thickness, len, thickness);
    };

    updateOne(leftBand, leftAnchor);
    updateOne(rightBand, rightAnchor);
  };

  updateBands(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(1, 0, 0));

  return {
    group,
    leftAnchor,
    rightAnchor,
    pouchGroup,
    leftBand,
    rightBand,
    updateBands,
  };
}


