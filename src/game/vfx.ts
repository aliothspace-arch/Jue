import * as THREE from 'three';
import type { BirdType, BlockMaterialType, Quat, Vec3 } from './types';
import type { TextureLibrary } from './textures';
import { groundHeightAt } from './models';
import { PersistentDebrisManager, type ActiveBlockObstacle } from './debris';
import {
  computeAcousticTransitDelay,
  computeKineticPulseWave,
  computeMachConeParams,
  computeMushroomPlumeProfile,
  computeShockwaveRadius,
  computeStochasticFireIntensity,
  computeToroidalVortexVelocity,
} from './explosionMath';

type BillboardMode = 'fire' | 'smoke' | 'glint' | 'spark';

interface BillboardItem {
  active: boolean;
  life: number;
  maxLife: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  roll: number;
  rollVel: number;
  startScale: number;
  endScale: number;
  gravity: number;
  drag: number;
  turbulence: number;
  mode: BillboardMode;
  seed: number;
  baseR: number;
  baseG: number;
  baseB: number;
  maxAlpha: number;
  vortexId: number; // -1 if none, else index into explosions
}

interface ActiveExplosion {
  active: boolean;
  x: number;
  y: number;
  z: number;
  big: boolean;
  age: number;
  maxAge: number;
  maxShockRadius: number;
  shockDuration: number;
  lastDustWaveRadius: number;
  nextWispTime: number;
  ringY: number;
  vortexStrength: number;
  acousticPending: boolean;
  acousticDelay: number;
  stemSpawned: boolean;
  capSpawned: boolean;
}

interface PyroVolumeSlot {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  riseSpeed: number;
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vz: number;
  seed: number;
  aspectY: number;
}

interface ScorchCrater {
  mesh: THREE.Mesh;
  age: number;
}

interface BallisticRibbonSlot {
  active: boolean;
  life: number;
  maxLife: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  bounced: boolean;
  history: Float32Array; // 14 * 3 coords
  headIdx: number;
  sampleTimer: number;
  mesh: THREE.Mesh;
  posAttr: THREE.BufferAttribute;
  uvAttr: THREE.BufferAttribute;
  heat: number;
}

function createFeatherGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.14, 0);
  shape.quadraticCurveTo(-0.02, 0.065, 0.14, 0.012);
  shape.quadraticCurveTo(0.02, -0.055, -0.14, 0);
  return new THREE.ShapeGeometry(shape, 4);
}

const NOISE_3D_GLSL = /* glsl */ `
float vfxHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vfxHash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float vfxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(vfxHash(i), vfxHash(i + vec2(1.0, 0.0)), u.x),
    mix(vfxHash(i + vec2(0.0, 1.0)), vfxHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float vfxNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = vfxHash3(i + vec3(0.0, 0.0, 0.0));
  float n100 = vfxHash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = vfxHash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = vfxHash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = vfxHash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = vfxHash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = vfxHash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = vfxHash3(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

float vfxFbm(vec2 p) {
  float v = 0.0;
  float a = 0.52;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * vfxNoise(p);
    p = rot * p * 2.05 + vec2(1.7, 9.2);
    a *= 0.48;
  }
  return clamp((v - 0.24) / 0.48, 0.0, 1.0);
}

float vfxFbm3(vec3 p) {
  float v = 0.0;
  float a = 0.54;
  for (int i = 0; i < 3; i++) {
    v += a * vfxNoise3(p);
    p = p.yzx * 2.03 + vec3(3.1, 1.7, 5.3);
    a *= 0.46;
  }
  return clamp((v - 0.26) / 0.44, 0.0, 1.0);
}

float vfxBillow3(vec3 p) {
  float n1 = vfxNoise3(p);
  float n2 = vfxNoise3(p * 2.13 + vec3(4.1, 2.3, 1.7));
  float n3 = vfxNoise3(p * 4.41 - vec3(1.9, 5.2, 3.4));
  float b = (1.0 - abs(n1 * 2.0 - 1.0)) * 0.56 + (1.0 - abs(n2 * 2.0 - 1.0)) * 0.29 + (1.0 - abs(n3 * 2.0 - 1.0)) * 0.15;
  return clamp((b - 0.28) / 0.58, 0.0, 1.0);
}

float ignJitter(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}

float linearizeDepth(float zBuf, float nearP, float farP) {
  float zNdc = zBuf * 2.0 - 1.0;
  return (2.0 * nearP * farP) / max(0.0001, (farP + nearP - zNdc * (farP - nearP)));
}
`;

const DEPTH_SOFT_SAMPLER_GLSL = /* glsl */ `
uniform sampler2D uDepthTex;
uniform float uHasDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec2 uResolution;

float computeDepthSoftness(float fragViewDepth, float softnessDist) {
  if (uHasDepth < 0.5) return 1.0;
  vec2 screenUv = gl_FragCoord.xy / max(vec2(1.0), uResolution);
  float rawSceneZ = texture2D(uDepthTex, screenUv).r;
  float sceneLinear = linearizeDepth(rawSceneZ, uCameraNear, uCameraFar);
  float diff = sceneLinear - fragViewDepth;
  return smoothstep(-0.08, max(0.05, softnessDist), diff);
}
`;

/**
 * 3D Volumetric Raymarched Pyroclastic Fireball Pool:
 * Renders boiling, asymmetric 3D cauliflower clouds via displaced geodesic shells
 * + 3D object-space raymarching with Beer-Lambert absorption, Henyey-Greenstein sun
 * scattering, and incandescent blackbody fissures breaking through cooling soot crusts.
 */
class PyroclasticVolumePool {
  private slots: PyroVolumeSlot[] = [];
  private activeCount = 0;
  private sharedGeo: THREE.BufferGeometry;
  private baseMat: THREE.ShaderMaterial;
  private depthUniforms: {
    uDepthTex: { value: THREE.Texture | null };
    uHasDepth: { value: number };
    uCameraNear: { value: number };
    uCameraFar: { value: number };
    uResolution: { value: THREE.Vector2 };
  };
  private sunDir: THREE.Vector3;
  private _camObj = new THREE.Vector3();
  private _invMat = new THREE.Matrix4();

  constructor(
    parent: THREE.Group,
    isSoftwareGl: boolean,
    depthUniforms: PyroclasticVolumePool['depthUniforms'],
    sunDir: THREE.Vector3,
    capacity = 14,
  ) {
    this.depthUniforms = depthUniforms;
    this.sunDir = sunDir;
    this.sharedGeo = new THREE.IcosahedronGeometry(1, isSoftwareGl ? 2 : 3);
    const steps = isSoftwareGl ? 7 : 12;

    this.baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uSeed: { value: 0 },
        uCamLocalPos: { value: new THREE.Vector3(0, 0, 5) },
        uSunDir: { value: this.sunDir },
        uScale: { value: 1 },
        uDepthTex: depthUniforms.uDepthTex,
        uHasDepth: depthUniforms.uHasDepth,
        uCameraNear: depthUniforms.uCameraNear,
        uCameraFar: depthUniforms.uCameraFar,
        uResolution: depthUniforms.uResolution,
      },
        vertexShader: /* glsl */ `
          uniform float uAge;
          uniform float uSeed;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying float vViewDepth;
          ${NOISE_3D_GLSL}
          void main() {
            // Sculpted asymmetric cauliflower vertex lobes using normalized billow turbulence
            float b1 = vfxBillow3(position * 1.45 + vec3(uSeed, -uAge * 1.8, uSeed * 0.7));
            float b2 = vfxFbm3(position * 3.1 - vec3(uSeed * 0.4, uAge * 2.4, uSeed));
            float dispAmp = mix(0.42, 0.72, smoothstep(0.0, 0.4, uAge));
            vec3 displaced = position * (0.72 + b1 * dispAmp + (b2 - 0.5) * 0.26);
            vLocalPos = displaced;
            vec4 wp = modelMatrix * vec4(displaced, 1.0);
            vWorldPos = wp.xyz;
            vec4 mv = viewMatrix * wp;
            vViewDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAge;
          uniform float uSeed;
          uniform vec3 uCamLocalPos;
          uniform vec3 uSunDir;
          uniform float uScale;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying float vViewDepth;
          ${NOISE_3D_GLSL}
          ${DEPTH_SOFT_SAMPLER_GLSL}

          float hgPhase(float cosTheta, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (4.0 * 3.14159 * pow(max(0.0001, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));
          }

          void main() {
            vec3 rayDir = normalize(vLocalPos - uCamLocalPos);
            float jitter = ignJitter(gl_FragCoord.xy);
            const int STEPS = ${steps};
            float stepLen = 1.65 / float(STEPS);

            vec3 accumLight = vec3(0.0);
            float transmittance = 1.0;

            vec3 sDir = normalize(uSunDir);
            float cosSun = dot(rayDir, sDir);
            float forwardScatter = hgPhase(cosSun, 0.45) * 1.4;
            float ageCool = smoothstep(0.02, 0.86, uAge);
            float coreHeat = pow(max(0.0001, 1.0 - uAge), 1.85);

            for (int i = 0; i < STEPS; i++) {
              float t = (float(i) + jitter) * stepLen;
              vec3 p = vLocalPos + rayDir * t;
              float r2 = dot(p, p);
              if (r2 > 1.75) break;

              float r = sqrt(max(0.0001, r2));
              vec3 advect = vec3(0.0, -uAge * 2.2, 0.0) + p * (0.28 * uAge);
              float billow = vfxBillow3(p * 1.65 + advect + uSeed);
              float fine = vfxFbm3(p * 3.8 - advect * 1.4 + billow * 0.7);

              // Turbulent radial carving breaks ANY circular sphere boundary into cloudy billows
              float carvedR = r - (billow - 0.45) * 0.56 - (fine - 0.5) * 0.24;
              float radialEnvelope = smoothstep(1.06, 0.18, carvedR);
              float carveCut = mix(0.28, 0.64, ageCool);
              float dens = smoothstep(carveCut, carveCut + 0.18, radialEnvelope * (0.45 + billow * 0.65));

              if (dens > 0.01) {
                // Dark sculpted volcanic obsidian soot lobes outside, searing white-gold-orange plasma in recessed cauliflower crevices!
                float creviceMask = pow(max(0.0001, 1.0 - billow), 1.42);
                float coreMask = smoothstep(0.86, 0.12, r);
                float temp = clamp(
                  creviceMask * 0.96 + coreMask * 0.66 - ageCool * 0.70 + (0.5 - fine) * 0.34,
                  0.0,
                  1.0
                );
                // First ~18% of life burns violently with white-gold plasma before dark soot crust forms on outer billow peaks
                temp = clamp(mix(temp, max(temp, 0.84), smoothstep(0.18, 0.0, uAge)), 0.0, 1.0);

                // Physical 5-stop Kelvin blackbody fire + volcanic obsidian soot & sunlit alpine ash
                vec3 cSoot = vec3(0.024, 0.024, 0.030);
                vec3 cAsh = vec3(0.19, 0.18, 0.20);
                vec3 cCrimson = vec3(1.65, 0.14, 0.018);
                vec3 cOrange = vec3(3.85, 1.12, 0.11);
                vec3 cHot = vec3(5.60, 4.35, 2.15);

                float sunOccl = clamp(0.24 + dot(normalize(p + 0.001), sDir) * 0.62 + fine * 0.28, 0.08, 1.0);
                vec3 sootLit = mix(cSoot, cAsh, sunOccl * 0.72) + vec3(0.92, 0.82, 0.70) * forwardScatter * 0.26 * (1.0 - dens * 0.38);
                float underGlow = clamp(0.76 - p.y * 0.75, 0.0, 1.0) * coreHeat;
                sootLit += vec3(2.45, 0.68, 0.09) * underGlow * (1.0 - billow * 0.42) * 0.72;

                vec3 emit = mix(sootLit, cCrimson, smoothstep(0.26, 0.44, temp));
                emit = mix(emit, cOrange, smoothstep(0.44, 0.66, temp));
                emit = mix(emit, cHot, smoothstep(0.66, 0.88, temp));

                // Outer billow tips are slightly more translucent so inner 5500K core radiates through crevices
                float shellWeight = mix(0.55, 1.0, smoothstep(0.98, 0.42, r));
                float stepAlpha = 1.0 - exp(-dens * shellWeight * stepLen * 5.6);
                accumLight += transmittance * emit * stepAlpha;
                transmittance *= (1.0 - stepAlpha);
                if (transmittance < 0.014) break;
              }
            }

            float alpha = clamp(1.0 - transmittance, 0.0, 0.98);
            float lifeFade = pow(max(0.0001, 1.0 - smoothstep(0.48, 1.0, uAge)), 1.3);
            float groundSoft = smoothstep(-0.04, 0.42, vWorldPos.y);
            float depthSoft = computeDepthSoftness(vViewDepth, max(0.45, uScale * 0.45));
            alpha *= lifeFade * groundSoft * depthSoft;
            if (alpha < 0.004) discard;
            gl_FragColor = vec4(accumLight * lifeFade, alpha);
          }
        `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.baseMat.customProgramCacheKey = () => `pyro-vol-v1-${steps}`;

    for (let i = 0; i < capacity; i++) {
      const mat = this.baseMat.clone();
      mat.customProgramCacheKey = this.baseMat.customProgramCacheKey;
      mat.uniforms.uSunDir = { value: this.sunDir };
      mat.uniforms.uDepthTex = depthUniforms.uDepthTex;
      mat.uniforms.uHasDepth = depthUniforms.uHasDepth;
      mat.uniforms.uCameraNear = depthUniforms.uCameraNear;
      mat.uniforms.uCameraFar = depthUniforms.uCameraFar;
      mat.uniforms.uResolution = depthUniforms.uResolution;
      mat.uniforms.uSeed.value = i * 17.3;

      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      parent.add(mesh);

      this.slots.push({
        mesh,
        active: false,
        age: 0,
        maxAge: 1,
        startScale: 0.7,
        endScale: 3.5,
        riseSpeed: 2.2,
        ox: 0,
        oy: 0,
        oz: 0,
        vx: 0,
        vz: 0,
        seed: i * 17.3,
        aspectY: 1.0,
      });
    }
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    big: boolean,
    scaleMult = 1,
    delayAge = 0,
    vx = 0,
    vz = 0,
    opts?: { maxAge?: number; riseSpeed?: number; aspectY?: number; startScaleMult?: number },
  ): void {
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((a, b) => (a.age / a.maxAge > b.age / b.maxAge ? a : b));
    } else {
      this.activeCount++;
    }
    slot.active = true;
    slot.age = delayAge;
    slot.maxAge = opts?.maxAge ?? (big ? 1.18 : 0.52);
    slot.startScale = (big ? 0.56 : 0.36) * scaleMult * (opts?.startScaleMult ?? 1);
    slot.endScale = (big ? 2.95 : 1.55) * scaleMult;
    slot.riseSpeed = opts?.riseSpeed ?? (big ? 3.5 : 1.7) * (0.85 + scaleMult * 0.25);
    slot.ox = x;
    slot.oy = Math.max(0.42, y);
    slot.oz = z;
    slot.vx = vx;
    slot.vz = vz;
    slot.seed = Math.random() * 60;
    slot.aspectY = opts?.aspectY ?? 1.0;

    slot.mesh.visible = true;
    slot.mesh.position.set(slot.ox, slot.oy, slot.oz);
    slot.mesh.scale.setScalar(slot.startScale);
    slot.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  }

  public update(dt: number, camera: THREE.Camera): void {
    if (this.activeCount === 0) return;
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        s.mesh.visible = false;
        continue;
      }

      const ageNorm = Math.max(0, s.age / s.maxAge);
      const expand = 1 - Math.pow(1 - ageNorm, 3.0);
      const sc = s.startScale + (s.endScale - s.startScale) * expand;
      const rise = s.riseSpeed * ageNorm * (1 - 0.26 * ageNorm);
      const lat = ageNorm * (1 - 0.36 * ageNorm);

      s.mesh.position.set(s.ox + s.vx * lat, s.oy + rise, s.oz + s.vz * lat);
      s.mesh.scale.set(
        sc * (1 + ageNorm * 0.16),
        sc * s.aspectY * (1 - ageNorm * 0.05),
        sc * (1 + ageNorm * 0.16),
      );
      s.mesh.rotation.y += dt * 0.45;
      s.mesh.updateMatrixWorld();

      this._invMat.copy(s.mesh.matrixWorld).invert();
      this._camObj.copy(camera.position).applyMatrix4(this._invMat);

      const uniforms = (s.mesh.material as THREE.ShaderMaterial).uniforms;
      uniforms.uAge.value = ageNorm;
      uniforms.uSeed.value = s.seed;
      uniforms.uCamLocalPos.value.copy(this._camObj);
      uniforms.uScale.value = sc;
    }
  }

  public reset(): void {
    this.activeCount = 0;
    for (const s of this.slots) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.reset();
    this.sharedGeo.dispose();
    this.baseMat.dispose();
    for (const s of this.slots) {
      (s.mesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * Continuous Triangle-Strip Ballistic Smoke Ribbon Pool:
 * Fast hot shrapnel chunks ejected from an explosion leave curling, fading smoke contrails
 * along their real parabolic trajectories.
 */
class SmokeRibbonPool {
  private slots: BallisticRibbonSlot[] = [];
  private activeCount = 0;
  private readonly nodes = 14;
  private sharedMat: THREE.ShaderMaterial;
  private _camPos = new THREE.Vector3();
  private _tangent = new THREE.Vector3();
  private _toCam = new THREE.Vector3();
  private _side = new THREE.Vector3();

  constructor(
    parent: THREE.Group,
    depthUniforms: PyroclasticVolumePool['depthUniforms'],
    capacity = 16,
  ) {
    this.sharedMat = new THREE.ShaderMaterial({
      uniforms: {
        uDepthTex: depthUniforms.uDepthTex,
        uHasDepth: depthUniforms.uHasDepth,
        uCameraNear: depthUniforms.uCameraNear,
        uCameraFar: depthUniforms.uCameraFar,
        uResolution: depthUniforms.uResolution,
      },
      vertexShader: /* glsl */ `
        attribute float aHeat;
        varying vec2 vUv;
        varying float vHeat;
        varying float vViewDepth;
        void main() {
          vUv = uv;
          vHeat = aHeat;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vHeat;
        varying float vViewDepth;
        ${NOISE_3D_GLSL}
        ${DEPTH_SOFT_SAMPLER_GLSL}
        void main() {
          float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
          float wisp = vfxFbm(vec2(vUv.x * 6.5, vUv.y * 2.4));
          float alpha = pow(max(0.0001, edge), 1.45) * (0.55 + wisp * 0.45);
          // Taper cleanly at head & tail
          alpha *= smoothstep(0.0, 0.08, vUv.x) * pow(max(0.0001, 1.0 - vUv.x), 1.25);
          alpha *= vHeat * computeDepthSoftness(vViewDepth, 0.4);
          if (alpha < 0.005) discard;

          float tipEmber = smoothstep(0.24, 0.0, vUv.x) * vHeat;
          vec3 smokeCol = mix(vec3(0.16, 0.16, 0.18), vec3(0.40, 0.39, 0.38), wisp);
          vec3 col = mix(smokeCol, vec3(2.8, 0.95, 0.18), tipEmber * 0.90);
          gl_FragColor = vec4(col, clamp(alpha * 0.65, 0.0, 0.80));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const indices: number[] = [];
    for (let i = 0; i < this.nodes - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    for (let s = 0; s < capacity; s++) {
      const vertCount = this.nodes * 2;
      const positions = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const heats = new Float32Array(vertCount);

      for (let i = 0; i < this.nodes; i++) {
        const u = i / (this.nodes - 1);
        uvs[i * 4] = u;
        uvs[i * 4 + 1] = 0;
        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 1;
      }

      const geo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      const uvAttr = new THREE.BufferAttribute(uvs, 2);
      const heatAttr = new THREE.BufferAttribute(heats, 1);
      heatAttr.setUsage(THREE.DynamicDrawUsage);

      geo.setAttribute('position', posAttr);
      geo.setAttribute('uv', uvAttr);
      geo.setAttribute('aHeat', heatAttr);
      geo.setIndex(indices);

      const mesh = new THREE.Mesh(geo, this.sharedMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      parent.add(mesh);

      this.slots.push({
        active: false,
        life: 0,
        maxLife: 1,
        px: 0,
        py: 0,
        pz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        bounced: false,
        history: new Float32Array(this.nodes * 3),
        headIdx: 0,
        sampleTimer: 0,
        mesh,
        posAttr,
        uvAttr,
        heat: 1,
      });
    }
  }

  public spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((a, b) => (a.life < b.life ? a : b));
    } else {
      this.activeCount++;
    }
    slot.active = true;
    slot.life = life;
    slot.maxLife = life;
    slot.px = x;
    slot.py = y;
    slot.pz = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.bounced = false;
    slot.headIdx = 0;
    slot.sampleTimer = 0;
    slot.heat = 1;
    for (let i = 0; i < this.nodes; i++) {
      slot.history[i * 3] = x;
      slot.history[i * 3 + 1] = y;
      slot.history[i * 3 + 2] = z;
    }
    slot.mesh.visible = true;
  }

  public update(dt: number, camera: THREE.Camera): void {
    if (this.activeCount === 0) return;
    this._camPos.copy(camera.position);

    for (const s of this.slots) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        s.mesh.visible = false;
        continue;
      }

      // Ballistic integration for hot glowing shrapnel head
      s.vy += -19.5 * dt;
      const damp = Math.pow(0.982, dt * 60);
      s.vx *= damp;
      s.vy *= damp;
      s.vz *= damp;

      s.px += s.vx * dt;
      s.py += s.vy * dt;
      s.pz += s.vz * dt;

      const floorY = groundHeightAt(s.px, s.pz) + 0.08;
      if (s.py < floorY) {
        s.py = floorY;
        s.vy = Math.abs(s.vy) * 0.25;
        s.vx *= 0.65;
        s.vz *= 0.65;
        s.bounced = true;
      }

      // Shift ribbon history smoothly
      s.sampleTimer += dt;
      if (s.sampleTimer >= 0.024) {
        s.sampleTimer = 0;
        for (let i = this.nodes - 1; i > 0; i--) {
          s.history[i * 3] = s.history[(i - 1) * 3];
          s.history[i * 3 + 1] = s.history[(i - 1) * 3 + 1] + dt * 0.8; // subtle smoke rise
          s.history[i * 3 + 2] = s.history[(i - 1) * 3 + 2];
        }
      }
      s.history[0] = s.px;
      s.history[1] = s.py;
      s.history[2] = s.pz;

      // Gently drift older nodes upward
      for (let i = 1; i < this.nodes; i++) {
        s.history[i * 3 + 1] += dt * (0.35 + i * 0.06);
      }

      const posArr = s.posAttr.array as Float32Array;
      const heatAttr = s.mesh.geometry.attributes.aHeat as THREE.BufferAttribute;
      const heatArr = heatAttr.array as Float32Array;
      const lifeFade = Math.min(1, s.life / Math.min(0.45, s.maxLife * 0.45));
      const headHeat = s.bounced ? lifeFade * 0.4 : lifeFade;

      for (let i = 0; i < this.nodes; i++) {
        const hx = s.history[i * 3];
        const hy = s.history[i * 3 + 1];
        const hz = s.history[i * 3 + 2];

        const nextIdx = Math.min(this.nodes - 1, i + 1);
        const prevIdx = Math.max(0, i - 1);
        this._tangent.set(
          s.history[prevIdx * 3] - s.history[nextIdx * 3],
          s.history[prevIdx * 3 + 1] - s.history[nextIdx * 3 + 1],
          s.history[prevIdx * 3 + 2] - s.history[nextIdx * 3 + 2],
        );
        if (this._tangent.lengthSq() < 1e-5) {
          this._tangent.set(s.vx, s.vy, s.vz);
        }
        if (this._tangent.lengthSq() < 1e-5) {
          this._tangent.set(1, 0, 0);
        }
        this._tangent.normalize();

        this._toCam.set(this._camPos.x - hx, this._camPos.y - hy, this._camPos.z - hz).normalize();
        this._side.crossVectors(this._tangent, this._toCam);
        if (this._side.lengthSq() < 1e-4) this._side.set(0, 0, 1);
        else this._side.normalize();

        const u = i / (this.nodes - 1);
        const halfWidth = 0.055 + u * 0.26;
        const vIdx = i * 6;
        posArr[vIdx] = hx - this._side.x * halfWidth;
        posArr[vIdx + 1] = hy - this._side.y * halfWidth;
        posArr[vIdx + 2] = hz - this._side.z * halfWidth;
        posArr[vIdx + 3] = hx + this._side.x * halfWidth;
        posArr[vIdx + 4] = hy + this._side.y * halfWidth;
        posArr[vIdx + 5] = hz + this._side.z * halfWidth;

        heatArr[i * 2] = headHeat;
        heatArr[i * 2 + 1] = headHeat;
      }

      s.posAttr.needsUpdate = true;
      heatAttr.needsUpdate = true;
    }
  }

  public reset(): void {
    this.activeCount = 0;
    for (const s of this.slots) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.reset();
    this.sharedMat.dispose();
    for (const s of this.slots) {
      s.mesh.geometry.dispose();
    }
  }
}

/**
 * Upgraded Procedural GLSL FBM Shader Billboard Pool with:
 * - True Depth-Buffered Soft Particles (when DepthTexture is supplied)
 * - Directional Sun Scattering (Henyey-Greenstein-like top/sun rim)
 * - Dynamic Internal Fireball Bounce Illumination on smoke clouds
 * - Toroidal Vortex & Curl-Noise Advection for explosion plumes
 */
class ProceduralBillboardPool {
  public mesh: THREE.InstancedMesh;
  private items: BillboardItem[];
  private activeCount = 0;
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private tintArray: Float32Array;
  private tintAttr: THREE.InstancedBufferAttribute;
  private paramArray: Float32Array; // vec4(ageNorm, modeCode, seed, maxAlpha)
  private paramAttr: THREE.InstancedBufferAttribute;

  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private _vel = new THREE.Vector3();
  private _rotQuat = new THREE.Quaternion();
  private _rollAxis = new THREE.Vector3(0, 0, 1);
  private _rollQuat = new THREE.Quaternion();

  public uniforms: {
    uTime: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uBlastPos: { value: THREE.Vector3 };
    uBlastGlow: { value: number };
    uDepthTex: { value: THREE.Texture | null };
    uHasDepth: { value: number };
    uCameraNear: { value: number };
    uCameraFar: { value: number };
    uResolution: { value: THREE.Vector2 };
  };

  constructor(
    parent: THREE.Group,
    additive: boolean,
    renderOrder: number,
    capacity: number,
    depthUniforms: PyroclasticVolumePool['depthUniforms'],
    sunDir: THREE.Vector3,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.tintArray = new Float32Array(capacity * 4);
    this.tintAttr = new THREE.InstancedBufferAttribute(this.tintArray, 4);
    this.tintAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTint', this.tintAttr);

    this.paramArray = new Float32Array(capacity * 4);
    this.paramAttr = new THREE.InstancedBufferAttribute(this.paramArray, 4);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aParams', this.paramAttr);

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: sunDir },
      uBlastPos: { value: new THREE.Vector3(0, -50, 0) },
      uBlastGlow: { value: 0 },
      uDepthTex: depthUniforms.uDepthTex,
      uHasDepth: depthUniforms.uHasDepth,
      uCameraNear: depthUniforms.uCameraNear,
      uCameraFar: depthUniforms.uCameraFar,
      uResolution: depthUniforms.uResolution,
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aTint;
        attribute vec4 aParams;
        varying vec2 vUv;
        varying vec4 vTint;
        varying vec4 vParams;
        varying vec3 vWorldPos;
        varying float vViewDepth;
        void main() {
          vUv = uv;
          vTint = aTint;
          vParams = aParams;
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vec4 mv = viewMatrix * worldPos;
          vViewDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uBlastPos;
        uniform float uBlastGlow;
        varying vec2 vUv;
        varying vec4 vTint;
        varying vec4 vParams;
        varying vec3 vWorldPos;
        varying float vViewDepth;
        ${NOISE_3D_GLSL}
        ${DEPTH_SOFT_SAMPLER_GLSL}

        void main() {
          float age = vParams.x;
          float mode = vParams.y;
          float seed = vParams.z;
          float maxAlpha = vParams.w;
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);

          if (mode > 2.5) {
            // Mode 3: Velocity-stretched ballistic incandescent spark
            float d = length(vec2(p.x * 1.5, p.y));
            if (d > 1.0) discard;
            float core = pow(max(0.0001, 1.0 - d), 2.2);
            float hotTail = smoothstep(1.0, -0.4, p.y) * 0.35 + 0.65;
            float a = core * hotTail * vTint.a * computeDepthSoftness(vViewDepth, 0.25);
            if (a < 0.004) discard;
            gl_FragColor = vec4(vTint.rgb * (core * 1.4 + 0.35) * a, a);
            return;
          }

          if (mode > 1.5) {
            // Mode 2: 4-point specular crystal sparkle glint
            if (r > 1.0) discard;
            float starX = exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.2);
            float starY = exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.2);
            float core = pow(max(0.0001, 1.0 - r), 3.4);
            float twinkle = 0.65 + 0.35 * sin(uTime * 22.0 + seed * 19.0);
            float intensity = (starX + starY + core * 1.4) * twinkle * vTint.a;
            if (intensity < 0.01) discard;
            gl_FragColor = vec4(vTint.rgb * intensity, clamp(intensity, 0.0, 1.0));
            return;
          }

          if (mode < 0.5) {
            // Mode 0: Secondary turbulent FBM flame tongues with dark cooling soot rims
            vec2 flow = vec2(seed * 3.1, -age * 2.8 + seed * 1.7);
            float n1 = vfxFbm(p * 2.6 + flow);
            float n2 = vfxFbm(p * 5.8 - flow * 1.4 + vec2(n1 * 1.3));
            float billow = 1.0 - abs(n1 * 2.0 - 1.0);
            float dist = r + (n1 - 0.5) * 0.58 + (n2 - 0.5) * 0.28;
            float erosion = mix(0.08, 0.62, pow(max(0.0001, age), 1.3));
            float mask = smoothstep(0.92 - erosion, 0.22, dist);
            if (mask < 0.005) discard;

            float heat = clamp((0.78 - dist * 0.85) * (1.0 - age * 0.92) + (0.45 - billow) * 0.36 + (n2 - 0.5) * 0.24, 0.0, 1.0);
            vec3 cWhite = vec3(2.8, 2.1, 1.05);
            vec3 cOrange = vec3(2.2, 0.56, 0.07);
            vec3 cRed = vec3(0.95, 0.13, 0.02);
            vec3 cChar = vec3(0.05, 0.045, 0.048);

            vec3 col = mix(cChar, cRed, smoothstep(0.18, 0.42, heat));
            col = mix(col, cOrange, smoothstep(0.40, 0.68, heat));
            col = mix(col, cWhite, smoothstep(0.68, 0.95, heat));

            float env = age < 0.08 ? age / 0.08 : pow(max(0.0001, 1.0 - (age - 0.08) / 0.92), 1.25);
            float groundSoft = smoothstep(-0.12, 0.3, vWorldPos.y);
            float depthSoft = computeDepthSoftness(vViewDepth, 0.85);
            float a = mask * env * groundSoft * depthSoft * maxAlpha;
            if (a < 0.004) discard;
            gl_FragColor = vec4(col, a);
            return;
          }

          // Mode 1: Volumetric FBM smoke / mineral dust / ground blast skirt
          vec2 drift = vec2(seed * 4.3 + age * 0.5, -age * 1.2 + seed * 2.1);
          float n1 = vfxFbm(p * 2.2 + drift);
          float n2 = vfxFbm(p * 4.9 - drift * 0.85 + vec2(n1 * 0.9));
          float dist = r + (n1 - 0.5) * 0.48 + (n2 - 0.5) * 0.24;
          float erodeCut = mix(0.95, 0.38, pow(max(0.0001, age), 1.45));
          float density = smoothstep(erodeCut, 0.14, dist) * (0.62 + n2 * 0.46);
          if (density < 0.005) discard;

          // Pseudo-normal directional sun lighting + internal blast core under-lighting!
          vec3 sDir = normalize(uSunDir);
          float sunDot = p.x * sDir.x * 0.45 + p.y * (0.45 + sDir.y * 0.45);
          float rimLight = smoothstep(0.45, 0.95, r) * (0.28 + 0.35 * max(0.0, sunDot));
          float topLight = clamp(0.54 + sunDot * 0.36 + (n2 - 0.5) * 0.32 + rimLight, 0.32, 1.24);

          vec3 litColor = vTint.rgb * topLight;
          if (uBlastGlow > 0.01) {
            float blastDist = length(vWorldPos - uBlastPos);
            float blastAtten = exp(-blastDist * 0.36) * uBlastGlow;
            float underside = clamp(0.65 - p.y * 0.5, 0.0, 1.0);
            litColor += vec3(2.2, 0.72, 0.14) * blastAtten * underside * (0.45 + (1.0 - density) * 0.75);
          }

          float fadeIn = smoothstep(0.0, 0.1, age);
          float fadeOut = pow(max(0.0001, 1.0 - age), 1.4);
          float groundSoft = smoothstep(-0.1, 0.26, vWorldPos.y);
          float depthSoft = computeDepthSoftness(vViewDepth, 0.95);
          float a = clamp(density * fadeIn * fadeOut * groundSoft * depthSoft * maxAlpha, 0.0, 0.92);
          if (a < 0.004) discard;
          gl_FragColor = vec4(litColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.mesh);

    this.items = Array.from({ length: capacity }, () => ({
      active: false,
      life: 0,
      maxLife: 1,
      px: 0,
      py: -999,
      pz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      roll: 0,
      rollVel: 0,
      startScale: 1,
      endScale: 2,
      gravity: 0,
      drag: 0.94,
      turbulence: 0,
      mode: 'smoke',
      seed: 0,
      baseR: 1,
      baseG: 1,
      baseB: 1,
      maxAlpha: 0.85,
      vortexId: -1,
    }));

    this.reset();
  }

  public reset(): void {
    this.cursor = 0;
    this.activeCount = 0;
    this.mesh.visible = false;
    this.dummy.position.set(0, -999, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].active = false;
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.tintArray[i * 4 + 3] = 0;
      this.paramArray[i * 4 + 3] = 0;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tintAttr.needsUpdate = true;
    this.paramAttr.needsUpdate = true;
  }

  public spawn(opts: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    startScale: number;
    endScale: number;
    life: number;
    gravity: number;
    drag: number;
    turbulence?: number;
    rollVel?: number;
    mode: BillboardMode;
    hexColor?: number;
    maxAlpha?: number;
    vortexId?: number;
  }): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.items.length;
    const p = this.items[idx];
    if (!p.active) {
      this.activeCount++;
    }
    p.active = true;
    this.mesh.visible = true;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.px = opts.x;
    p.py = opts.y;
    p.pz = opts.z;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.vz = opts.vz;
    p.roll = Math.random() * Math.PI * 2;
    p.rollVel = opts.rollVel ?? (Math.random() - 0.5) * 1.8;
    p.startScale = opts.startScale;
    p.endScale = opts.endScale;
    p.gravity = opts.gravity;
    p.drag = opts.drag;
    p.turbulence = opts.turbulence ?? 0;
    p.mode = opts.mode;
    p.seed = Math.random() * 100;
    p.maxAlpha = opts.maxAlpha ?? (opts.mode === 'smoke' ? 0.78 : 0.95);
    p.vortexId = opts.vortexId ?? -1;

    this.color.setHex(opts.hexColor ?? 0xffffff);
    p.baseR = this.color.r;
    p.baseG = this.color.g;
    p.baseB = this.color.b;
  }

  public update(
    dt: number,
    elapsed: number,
    camQuat: THREE.Quaternion,
    obstacles: ActiveBlockObstacle[],
    explosions: ActiveExplosion[],
  ): void {
    if (this.activeCount === 0) {
      this.mesh.visible = false;
      return;
    }
    this.uniforms.uTime.value = elapsed;

    let dirty = false;
    this._fwd.set(0, 0, 1).applyQuaternion(camQuat);

    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (!p.active) continue;
      dirty = true;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.tintArray[i * 4 + 3] = 0;
        this.paramArray[i * 4 + 3] = 0;
        continue;
      }

      p.vy += p.gravity * dt;
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;

      if (p.vortexId >= 0) {
        const exp = explosions[p.vortexId];
        if (exp && exp.active) {
          const vortexVel = computeToroidalVortexVelocity(
            p.px,
            p.py,
            p.pz,
            exp.x,
            exp.ringY,
            exp.z,
            exp.age,
            exp.big ? 2.6 : 1.3,
            exp.vortexStrength,
          );
          p.vx += vortexVel.x * dt * 2.1;
          p.vy += vortexVel.y * dt * 2.1;
          p.vz += vortexVel.z * dt * 2.1;
        }
      } else if (p.turbulence > 0) {
        p.vx += Math.sin(elapsed * 3.6 + i * 1.9 + p.py * 0.7) * p.turbulence * dt;
        p.vz += Math.cos(elapsed * 3.1 + i * 2.3 + p.px * 0.7) * p.turbulence * dt;
      }

      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;
      p.roll += p.rollVel * dt;

      const floorY = groundHeightAt(p.px, p.pz) + (p.mode === 'spark' ? 0.08 : 0.14);
      if (p.mode === 'spark') {
        if (p.py < floorY) {
          p.py = floorY;
          p.vy = Math.abs(p.vy) * 0.45;
          p.vx *= 0.72;
          p.vz *= 0.72;
        }
        for (let k = 0; k < obstacles.length; k++) {
          const ob = obstacles[k];
          const dx = p.px - ob.position.x;
          const dy = p.py - ob.position.y;
          const dz = p.pz - ob.position.z;
          if (
            Math.abs(dx) < ob.halfExtents.x &&
            Math.abs(dy) < ob.halfExtents.y &&
            Math.abs(dz) < ob.halfExtents.z
          ) {
            const ox = ob.halfExtents.x - Math.abs(dx);
            const oy = ob.halfExtents.y - Math.abs(dy);
            const oz = ob.halfExtents.z - Math.abs(dz);
            if (oy <= ox && oy <= oz) {
              p.py += (dy >= 0 ? 1 : -1) * oy;
              p.vy = -p.vy * 0.5;
            } else if (ox <= oz) {
              p.px += (dx >= 0 ? 1 : -1) * ox;
              p.vx = -p.vx * 0.55;
            } else {
              p.pz += (dz >= 0 ? 1 : -1) * oz;
              p.vz = -p.vz * 0.55;
            }
          }
        }
      } else if (p.py < floorY) {
        p.py = floorY;
        p.vy = Math.max(0.15, p.vy * 0.25);
      }

      const age = Math.min(1, Math.max(0, 1 - p.life / p.maxLife));
      const easeOut = 1 - Math.pow(1 - age, 2.1);
      const scale = p.startScale + (p.endScale - p.startScale) * easeOut;

      this.dummy.position.set(p.px, p.py, p.pz);

      let outR = p.baseR;
      let outG = p.baseG;
      let outB = p.baseB;
      let outA = 1;

      if (p.mode === 'spark') {
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        if (speed > 0.35) {
          this._vel.set(p.vx / speed, p.vy / speed, p.vz / speed);
          this._right.crossVectors(this._vel, this._fwd);
          if (this._right.lengthSq() < 0.0001) this._right.set(1, 0, 0);
          else this._right.normalize();
          this._up.copy(this._vel);
          const m = this.dummy.matrix;
          m.makeBasis(this._right, this._up, this._fwd);
          this._rotQuat.setFromRotationMatrix(m);
          this.dummy.quaternion.copy(this._rotQuat);
          const stretch = Math.min(5.5, 1.3 + speed * 0.12);
          const fade = Math.pow(1 - age, 0.8);
          this.dummy.scale.set(scale * fade, scale * stretch * fade, 1);
        } else {
          this.dummy.quaternion.copy(camQuat);
          this.dummy.scale.setScalar(Math.max(0.01, scale * (1 - age)));
        }

        const cool = Math.pow(1 - age, 0.68);
        outR = 3.2 * cool * (0.42 + 0.58 * p.baseR);
        outG = 2.0 * Math.pow(cool, 1.45) * (0.28 + 0.72 * p.baseG);
        outB = 0.95 * Math.pow(cool, 2.3) * (0.22 + 0.78 * p.baseB);
        outA = Math.pow(1 - age, 0.62) * p.maxAlpha;
      } else if (p.mode === 'glint') {
        this._rollQuat.setFromAxisAngle(this._rollAxis, p.roll);
        this.dummy.quaternion.copy(camQuat).multiply(this._rollQuat);
        const pulse = Math.sin(age * Math.PI);
        this.dummy.scale.setScalar(Math.max(0.01, scale * (0.6 + pulse * 0.6)));
        outR = p.baseR * 1.5;
        outG = p.baseG * 1.5;
        outB = p.baseB * 1.6;
        outA = pulse * p.maxAlpha;
      } else {
        this._rollQuat.setFromAxisAngle(this._rollAxis, p.roll);
        this.dummy.quaternion.copy(camQuat).multiply(this._rollQuat);
        this.dummy.scale.setScalar(Math.max(0.01, scale));
      }

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const ti = i * 4;
      this.tintArray[ti] = outR;
      this.tintArray[ti + 1] = outG;
      this.tintArray[ti + 2] = outB;
      this.tintArray[ti + 3] = outA;

      this.paramArray[ti] = age;
      this.paramArray[ti + 1] =
        p.mode === 'fire' ? 0 : p.mode === 'smoke' ? 1 : p.mode === 'glint' ? 2 : 3;
      this.paramArray[ti + 2] = p.seed;
      this.paramArray[ti + 3] = p.maxAlpha;
    }

    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.tintAttr.needsUpdate = true;
      this.paramAttr.needsUpdate = true;
    }
    this.mesh.visible = this.activeCount > 0;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface ShockRingSlot {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  delay: number;
  duration: number;
  startRadius: number;
  maxRadius: number;
  spinSpeed: number;
  opacityPeak: number;
  seed: number;
  baseQuat: THREE.Quaternion;
  spinAxis: THREE.Vector3;
}

/**
 * Arbitrary 3D-Oriented Volumetric Acoustic & Mach-Stem Shock Ring Pool:
 * Powers Black Bird's blistering ground Mach-stem shock ring, Yellow Bird's twin
 * perpendicular sonic-boom rings, and Red Bird's counter-spinning gyroscopic rings.
 */
class ShockRingPool {
  private slots: ShockRingSlot[] = [];
  private activeCount = 0;
  private sharedGeo: THREE.BufferGeometry;
  private baseMat: THREE.ShaderMaterial;
  private _spinQuat = new THREE.Quaternion();

  constructor(
    parent: THREE.Group,
    depthUniforms: PyroclasticVolumePool['depthUniforms'],
    capacity = 10,
  ) {
    this.sharedGeo = new THREE.RingGeometry(0.16, 1.0, 64, 3);
    this.baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uOpacity: { value: 0 },
        uSeed: { value: 0 },
        uCoreColor: { value: new THREE.Color(0xfff4d6) },
        uEdgeColor: { value: new THREE.Color(0xff6b1a) },
        uDepthTex: depthUniforms.uDepthTex,
        uHasDepth: depthUniforms.uHasDepth,
        uCameraNear: depthUniforms.uCameraNear,
        uCameraFar: depthUniforms.uCameraFar,
        uResolution: depthUniforms.uResolution,
      },
        vertexShader: /* glsl */ `
          varying vec2 vLocalPos;
          varying float vViewDepth;
          varying float vWorldY;
          void main() {
            vLocalPos = position.xy;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldY = wp.y;
            vec4 mv = viewMatrix * wp;
            vViewDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAge;
          uniform float uOpacity;
          uniform float uSeed;
          uniform vec3 uCoreColor;
          uniform vec3 uEdgeColor;
          varying vec2 vLocalPos;
          varying float vViewDepth;
          varying float vWorldY;
          ${NOISE_3D_GLSL}
          ${DEPTH_SOFT_SAMPLER_GLSL}

          void main() {
            float r = length(vLocalPos);
            if (r < 0.16 || r > 0.98) discard;
            float ang = atan(vLocalPos.y, vLocalPos.x);

            // Turbulent radial air-shear filaments breaking up geometric perfection
            float n1 = vfxFbm(vec2(ang * 5.0 + uSeed, r * 4.5 - uAge * 4.8));
            float n2 = vfxFbm(vec2(ang * 11.0 - uSeed * 1.4, r * 8.5 - uAge * 7.2));
            float rPerturb = r + (n1 - 0.5) * 0.07 + (n2 - 0.5) * 0.03;

            // Crisp razor shock front + harmonic secondary ripple + soft trailing vapor tail
            float primaryCrest = exp(-pow((rPerturb - 0.82) * 15.5, 2.0));
            float harmonicCrest = exp(-pow((rPerturb - 0.64) * 18.0, 2.0)) * 0.45 * (1.0 - uAge * 0.6);
            float wake = smoothstep(0.28, 0.80, rPerturb) * smoothstep(0.96, 0.78, rPerturb) * (0.28 + n1 * 0.52);
            float quadEdgeFeather = smoothstep(0.98, 0.86, r);
            float groundSoft = smoothstep(-0.02, 0.38, vWorldY);

            float intensity = (primaryCrest * 1.65 + harmonicCrest + wake * 0.55) * quadEdgeFeather;
            float alpha = clamp(intensity * uOpacity * groundSoft, 0.0, 0.96);
            alpha *= computeDepthSoftness(vViewDepth, 0.55);
            if (alpha < 0.004) discard;

            vec3 col = mix(uEdgeColor, uCoreColor, clamp(primaryCrest * 1.15 + harmonicCrest * 0.5, 0.0, 1.0));
            col *= (1.15 + primaryCrest * 1.65);
            gl_FragColor = vec4(col, alpha);
          }
        `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.baseMat.customProgramCacheKey = () => 'shock-ring-v1';

    for (let i = 0; i < capacity; i++) {
      const mat = this.baseMat.clone();
      mat.customProgramCacheKey = this.baseMat.customProgramCacheKey;
      mat.uniforms.uDepthTex = depthUniforms.uDepthTex;
      mat.uniforms.uHasDepth = depthUniforms.uHasDepth;
      mat.uniforms.uCameraNear = depthUniforms.uCameraNear;
      mat.uniforms.uCameraFar = depthUniforms.uCameraFar;
      mat.uniforms.uResolution = depthUniforms.uResolution;
      mat.uniforms.uSeed.value = i * 11.7;

      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      parent.add(mesh);

      this.slots.push({
        mesh,
        active: false,
        age: 0,
        delay: 0,
        duration: 0.45,
        startRadius: 0.5,
        maxRadius: 10,
        spinSpeed: 0,
        opacityPeak: 0.85,
        seed: i * 11.7,
        baseQuat: new THREE.Quaternion(),
        spinAxis: new THREE.Vector3(0, 0, 1),
      });
    }
  }

  public spawn(opts: {
    x: number;
    y: number;
    z: number;
    quaternion: THREE.Quaternion;
    startRadius: number;
    maxRadius: number;
    duration: number;
    delay?: number;
    spinSpeed?: number;
    coreColor: number;
    edgeColor: number;
    opacityPeak?: number;
  }): void {
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((a, b) => (a.age / a.duration > b.age / b.duration ? a : b));
    } else {
      this.activeCount++;
    }
    slot.active = true;
    slot.age = 0;
    slot.delay = opts.delay ?? 0;
    slot.duration = opts.duration;
    slot.startRadius = opts.startRadius;
    slot.maxRadius = opts.maxRadius;
    slot.spinSpeed = opts.spinSpeed ?? 0;
    slot.opacityPeak = opts.opacityPeak ?? 0.9;
    slot.seed = Math.random() * 50;
    slot.baseQuat.copy(opts.quaternion);

    slot.mesh.position.set(opts.x, opts.y, opts.z);
    slot.mesh.quaternion.copy(opts.quaternion);
    slot.mesh.scale.setScalar(opts.startRadius);
    slot.mesh.visible = slot.delay <= 0;

    const u = (slot.mesh.material as THREE.ShaderMaterial).uniforms;
    u.uCoreColor.value.setHex(opts.coreColor);
    u.uEdgeColor.value.setHex(opts.edgeColor);
    u.uSeed.value = slot.seed;
    u.uAge.value = 0;
    u.uOpacity.value = 0;
  }

  public update(dt: number): void {
    if (this.activeCount === 0) return;
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const localAge = s.age - s.delay;
      if (localAge < 0) {
        s.mesh.visible = false;
        continue;
      }
      if (localAge >= s.duration) {
        s.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        s.mesh.visible = false;
        continue;
      }

      s.mesh.visible = true;
      const t = localAge / s.duration;
      const radius =
        s.startRadius + (s.maxRadius - s.startRadius) * Math.pow(t, 0.56);
      s.mesh.scale.setScalar(radius);

      if (s.spinSpeed !== 0) {
        this._spinQuat.setFromAxisAngle(s.spinAxis, localAge * s.spinSpeed);
        s.mesh.quaternion.copy(s.baseQuat).multiply(this._spinQuat);
      }

      const fadeIn = Math.min(1, t / 0.08);
      const fadeOut = Math.pow(1 - t, 1.55);
      const u = (s.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uAge.value = t;
      u.uOpacity.value = fadeIn * fadeOut * s.opacityPeak;
    }
  }

  public hasActive(): boolean {
    return this.activeCount > 0;
  }

  public reset(): void {
    this.activeCount = 0;
    for (const s of this.slots) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.reset();
    this.sharedGeo.dispose();
    this.baseMat.dispose();
    for (const s of this.slots) {
      (s.mesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * Physical Prandtl-Glauert Supersonic Mach Vapor Cone for Yellow Bird:
 * Curved fluted aerodynamic condensation cone + plasma bow shock riding live
 * along the bird's 3D velocity vector after sonic boost ignition.
 */
class MachConeEffect {
  private group = new THREE.Group();
  private outerCone: THREE.Mesh;
  private innerPlasmaCone: THREE.Mesh;
  private active = false;
  private age = 0;
  private duration = 0.78;
  private lastPos = new THREE.Vector3();
  private lastVel = new THREE.Vector3(1, 0, 0);
  private _dir = new THREE.Vector3();
  private _forward = new THREE.Vector3(0, 0, 1);
  private _quat = new THREE.Quaternion();

  constructor(parent: THREE.Group) {
    // Open curved parabolic Mach cone: nose tip at z = +0.15, open flared skirt trailing to z = -1.0
    const buildParabolicConeGeo = (radSegs: number, heightSegs: number, flareExp: number) => {
      const geo = new THREE.CylinderGeometry(0.05, 1.0, 1.15, radSegs, heightSegs, true);
      // Cylinder runs along +Y (top = +0.575, bottom = -0.575). Map top -> z=+0.15 (nose), bottom -> z=-1.0 (tail)
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const t = (0.575 - vy) / 1.15; // 0 at nose, 1 at trailing rim
        const curR = Math.hypot(vx, vz);
        const targetR = 0.06 + Math.pow(Math.max(0, t), flareExp) * 0.94;
        const scaleR = curR > 1e-4 ? targetR / curR : 1;
        pos.setXYZ(i, vx * scaleR, vz * scaleR, 0.15 - t * 1.15);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const outerGeo = buildParabolicConeGeo(44, 10, 0.78);
    const outerMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAge: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        void main() {
          vUv = uv;
          vLocalPos = position;
          float trailT = clamp((0.15 - position.z) / 1.15, 0.0, 1.0);
          float ang = atan(position.y, position.x);
          // Subtle supersonic flutter along trailing condensation skirt
          float flutter = sin(ang * 9.0 - uTime * 34.0 + trailT * 10.0) * 0.045 * trailT;
          vec3 p = position + vec3(cos(ang) * flutter, sin(ang) * flutter, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewPos = -mv.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAge;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        ${NOISE_3D_GLSL}

        void main() {
          float trailT = clamp((0.15 - vLocalPos.z) / 1.15, 0.0, 1.0);
          float ang = atan(vLocalPos.y, vLocalPos.x);

          // High-speed fluted condensation striations streaming aft along Mach cone
          float streaks = vfxFbm(vec2(ang * 4.2, trailT * 4.8 - uTime * 11.5));
          float fine = vfxFbm(vec2(ang * 9.5 + 3.1, trailT * 9.0 - uTime * 18.0));
          float vaporSheet = smoothstep(0.22, 0.85, streaks * 0.68 + fine * 0.32);

          // View-dependent Fresnel condensation limb + crisp nose bow-shock crest
          float ndv = abs(dot(normalize(vNormalView), normalize(vViewPos)));
          float fresnel = pow(max(0.0001, 1.0 - ndv), 1.45);
          float bowShock = exp(-pow((trailT - 0.14) * 8.5, 2.0));
          float noseCap = smoothstep(0.0, 0.08, trailT);
          float tailFade = smoothstep(1.0, 0.42 + (streaks - 0.5) * 0.25, trailT);
          float edgeFeather = smoothstep(0.0, 0.24, ndv);

          float density = (fresnel * edgeFeather * 1.15 + 0.24 * edgeFeather) * (0.45 + vaporSheet * 0.85) + bowShock * 0.95;
          float alpha = clamp(density * noseCap * tailFade * uIntensity * 0.88, 0.0, 0.95);
          if (alpha < 0.005) discard;

          // Pearlescent Prandtl-Glauert vapor white -> blazing golden bow plasma at nose
          vec3 cVapor = vec3(0.95, 0.98, 1.05);
          vec3 cGold = vec3(2.8, 1.95, 0.45);
          vec3 cWhiteHot = vec3(3.8, 3.2, 1.95);
          vec3 col = mix(cVapor, cGold, clamp(bowShock * 0.75 + (1.0 - trailT) * 0.65, 0.0, 1.0));
          col = mix(col, cWhiteHot, clamp(bowShock * 0.85 + fresnel * 0.35, 0.0, 1.0));

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.outerCone = new THREE.Mesh(outerGeo, outerMat);
    this.outerCone.renderOrder = 6;
    this.group.add(this.outerCone);

    const innerGeo = buildParabolicConeGeo(32, 6, 0.95);
    const innerMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPos;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        void main() {
          vLocalPos = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec3 vLocalPos;
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        ${NOISE_3D_GLSL}
        void main() {
          float trailT = clamp((0.15 - vLocalPos.z) / 1.15, 0.0, 1.0);
          float ang = atan(vLocalPos.y, vLocalPos.x);
          float jet = vfxFbm(vec2(ang * 5.0, trailT * 6.5 - uTime * 22.0));
          float ndv = abs(dot(normalize(vNormalView), normalize(vViewPos)));
          // Bright axial core that feathers smoothly at grazing edges (no sharp silhouette lines)
          float core = pow(max(0.0001, ndv), 0.75) * smoothstep(0.0, 0.36, ndv) * smoothstep(0.0, 0.06, trailT) * pow(max(0.0001, 1.0 - trailT), 1.35);
          float a = clamp(core * (0.65 + jet * 0.85) * uIntensity * 1.15, 0.0, 0.96);
          if (a < 0.005) discard;
          vec3 col = mix(vec3(2.9, 1.45, 0.16), vec3(4.2, 3.6, 2.1), clamp((1.0 - trailT) * 1.15, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.innerPlasmaCone = new THREE.Mesh(innerGeo, innerMat);
    this.innerPlasmaCone.scale.set(0.46, 0.46, 1.18);
    this.innerPlasmaCone.renderOrder = 6;
    this.group.add(this.innerPlasmaCone);

    this.group.visible = false;
    parent.add(this.group);
  }

  public trigger(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.active = true;
    this.age = 0;
    this.duration = 0.78;
    this.lastPos.set(x, y, z);
    this.lastVel.set(vx, vy, vz);
    this.group.visible = true;
    this.alignTo(this.lastPos, this.lastVel, 0.001, 0);
  }

  private alignTo(pos: THREE.Vector3, vel: THREE.Vector3, elapsed: number, age: number): void {
    const speed = vel.length();
    const params = computeMachConeParams(speed, age, this.duration);
    if (!params.active) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this._dir.copy(vel).normalize();
    this._quat.setFromUnitVectors(this._forward, this._dir);
    // Position nose slightly ahead of bird center
    this.group.position.copy(pos).addScaledVector(this._dir, 0.52);
    this.group.quaternion.copy(this._quat);
    this.group.scale.set(params.radius, params.radius, params.length);

    const ou = (this.outerCone.material as THREE.ShaderMaterial).uniforms;
    ou.uTime.value = elapsed;
    ou.uAge.value = age / this.duration;
    ou.uIntensity.value = params.intensity * params.pulse;

    const iu = (this.innerPlasmaCone.material as THREE.ShaderMaterial).uniforms;
    iu.uTime.value = elapsed;
    iu.uIntensity.value = params.intensity * 1.1;
  }

  public update(
    dt: number,
    elapsed: number,
    trackedPos: Vec3 | null,
    trackedVel: Vec3 | null,
  ): boolean {
    if (!this.active) return false;
    this.age += dt;
    if (this.age >= this.duration) {
      this.active = false;
      this.group.visible = false;
      return false;
    }
    if (trackedPos && trackedVel) {
      this.lastPos.set(trackedPos.x, trackedPos.y, trackedPos.z);
      this.lastVel.set(trackedVel.x, trackedVel.y, trackedVel.z);
    } else {
      this.lastPos.addScaledVector(this.lastVel, dt);
    }
    this.alignTo(this.lastPos, this.lastVel, elapsed, this.age);
    return this.group.visible;
  }

  public isActive(): boolean {
    return this.active;
  }

  public reset(): void {
    this.active = false;
    this.group.visible = false;
  }

  public dispose(): void {
    this.reset();
    this.outerCone.geometry.dispose();
    (this.outerCone.material as THREE.Material).dispose();
    this.innerPlasmaCone.geometry.dispose();
    (this.innerPlasmaCone.material as THREE.Material).dispose();
  }
}

interface KineticSphereSlot {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  delay: number;
  duration: number;
  maxRadius: number;
  seed: number;
  waveIndex: number;
}

/**
 * 3D Volumetric Displaced Harmonic Kinetic Shock Sphere Pool for Red Bird's Onda de Choque:
 * Renders 3 staggered undulating crimson-gold acoustic pressure domes with Fresnel energy rims,
 * standing-wave interference striations, and soft depth-buffered contact crests on castles!
 */
class KineticShockSpherePool {
  private slots: KineticSphereSlot[] = [];
  private activeCount = 0;
  private sharedGeo: THREE.BufferGeometry;
  private baseMat: THREE.ShaderMaterial;

  constructor(
    parent: THREE.Group,
    isSoftwareGl: boolean,
    depthUniforms: PyroclasticVolumePool['depthUniforms'],
    capacity = 6,
  ) {
    this.sharedGeo = new THREE.IcosahedronGeometry(1, isSoftwareGl ? 3 : 5);
    this.baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uOpacity: { value: 0 },
        uDistort: { value: 0 },
        uSeed: { value: 0 },
        uWaveIdx: { value: 0 },
        uDepthTex: depthUniforms.uDepthTex,
        uHasDepth: depthUniforms.uHasDepth,
        uCameraNear: depthUniforms.uCameraNear,
        uCameraFar: depthUniforms.uCameraFar,
        uResolution: depthUniforms.uResolution,
      },
        vertexShader: /* glsl */ `
          uniform float uAge;
          uniform float uDistort;
          uniform float uSeed;
          varying vec3 vLocalPos;
          varying vec3 vNormalView;
          varying vec3 vViewPos;
          varying float vViewDepth;
          ${NOISE_3D_GLSL}
          void main() {
            // Harmonic acoustic standing-wave displacement across the pressure dome
            float wave = sin(position.y * 7.5 - uAge * 20.0 + uSeed) * 0.5 + 0.5;
            float n = vfxFbm3(position * 2.6 + vec3(uSeed, -uAge * 3.8, uSeed * 0.5));
            vec3 displaced = position * (1.0 + (n - 0.45) * 0.14 * uDistort + (wave - 0.5) * 0.05 * uDistort);
            vLocalPos = displaced;
            vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
            vViewPos = -mv.xyz;
            vViewDepth = -mv.z;
            vNormalView = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAge;
          uniform float uOpacity;
          uniform float uSeed;
          uniform float uWaveIdx;
          varying vec3 vLocalPos;
          varying vec3 vNormalView;
          varying vec3 vViewPos;
          varying float vViewDepth;
          ${NOISE_3D_GLSL}
          ${DEPTH_SOFT_SAMPLER_GLSL}

          void main() {
            vec3 nDir = normalize(vLocalPos);
            float ndv = abs(dot(normalize(vNormalView), normalize(vViewPos)));
            // Clear center + blazing Fresnel pressure shell rim that feathers smoothly at outer grazing silhouette
            float rimFeather = smoothstep(0.0, 0.25, ndv);
            float fresnel = pow(max(0.0001, 1.0 - ndv), 2.35) * rimFeather * 1.45;
            float innerMist = pow(max(0.0001, 1.0 - ndv), 0.95) * rimFeather * 0.16;

            // Acoustic interference filaments & resonant energy striations
            float bands = 0.5 + 0.5 * sin(nDir.y * 18.0 - uAge * 24.0 + vfxFbm3(nDir * 3.8 + uSeed) * 5.0);
            float filament = vfxBillow3(nDir * 3.2 + vec3(uAge * 2.5, -uAge * 4.2, uSeed));
            float energy = fresnel * (0.78 + bands * 0.55 + filament * 0.65) + innerMist * filament;

            // Glowing contact highlight where shock shell intersects solid stone/ground
            float depthSoft = computeDepthSoftness(vViewDepth, 0.9);
            float contactCrest = (1.0 - depthSoft) * step(0.01, depthSoft) * 1.4;

            float alpha = clamp((energy + contactCrest * 0.45) * uOpacity, 0.0, 0.95);
            if (alpha < 0.005) discard;

            // Fierce heroic crimson-vermilion -> solar amber -> incandescent white-gold crest
            vec3 cCrimson = vec3(1.55, 0.14, 0.08);
            vec3 cGold = vec3(3.1, 1.25, 0.22);
            vec3 cWhiteHot = vec3(4.2, 3.1, 2.0);
            float hotMask = clamp(fresnel * 1.15 + bands * 0.35 - uWaveIdx * 0.14, 0.0, 1.0);
            vec3 col = mix(cCrimson, cGold, smoothstep(0.28, 0.72, hotMask));
            col = mix(col, cWhiteHot, smoothstep(0.72, 1.0, hotMask + contactCrest * 0.4));

            gl_FragColor = vec4(col, alpha);
          }
        `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    this.baseMat.customProgramCacheKey = () => 'kinetic-sphere-v1';

    for (let i = 0; i < capacity; i++) {
      const mat = this.baseMat.clone();
      mat.customProgramCacheKey = this.baseMat.customProgramCacheKey;
      mat.uniforms.uDepthTex = depthUniforms.uDepthTex;
      mat.uniforms.uHasDepth = depthUniforms.uHasDepth;
      mat.uniforms.uCameraNear = depthUniforms.uCameraNear;
      mat.uniforms.uCameraFar = depthUniforms.uCameraFar;
      mat.uniforms.uResolution = depthUniforms.uResolution;
      mat.uniforms.uSeed.value = i * 19.3;

      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      parent.add(mesh);

      this.slots.push({
        mesh,
        active: false,
        age: 0,
        delay: 0,
        duration: 0.46,
        maxRadius: 7.5,
        seed: i * 19.3,
        waveIndex: 0,
      });
    }
  }

  public spawnPulse(
    x: number,
    y: number,
    z: number,
    delay: number,
    duration: number,
    maxRadius: number,
    waveIndex: number,
  ): void {
    let slot = this.slots.find((s) => !s.active);
    if (!slot) {
      slot = this.slots.reduce((a, b) => (a.age / a.duration > b.age / b.duration ? a : b));
    } else {
      this.activeCount++;
    }
    slot.active = true;
    slot.age = 0;
    slot.delay = delay;
    slot.duration = duration;
    slot.maxRadius = maxRadius;
    slot.seed = Math.random() * 60;
    slot.waveIndex = waveIndex;

    slot.mesh.position.set(x, y, z);
    slot.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    slot.mesh.scale.setScalar(0.45);
    slot.mesh.visible = delay <= 0;

    const u = (slot.mesh.material as THREE.ShaderMaterial).uniforms;
    u.uSeed.value = slot.seed;
    u.uWaveIdx.value = waveIndex;
    u.uAge.value = 0;
    u.uOpacity.value = 0;
  }

  public update(dt: number): void {
    if (this.activeCount === 0) return;
    for (const s of this.slots) {
      if (!s.active) continue;
      s.age += dt;
      const state = computeKineticPulseWave(s.age, s.delay, s.duration, s.maxRadius);
      if (s.age >= s.delay + s.duration) {
        s.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        s.mesh.visible = false;
        continue;
      }
      if (!state.active) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      s.mesh.scale.setScalar(state.radius);
      s.mesh.rotation.y += dt * (1.2 - s.waveIndex * 0.25);

      const u = (s.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uAge.value = state.progress;
      u.uOpacity.value = state.opacity * (0.96 - s.waveIndex * 0.14);
      u.uDistort.value = state.distortion;
    }
  }

  public hasActive(): boolean {
    return this.activeCount > 0;
  }

  public reset(): void {
    this.activeCount = 0;
    for (const s of this.slots) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.reset();
    this.sharedGeo.dispose();
    this.baseMat.dispose();
    for (const s of this.slots) {
      (s.mesh.material as THREE.Material).dispose();
    }
  }
}

export class VfxManager {
  private scene: THREE.Scene;
  private isSoftwareGl: boolean;
  public vfxGroup = new THREE.Group();
  public debris: PersistentDebrisManager;

  private depthUniforms = {
    uDepthTex: { value: null as THREE.Texture | null },
    uHasDepth: { value: 0 },
    uCameraNear: { value: 0.25 },
    uCameraFar: { value: 260 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
  };
  private sunDir = new THREE.Vector3(0.62, 0.27, 0.73).normalize();

  private pyroVolumes: PyroclasticVolumePool;
  private ribbons: SmokeRibbonPool;
  private smokePlumes: ProceduralBillboardPool;
  private firePlumes: ProceduralBillboardPool;
  private sparks: ProceduralBillboardPool;
  private shockRings: ShockRingPool;
  private machCone: MachConeEffect;
  private kineticSpheres: KineticShockSpherePool;

  // Live tracked bird state for supersonic Mach cone & plasma contrail
  private trackedBirdPos: Vec3 | null = null;
  private trackedBirdVel: Vec3 | null = null;
  private trackedBirdType: BirdType | null = null;
  private supersonicSlipstreamTimer = 0;
  private supersonicEmitAccum = 0;
  private redRoarTimer = 0;

  // Multi-phase active explosion orchestrators
  private explosions: ActiveExplosion[] = [];

  // Layer 1: Sub-50ms ionized diffraction plasma flash + anamorphic flare
  private flashBillboard: THREE.Mesh;
  private flashBillboardTimer = 0;
  private flashBillboardMax = 0.085;
  private flashBillboardScale = 6.0;

  // Dynamic stochastic flickering PointLight with shadow casting
  private flashLight: THREE.PointLight;
  private flashBasePos = new THREE.Vector3();
  private flashTimer = 0;
  private flashMaxTimer = 0.75;
  private flashPeakIntensity = 0;

  // Ephemeral Wilson condensation vapor shell (brief 130ms pressure drop mist — zero glowing orange sphere)
  private wilsonShell: THREE.Mesh;
  private wilsonTimer = 0;
  private wilsonMaxTimer = 0.14;
  private wilsonMaxScale = 8.5;

  // Screen-space pressure wave & transient exposure feedback
  private screenWaveActive = false;
  private screenWaveWorldPos = new THREE.Vector3();
  private screenWaveAge = 0;
  private screenWaveDuration = 0.44;
  private screenWaveMaxRadius = 14;
  private exposureDipTimer = 0;
  private delayedCameraPulse = 0;

  // Persistent scorch + cooling ember craters
  private scorchCraters: ScorchCrater[] = [];
  private scorchGeo: THREE.PlaneGeometry;
  private scorchBaseMat: THREE.ShaderMaterial;

  private _quat = new THREE.Quaternion();
  private _quatB = new THREE.Quaternion();
  private _vec = new THREE.Vector3();
  private _vecB = new THREE.Vector3();
  private _upAxis = new THREE.Vector3(0, 1, 0);
  private _zAxis = new THREE.Vector3(0, 0, 1);
  private _proj = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    textures: TextureLibrary,
    isSoftwareGl: boolean,
    onChunkStrike?: (pos: Vec3, vel: Vec3, radius: number, material: BlockMaterialType) => void,
  ) {
    this.scene = scene;
    this.isSoftwareGl = isSoftwareGl;
    scene.add(this.vfxGroup);

    this.debris = new PersistentDebrisManager(
      scene,
      textures,
      isSoftwareGl,
      (mat, x, y, z, speed) => {
        this.spawnGroundContactDust(mat, x, y, z, Math.min(1, speed / 9));
      },
      onChunkStrike,
    );

    this.pyroVolumes = new PyroclasticVolumePool(
      this.vfxGroup,
      isSoftwareGl,
      this.depthUniforms,
      this.sunDir,
      14,
    );
    this.ribbons = new SmokeRibbonPool(this.vfxGroup, this.depthUniforms, 24);
    this.shockRings = new ShockRingPool(this.vfxGroup, this.depthUniforms, 10);
    this.machCone = new MachConeEffect(this.vfxGroup);
    this.kineticSpheres = new KineticShockSpherePool(
      this.vfxGroup,
      isSoftwareGl,
      this.depthUniforms,
      6,
    );
    this.smokePlumes = new ProceduralBillboardPool(
      this.vfxGroup,
      false,
      2,
      260,
      this.depthUniforms,
      this.sunDir,
    );
    this.firePlumes = new ProceduralBillboardPool(
      this.vfxGroup,
      true,
      3,
      140,
      this.depthUniforms,
      this.sunDir,
    );
    this.sparks = new ProceduralBillboardPool(
      this.vfxGroup,
      true,
      4,
      240,
      this.depthUniforms,
      this.sunDir,
    );

    // Millisecond Plasma Flash Billboard with subtle horizontal anamorphic streak
    const flashGeo = new THREE.PlaneGeometry(1, 1);
    const flashMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0xeef6ff) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float core = exp(-r * 6.5);
          float halo = pow(max(0.0001, 1.0 - r), 3.2) * 0.45;
          float anamorphic = exp(-abs(p.y) * 28.0) * exp(-abs(p.x) * 2.4) * 0.85;
          float rays = (exp(-abs(p.y) * 16.0) + exp(-abs(p.x) * 16.0)) * exp(-r * 3.0) * 0.35;
          float intensity = (core * 2.6 + halo + anamorphic + rays) * uOpacity;
          gl_FragColor = vec4(uColor * intensity, clamp(intensity, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flashBillboard = new THREE.Mesh(flashGeo, flashMat);
    this.flashBillboard.renderOrder = 6;
    this.flashBillboard.visible = false;
    this.vfxGroup.add(this.flashBillboard);

    // Ephemeral Wilson Condensation Shell (broken FBM atmospheric vapor puff — zero sharp grey bubble rim)
    const wilsonGeo = new THREE.IcosahedronGeometry(1, 2);
    const wilsonMat = new THREE.ShaderMaterial({
      uniforms: {
        uAge: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNorm;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        ${NOISE_3D_GLSL}
        void main() {
          float n = vfxFbm3(position * 3.4);
          vec3 p = position * (0.85 + n * 0.28);
          vLocalPos = p;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewPos = -mv.xyz;
          vNorm = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAge;
        uniform float uOpacity;
        varying vec3 vNorm;
        varying vec3 vViewPos;
        varying vec3 vLocalPos;
        ${NOISE_3D_GLSL}
        void main() {
          float ndv = abs(dot(normalize(vNorm), normalize(vViewPos)));
          // Soft internal mist band that fades BOTH at center and outer silhouette edge (no soap-bubble line!)
          float softShell = smoothstep(0.05, 0.42, ndv) * smoothstep(0.95, 0.35, ndv);
          float wisp = vfxFbm3(vLocalPos * 5.2 + vec3(uAge * 2.4));
          float a = softShell * smoothstep(0.38, 0.78, wisp) * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vec3(0.90, 0.94, 0.99), a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.wilsonShell = new THREE.Mesh(wilsonGeo, wilsonMat);
    this.wilsonShell.renderOrder = 5;
    this.wilsonShell.visible = false;
    this.vfxGroup.add(this.wilsonShell);

    this.flashLight = new THREE.PointLight(0xffad48, 0, 34, 1.55);
    this.flashLight.castShadow = false;
    scene.add(this.flashLight);

    this.scorchGeo = new THREE.PlaneGeometry(1, 1);
    this.scorchGeo.rotateX(-Math.PI * 0.5);
    this.scorchBaseMat = new THREE.ShaderMaterial({
      uniforms: {
        uEmberHeat: { value: 1.0 },
        uTime: { value: 0 },
        uSeed: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uEmberHeat;
        uniform float uTime;
        uniform float uSeed;
        varying vec2 vUv;
        ${NOISE_3D_GLSL}
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float ang = atan(p.y, p.x);
          float rays = sin(ang * 13.0 + vfxNoise(p * 4.0 + uSeed) * 3.5) * 0.09;
          float sootN = vfxFbm(p * 3.6 + uSeed);
          float radial = max(0.0, 1.0 - (r + (sootN - 0.5) * 0.38 + rays) / 0.94);
          if (radial <= 0.002) discard;

          float charMask = pow(max(0.0001, radial), 1.45);
          // Ash rim around crater edge, deep charcoal pit inside
          float ashRim = smoothstep(0.15, 0.42, radial) * (1.0 - smoothstep(0.42, 0.78, radial));
          vec3 baseCol = mix(vec3(0.04, 0.035, 0.03), vec3(0.24, 0.21, 0.18), ashRim * 0.6);

          // Glowing cracked cooling embers inside crater center
          float crackPattern = abs(vfxFbm(p * 8.2 - uSeed) - 0.48);
          float emberCrack = (1.0 - smoothstep(0.01, 0.065, crackPattern)) * smoothstep(0.45, 0.88, radial);
          float pulse = 0.72 + 0.28 * sin(uTime * 4.5 + p.x * 9.0 + uSeed);
          vec3 emberCol = vec3(2.2, 0.58, 0.08) * emberCrack * uEmberHeat * pulse;

          gl_FragColor = vec4(baseCol + emberCol, clamp(charMask * 0.88, 0.0, 0.92));
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    this.scorchBaseMat.customProgramCacheKey = () => 'scorch-crater-v1';
  }

  public setEnvironmentContext(
    sunDir: THREE.Vector3,
    depthTex: THREE.Texture | null,
    camNear: number,
    camFar: number,
    width: number,
    height: number,
  ): void {
    this.sunDir.copy(sunDir).normalize();
    this.depthUniforms.uDepthTex.value = depthTex;
    this.depthUniforms.uHasDepth.value = depthTex ? 1 : 0;
    this.depthUniforms.uCameraNear.value = camNear;
    this.depthUniforms.uCameraFar.value = camFar;
    this.depthUniforms.uResolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  public getActiveShockwaveScreenData(camera: THREE.Camera, out: THREE.Vector4): boolean {
    if (!this.screenWaveActive) {
      out.set(0.5, 0.5, 0, 0);
      return false;
    }
    this._proj.copy(this.screenWaveWorldPos).project(camera);
    if (this._proj.z > 1) {
      out.set(0.5, 0.5, 0, 0);
      return false;
    }
    const sx = this._proj.x * 0.5 + 0.5;
    const sy = this._proj.y * 0.5 + 0.5;
    const worldRadius = computeShockwaveRadius(
      this.screenWaveAge,
      this.screenWaveMaxRadius,
      this.screenWaveDuration,
    );
    const dist = Math.max(2, camera.position.distanceTo(this.screenWaveWorldPos));
    const ndcRadius = worldRadius / (dist * 0.85);
    const t = Math.min(1, this.screenWaveAge / this.screenWaveDuration);
    const strength = Math.pow(1 - t, 1.65) * 0.022;
    out.set(sx, sy, ndcRadius, strength);
    return true;
  }

  public getExposureOffset(): number {
    if (this.exposureDipTimer <= 0) return 0;
    const t = this.exposureDipTimer / 0.34;
    // Brief initial overbright punch then adaptive eye compression dip
    if (t > 0.78) {
      return 0.28 * ((t - 0.78) / 0.22);
    }
    return -0.18 * Math.sin((t / 0.78) * Math.PI);
  }

  public consumeDelayedCameraPulse(): number {
    const p = this.delayedCameraPulse;
    this.delayedCameraPulse = 0;
    return p;
  }

  public hasActiveHdrVfx(): boolean {
    if (
      this.flashTimer > 0 ||
      this.flashBillboardTimer > 0 ||
      this.wilsonTimer > 0 ||
      this.exposureDipTimer > 0 ||
      this.supersonicSlipstreamTimer > 0 ||
      this.redRoarTimer > 0 ||
      this.machCone.isActive() ||
      this.shockRings.hasActive() ||
      this.kineticSpheres.hasActive()
    ) {
      return true;
    }
    for (let i = 0; i < this.explosions.length; i++) {
      if (this.explosions[i].active) return true;
    }
    for (let i = 0; i < this.scorchCraters.length; i++) {
      if (this.scorchCraters[i].age < 3.2) return true;
    }
    return false;
  }

  public hasActiveShadowCasters(): boolean {
    return this.debris.hasActiveShadowCasters();
  }

  public updateTrackedBirdAbility(
    pos: Vec3 | null,
    vel: Vec3 | null,
    birdType: BirdType | null,
    alive: boolean,
  ): void {
    if (!alive || !pos || !vel) {
      this.trackedBirdPos = null;
      this.trackedBirdVel = null;
      this.trackedBirdType = null;
      return;
    }
    this.trackedBirdPos = pos;
    this.trackedBirdVel = vel;
    this.trackedBirdType = birdType;
  }

  public getBirdAbilityVisualPulse(birdType: BirdType | undefined): {
    scaleMult: number;
    emissiveHex: number;
    emissiveIntensity: number;
  } {
    if (birdType === 'red' && this.redRoarTimer > 0) {
      const t = this.redRoarTimer / 0.42;
      const swell = 1 + Math.sin(t * Math.PI) * 0.34;
      return {
        scaleMult: swell,
        emissiveHex: 0xff3b14,
        emissiveIntensity: 1.85 * t,
      };
    }
    if (birdType === 'yellow' && this.supersonicSlipstreamTimer > 0) {
      const t = Math.min(1, this.supersonicSlipstreamTimer / 0.55);
      return {
        scaleMult: 1 + 0.14 * t,
        emissiveHex: 0xffd23f,
        emissiveIntensity: 1.65 * t,
      };
    }
    return { scaleMult: 1, emissiveHex: 0x000000, emissiveIntensity: 0 };
  }

  public spawnBlockFracture(
    material: BlockMaterialType,
    pos: Vec3,
    halfExtents: Vec3,
    quat: Quat,
    bodyVel: Vec3,
    impactPoint?: Vec3,
    impactDir?: Vec3,
    impactSpeed = 10,
  ): void {
    this.debris.spawnBlockFracture(
      material,
      pos,
      halfExtents,
      quat,
      bodyVel,
      impactPoint,
      impactDir,
      impactSpeed,
    );

    this._quat.set(quat.x, quat.y, quat.z, quat.w);
    const volume = halfExtents.x * halfExtents.y * halfExtents.z * 8;
    const densityScale = Math.min(2.0, Math.max(0.75, Math.pow(volume, 0.28)));

    const sampleLocal = () => {
      this._vec.set(
        (Math.random() * 2 - 1) * halfExtents.x,
        (Math.random() * 2 - 1) * halfExtents.y,
        (Math.random() * 2 - 1) * halfExtents.z,
      );
      this._vec.applyQuaternion(this._quat);
      this._vec.x += pos.x;
      this._vec.y += pos.y;
      this._vec.z += pos.z;
      return this._vec;
    };

    if (material === 'glass') {
      const glintCount = Math.round(14 * densityScale);
      for (let i = 0; i < glintCount; i++) {
        const p = sampleLocal();
        this.sparks.spawn({
          x: p.x,
          y: Math.max(0.16, p.y),
          z: p.z,
          vx: bodyVel.x * 0.4 + (Math.random() - 0.5) * 8.5,
          vy: 1.5 + Math.random() * 5.2,
          vz: bodyVel.z * 0.4 + (Math.random() - 0.5) * 8.5,
          startScale: 0.22 + Math.random() * 0.22,
          endScale: 0.08,
          life: 0.55 + Math.random() * 0.45,
          gravity: -9.5,
          drag: 0.96,
          mode: 'glint',
          hexColor: i % 2 === 0 ? 0xeaffff : 0xffffff,
          maxAlpha: 0.95,
        });
      }
      const mistCount = Math.round(7 * densityScale);
      for (let i = 0; i < mistCount; i++) {
        const p = sampleLocal();
        this.smokePlumes.spawn({
          x: p.x,
          y: Math.max(0.2, p.y),
          z: p.z,
          vx: bodyVel.x * 0.25 + (Math.random() - 0.5) * 3.4,
          vy: 0.7 + Math.random() * 2.2,
          vz: bodyVel.z * 0.25 + (Math.random() - 0.5) * 3.4,
          startScale: 0.65,
          endScale: 2.3,
          life: 0.7 + Math.random() * 0.45,
          gravity: -0.45,
          drag: 0.92,
          turbulence: 1.4,
          mode: 'smoke',
          hexColor: 0xe2f7ff,
          maxAlpha: 0.46,
        });
      }
      return;
    }

    if (material === 'wood') {
      const dustCount = Math.round(10 * densityScale);
      for (let i = 0; i < dustCount; i++) {
        const p = sampleLocal();
        this.smokePlumes.spawn({
          x: p.x,
          y: Math.max(0.2, p.y),
          z: p.z,
          vx: bodyVel.x * 0.25 + (Math.random() - 0.5) * 3.8,
          vy: 0.5 + Math.random() * 2.3,
          vz: bodyVel.z * 0.25 + (Math.random() - 0.5) * 3.8,
          startScale: 0.75,
          endScale: 2.75,
          life: 1.15 + Math.random() * 0.65,
          gravity: -0.25,
          drag: 0.92,
          turbulence: 1.7,
          mode: 'smoke',
          hexColor: i % 2 === 0 ? 0xd9ba8e : 0xc29e6f,
          maxAlpha: 0.58,
        });
      }
      return;
    }

    const dustCount = Math.round(15 * densityScale);
    for (let i = 0; i < dustCount; i++) {
      const p = sampleLocal();
      this.smokePlumes.spawn({
        x: p.x,
        y: Math.max(0.24, p.y),
        z: p.z,
        vx: bodyVel.x * 0.18 + (Math.random() - 0.5) * 4.0,
        vy: 0.6 + Math.random() * 2.4,
        vz: bodyVel.z * 0.18 + (Math.random() - 0.5) * 4.0,
        startScale: 1.05,
        endScale: 4.1 + Math.random() * 1.6,
        life: 3.1 + Math.random() * 1.6,
        gravity: -0.35,
        drag: 0.91,
        turbulence: 1.6,
        mode: 'smoke',
        hexColor: i % 2 === 0 ? 0xb7bdc4 : 0x8f969e,
        maxAlpha: 0.72,
      });
    }

    for (let i = 0; i < 7; i++) {
      const p = sampleLocal();
      const theta = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 11;
      this.sparks.spawn({
        x: p.x,
        y: Math.max(0.18, p.y),
        z: p.z,
        vx: Math.cos(theta) * spd,
        vy: 2.2 + Math.random() * 6.5,
        vz: Math.sin(theta) * spd,
        startScale: 0.14,
        endScale: 0.08,
        life: 0.25 + Math.random() * 0.2,
        gravity: -18,
        drag: 0.96,
        mode: 'spark',
      });
    }
  }

  public spawnGroundContactDust(
    material: BlockMaterialType | 'ground',
    x: number,
    y: number,
    z: number,
    intensity = 0.6,
  ): void {
    const count = Math.max(2, Math.round(4 * intensity));
    const dustColor =
      material === 'ground'
        ? 0x9b8667
        : material === 'wood'
          ? 0xb59c7a
          : material === 'glass'
            ? 0xd6eef7
            : material === 'metal'
              ? 0x4b515c
              : 0xa2a8b0;
    for (let i = 0; i < count; i++) {
      this.smokePlumes.spawn({
        x: x + (Math.random() - 0.5) * 0.55,
        y: Math.max(0.12, y + 0.12),
        z: z + (Math.random() - 0.5) * 0.55,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 0.55 + Math.random() * 1.45,
        vz: (Math.random() - 0.5) * 3.2,
        startScale: 0.45 + intensity * 0.35,
        endScale: 1.55 + intensity * 0.9,
        life: 0.9 + Math.random() * 0.6,
        gravity: -0.25,
        drag: 0.92,
        turbulence: 1.1,
        mode: 'smoke',
        hexColor: dustColor,
        maxAlpha: 0.52,
      });
    }
  }

  public spawnJointSnapDust(
    material: BlockMaterialType | undefined,
    x: number,
    y: number,
    z: number,
    intensity = 0.7,
  ): void {
    const mat: BlockMaterialType =
      material === 'wood' || material === 'glass' || material === 'stone' || material === 'metal'
        ? material
        : 'stone';
    const puffCount = Math.max(3, Math.min(5, Math.round(3 + intensity * 2)));
    const dustColor =
      mat === 'wood'
        ? 0xcab087
        : mat === 'glass'
          ? 0xd9f1fa
          : mat === 'metal'
            ? 0x5c6470
            : 0xb3b8bf;
    for (let i = 0; i < puffCount; i++) {
      this.smokePlumes.spawn({
        x: x + (Math.random() - 0.5) * 0.45,
        y: Math.max(0.14, y + (Math.random() - 0.5) * 0.25),
        z: z + (Math.random() - 0.5) * 0.45,
        vx: (Math.random() - 0.5) * 2.8,
        vy: 0.35 + Math.random() * 1.15,
        vz: (Math.random() - 0.5) * 2.8,
        startScale: 0.32 + intensity * 0.22,
        endScale: 1.25 + intensity * 0.65,
        life: 0.7 + Math.random() * 0.45,
        gravity: -0.22,
        drag: 0.92,
        turbulence: 1.15,
        mode: 'smoke',
        hexColor: dustColor,
        maxAlpha: 0.56,
      });
    }
    this.debris.spawnImpactChips(
      mat,
      x,
      y,
      z,
      (Math.random() - 0.5) * 0.7,
      0.4,
      (Math.random() - 0.5) * 0.7,
      3,
    );
  }

  public spawnMaterialImpact(
    material: BlockMaterialType | 'pig' | 'ground' | undefined,
    x: number,
    y: number,
    z: number,
    destroyed: boolean,
    impactDir?: Vec3,
  ): void {
    const dx = impactDir?.x ?? 0;
    const dy = impactDir?.y ?? 0.3;
    const dz = impactDir?.z ?? 0;

    if (material === 'glass') {
      this.debris.spawnImpactChips('glass', x, y, z, dx, dy, dz, destroyed ? 10 : 5);
      for (let i = 0; i < 4; i++) {
        this.sparks.spawn({
          x: x + (Math.random() - 0.5) * 0.35,
          y: Math.max(0.16, y + (Math.random() - 0.5) * 0.35),
          z: z + (Math.random() - 0.5) * 0.35,
          vx: -dx * 2 + (Math.random() - 0.5) * 5,
          vy: 1.5 + Math.random() * 4,
          vz: -dz * 2 + (Math.random() - 0.5) * 5,
          startScale: 0.2,
          endScale: 0.06,
          life: 0.42 + Math.random() * 0.25,
          gravity: -10,
          drag: 0.95,
          mode: 'glint',
          hexColor: 0xeaffff,
        });
      }
      return;
    }

    if (material === 'wood') {
      this.debris.spawnImpactChips('wood', x, y, z, dx, dy, dz, destroyed ? 9 : 4);
      for (let i = 0; i < 3; i++) {
        this.smokePlumes.spawn({
          x: x + (Math.random() - 0.5) * 0.4,
          y: Math.max(0.18, y),
          z: z + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 2.8,
          vy: 0.5 + Math.random() * 1.4,
          vz: (Math.random() - 0.5) * 2.8,
          startScale: 0.5,
          endScale: 1.65,
          life: 0.75 + Math.random() * 0.4,
          gravity: -0.2,
          drag: 0.92,
          turbulence: 1.2,
          mode: 'smoke',
          hexColor: 0xcfb186,
          maxAlpha: 0.48,
        });
      }
      return;
    }

    if (material === 'metal') {
      this.debris.spawnImpactChips('metal', x, y, z, dx, dy, dz, destroyed ? 10 : 4);
      const sparkCount = destroyed ? 14 : 8;
      for (let i = 0; i < sparkCount; i++) {
        this.sparks.spawn({
          x: x + (Math.random() - 0.5) * 0.35,
          y: Math.max(0.16, y + (Math.random() - 0.5) * 0.35),
          z: z + (Math.random() - 0.5) * 0.35,
          vx: -dx * 3.5 + (Math.random() - 0.5) * 7.5,
          vy: 2.2 + Math.random() * 5.2,
          vz: -dz * 3.5 + (Math.random() - 0.5) * 7.5,
          startScale: 0.24,
          endScale: 0.05,
          life: 0.38 + Math.random() * 0.28,
          gravity: -14,
          drag: 0.94,
          mode: 'spark',
          hexColor: i % 2 === 0 ? 0xffbb44 : 0xffe49c,
        });
      }
      if (destroyed) {
        for (let i = 0; i < 6; i++) {
          this.smokePlumes.spawn({
            x: x + (Math.random() - 0.5) * 0.45,
            y: Math.max(0.18, y),
            z: z + (Math.random() - 0.5) * 0.45,
            vx: (Math.random() - 0.5) * 3.2,
            vy: 0.7 + Math.random() * 1.8,
            vz: (Math.random() - 0.5) * 3.2,
            startScale: 0.65,
            endScale: 2.1,
            life: 1.0 + Math.random() * 0.6,
            gravity: -0.2,
            drag: 0.91,
            turbulence: 1.4,
            mode: 'smoke',
            hexColor: 0x3b4048,
            maxAlpha: 0.62,
          });
        }
      }
      return;
    }

    if (material === 'stone' || material === 'ground') {
      this.debris.spawnImpactChips('stone', x, y, z, dx, dy, dz, destroyed ? 8 : 4);
      const dustCount = destroyed ? 9 : 4;
      for (let i = 0; i < dustCount; i++) {
        this.smokePlumes.spawn({
          x: x + (Math.random() - 0.5) * 0.55,
          y: Math.max(0.15, y + Math.random() * 0.3),
          z: z + (Math.random() - 0.5) * 0.55,
          vx: (Math.random() - 0.5) * 3.8,
          vy: 0.65 + Math.random() * 2.1,
          vz: (Math.random() - 0.5) * 3.8,
          startScale: 0.75,
          endScale: material === 'ground' ? 2.5 : 2.3,
          life: 1.3 + Math.random() * 0.9,
          gravity: -0.25,
          drag: 0.91,
          turbulence: 1.5,
          mode: 'smoke',
          hexColor: material === 'ground' ? 0x9b8667 : 0xa3abb5,
          maxAlpha: 0.6,
        });
      }
      return;
    }

    if (material === 'pig') {
      for (let i = 0; i < 12; i++) {
        this.smokePlumes.spawn({
          x: x + (Math.random() - 0.5) * 0.4,
          y: y + (Math.random() - 0.5) * 0.4,
          z: z + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 4.5,
          vy: 1.0 + Math.random() * 2.8,
          vz: (Math.random() - 0.5) * 4.5,
          startScale: 0.8,
          endScale: 2.8,
          life: 0.65 + Math.random() * 0.25,
          gravity: 1.2,
          drag: 0.91,
          turbulence: 1.8,
          mode: 'smoke',
          hexColor: i % 3 === 0 ? 0xbef598 : 0xf4f9ef,
          maxAlpha: 0.72,
        });
      }
    }
  }

  public spawnFeathers(birdType: BirdType, x: number, y: number, z: number, count = 10): void {
    this.debris.spawnFeathers(birdType, x, y, z, count);
  }

  public spawnExplosion(x: number, y: number, z: number, big = true, cameraDist = 20): void {
    // Register multi-phase hydrodynamic explosion orchestrator
    let expIdx = this.explosions.findIndex((e) => !e.active);
    if (expIdx < 0) {
      expIdx = this.explosions.length;
      this.explosions.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        big: true,
        age: 0,
        maxAge: 5.5,
        maxShockRadius: 12,
        shockDuration: 0.45,
        lastDustWaveRadius: 0,
        nextWispTime: 0.5,
        ringY: 1.8,
        vortexStrength: 7,
        acousticPending: false,
        acousticDelay: 0,
        stemSpawned: false,
        capSpawned: false,
      });
    }
    const exp = this.explosions[expIdx];
    exp.active = true;
    exp.x = x;
    exp.y = Math.max(0.25, y);
    exp.z = z;
    exp.big = big;
    exp.age = 0;
    exp.maxAge = big ? 5.8 : 2.2;
    exp.maxShockRadius = big ? 13.8 : 5.5;
    exp.shockDuration = big ? 0.46 : 0.26;
    exp.lastDustWaveRadius = 0.85;
    exp.nextWispTime = 0.65;
    exp.ringY = Math.max(1.2, y + 1.4);
    exp.vortexStrength = big ? 8.2 : 3.2;
    exp.acousticPending = big;
    exp.acousticDelay = computeAcousticTransitDelay(cameraDist);
    exp.stemSpawned = false;
    exp.capSpawned = false;

    // Phase 1: Millisecond Ionized Plasma Flash + Stochastic Shadow-Casting PointLight
    this.flashBillboard.position.set(x, Math.max(0.35, y), z);
    this.flashBillboardScale = big ? 9.8 : 4.2;
    this.flashBillboard.scale.setScalar(this.flashBillboardScale);
    this.flashBillboardMax = big ? 0.095 : 0.065;
    this.flashBillboardTimer = this.flashBillboardMax;
    this.flashBillboard.visible = true;
    const flashMat = this.flashBillboard.material as THREE.ShaderMaterial;
    flashMat.uniforms.uColor.value.setHex(big ? 0xf2f8ff : 0xffaa7a);
    flashMat.uniforms.uOpacity.value = 1.0;

    this.flashBasePos.set(x, Math.max(0.8, y + 0.65), z);
    this.flashLight.position.copy(this.flashBasePos);
    this.flashLight.color.setHex(big ? 0xffb854 : 0xff7348);
    this.flashPeakIntensity = big ? 68 : 24;
    this.flashLight.intensity = this.flashPeakIntensity;
    this.flashMaxTimer = big ? 0.96 : 0.34;
    this.flashTimer = this.flashMaxTimer;

    this.smokePlumes.uniforms.uBlastPos.value.set(x, Math.max(0.6, y + 0.55), z);
    this.smokePlumes.uniforms.uBlastGlow.value = big ? 1.75 : 0.65;

    // Phase 2: Multi-Lobe 3D Volumetric Raymarched Pyroclastic Fireball Cluster
    this.pyroVolumes.spawn(x, y, z, big, 1.15, 0, 0, 0, {
      maxAge: big ? 1.24 : 0.52,
      riseSpeed: big ? 3.4 : 1.7,
    });
    if (big) {
      // 6 erupting radial cauliflower fireball lobes tearing outward asymmetrically
      for (let l = 0; l < 6; l++) {
        const ang = (l / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
        const speed = 2.8 + Math.random() * 2.8;
        const scaleM = 0.68 + Math.random() * 0.28;
        this.pyroVolumes.spawn(
          x + Math.cos(ang) * 0.72,
          y + 0.14 + (l % 3) * 0.48,
          z + Math.sin(ang) * 0.72,
          true,
          scaleM,
          0.015 + l * 0.012,
          Math.cos(ang) * speed,
          Math.sin(ang) * speed,
          { maxAge: 1.05 + Math.random() * 0.28, riseSpeed: 2.8 + (l % 2) * 1.4 },
        );
      }

      // Ground Mach-Stem Volumetric Shock Ring sweeping across the terrain + Tilted Upper Blast Ring
      const groundY = groundHeightAt(x, z) + 0.16;
      this._quat.setFromUnitVectors(this._zAxis, this._upAxis);
      this.shockRings.spawn({
        x,
        y: groundY,
        z,
        quaternion: this._quat,
        startRadius: 0.75,
        maxRadius: 11.8,
        duration: 0.44,
        coreColor: 0xfff5db,
        edgeColor: 0xff6e18,
        opacityPeak: 0.95,
      });

      this._vec.set((Math.random() - 0.5) * 0.35, 1, (Math.random() - 0.5) * 0.35).normalize();
      this._quatB.setFromUnitVectors(this._zAxis, this._vec);
      this.shockRings.spawn({
        x,
        y: Math.max(0.75, y + 0.4),
        z,
        quaternion: this._quatB,
        startRadius: 0.55,
        maxRadius: 8.6,
        duration: 0.34,
        delay: 0.03,
        spinSpeed: 2.4,
        coreColor: 0xffe4b5,
        edgeColor: 0xff3b0a,
        opacityPeak: 0.78,
      });
    }

    // Ephemeral Wilson Condensation Vapor Dome (supersonic pressure drop condensation cloud)
    this.wilsonShell.position.set(x, Math.max(0.25, y), z);
    this.wilsonShell.scale.setScalar(0.65);
    this.wilsonShell.visible = true;
    this.wilsonMaxTimer = big ? 0.095 : 0.055;
    this.wilsonTimer = this.wilsonMaxTimer;
    this.wilsonMaxScale = big ? 4.8 : 2.1;

    if (big) {
      this.screenWaveActive = true;
      this.screenWaveWorldPos.set(x, Math.max(0.35, y), z);
      this.screenWaveAge = 0;
      this.screenWaveDuration = 0.48;
      this.screenWaveMaxRadius = 15.5;
      this.exposureDipTimer = 0.38;
      this.debris.applyBlastImpulse(x, y, z, 11.5, 18.0);
    }

    // Secondary glowing flame tongues with dark soot borders breaking around core
    const fireCount = big ? 18 : 8;
    for (let i = 0; i < fireCount; i++) {
      const sp = big ? 4.6 + Math.random() * 8.8 : 2.0 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.15) * Math.PI;
      const cosP = Math.cos(phi);
      this.firePlumes.spawn({
        x: x + (Math.random() - 0.5) * 1.2,
        y: Math.max(0.3, y + (Math.random() - 0.25) * 0.95),
        z: z + (Math.random() - 0.5) * 1.2,
        vx: Math.cos(theta) * cosP * sp,
        vy: Math.max(1.8, Math.sin(phi) * sp + (big ? 4.4 : 1.5)),
        vz: Math.sin(theta) * cosP * sp,
        startScale: big ? 0.95 + Math.random() * 0.65 : 0.5 + Math.random() * 0.3,
        endScale: big ? 2.75 + Math.random() * 1.35 : 1.35 + Math.random() * 0.6,
        life: big ? 0.48 + Math.random() * 0.32 : 0.24 + Math.random() * 0.14,
        gravity: 4.5,
        drag: 0.9,
        turbulence: 3.8,
        mode: 'fire',
        maxAlpha: 0.9,
      });
    }

    // Toroidal Vortex Convection Smoke Column (advected by toroidal + curl noise field!)
    const smokeCount = big ? 34 : 12;
    for (let i = 0; i < smokeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const sp = big ? 1.5 + Math.random() * 5.2 : 1.0 + Math.random() * 3.0;
      this.smokePlumes.spawn({
        x: x + (Math.random() - 0.5) * (big ? 1.6 : 0.6),
        y: Math.max(0.35, y + Math.random() * 1.2),
        z: z + (Math.random() - 0.5) * (big ? 1.6 : 0.6),
        vx: Math.cos(theta) * sp,
        vy: 2.2 + Math.random() * (big ? 4.8 : 2.2),
        vz: Math.sin(theta) * sp,
        startScale: big ? 1.3 + Math.random() * 0.8 : 0.75 + Math.random() * 0.4,
        endScale: big ? 6.2 + Math.random() * 2.8 : 2.8 + Math.random() * 1.2,
        life: big ? 3.8 + Math.random() * 1.9 : 1.3 + Math.random() * 0.6,
        gravity: 0.38,
        drag: 0.93,
        mode: 'smoke',
        hexColor: i % 3 === 0 ? 0x16181c : 0x2c3037,
        maxAlpha: 0.86,
        vortexId: expIdx,
      });
    }

    // Hot Ballistic Shrapnel Leaving Continuous Smoke Ribbon Trails
    if (big) {
      const ribbonCount = 16;
      for (let i = 0; i < ribbonCount; i++) {
        const theta = (i / ribbonCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const elev = 0.22 + Math.random() * 0.82;
        const sp = 15 + Math.random() * 18;
        const cosE = Math.cos(elev);
        this.ribbons.spawn(
          x + (Math.random() - 0.5) * 0.55,
          Math.max(0.35, y + 0.22),
          z + (Math.random() - 0.5) * 0.55,
          Math.cos(theta) * cosE * sp,
          Math.sin(elev) * sp,
          Math.sin(theta) * cosE * sp,
          0.95 + Math.random() * 0.6,
        );
      }
    }

    // Incandescent Ballistic Sparks
    const sparkCount = big ? 72 : 20;
    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const elev = -0.15 + Math.random() * 1.35;
      const sp = big ? 16 + Math.random() * 28 : 8 + Math.random() * 14;
      const cosE = Math.cos(elev);
      this.sparks.spawn({
        x: x + (Math.random() - 0.5) * 0.55,
        y: Math.max(0.22, y + (Math.random() - 0.5) * 0.55),
        z: z + (Math.random() - 0.5) * 0.55,
        vx: Math.cos(theta) * cosE * sp,
        vy: Math.max(2.4, Math.sin(elev) * sp),
        vz: Math.sin(theta) * cosE * sp,
        startScale: big ? 0.24 : 0.15,
        endScale: 0.07,
        life: big ? 0.65 + Math.random() * 0.72 : 0.3 + Math.random() * 0.3,
        gravity: -18.5,
        drag: 0.968,
        mode: 'spark',
        hexColor: i % 3 === 0 ? 0xfff5d6 : 0xff9d3b,
      });
    }

    // Scorched Rock & Earth Chunks + Active Glowing Scorch Crater Decal
    this.debris.spawnBlastRubble(x, y, z, big ? 22 : 6);
    if (big && y < 6.0) {
      this.spawnScorchCrater(x, z, Math.max(3.6, 7.6 - y * 0.5));
    }
  }

  private spawnScorchCrater(x: number, z: number, radius: number): void {
    if (this.scorchCraters.length >= 24) {
      const oldest = this.scorchCraters.shift()!;
      this.vfxGroup.remove(oldest.mesh);
      (oldest.mesh.material as THREE.Material).dispose();
    }

    const mat = this.scorchBaseMat.clone();
    mat.customProgramCacheKey = this.scorchBaseMat.customProgramCacheKey;
    mat.uniforms.uSeed.value = Math.random() * 50;

    const mesh = new THREE.Mesh(this.scorchGeo, mat);
    const craterLayerOffset = (this.scorchCraters.length % 8) * 0.0012;
    mesh.position.set(x, groundHeightAt(x, z) + 0.02 + craterLayerOffset, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 1;
    this.vfxGroup.add(mesh);
    this.scorchCraters.push({ mesh, age: 0 });
  }

  /**
   * Red Bird's Bespoke "Onda de Choque" (Multi-Pulse Crimson Acoustic-Kinetic Shockwave):
   * 3 staggered 3D harmonic displaced pressure domes + 2 tilted counter-spinning gyroscopic
   * rings + ground radial dust blast skirt + screen-space refraction + crimson spark corona.
   */
  public spawnRedShockwave(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ): void {
    this.redRoarTimer = 0.42;

    // 1. 3 Staggered 3D Volumetric Displaced Harmonic Shock Spheres (0ms, 55ms, 115ms)
    this.kineticSpheres.spawnPulse(x, y, z, 0.0, 0.38, 6.6, 0);
    this.kineticSpheres.spawnPulse(x, y, z, 0.055, 0.44, 7.8, 1);
    this.kineticSpheres.spawnPulse(x, y, z, 0.115, 0.48, 8.9, 2);

    // 2. 2 Tilted Counter-Spinning Gyroscopic Pressure Rings + 1 Ground Compression Ring
    const speed = Math.hypot(vx, vy, vz);
    if (speed > 0.5) {
      this._vec.set(vx / speed, vy / speed, vz / speed);
    } else {
      this._vec.set(1, 0, 0);
    }
    this._quat.setFromUnitVectors(this._zAxis, this._vec);
    this._vecB.set(0.35, 0.9, 0.25).normalize();
    this._quatB.setFromAxisAngle(this._vecB, 0.52).multiply(this._quat);

    this.shockRings.spawn({
      x,
      y,
      z,
      quaternion: this._quatB,
      startRadius: 0.55,
      maxRadius: 7.4,
      duration: 0.40,
      spinSpeed: 6.2,
      coreColor: 0xfff0d4,
      edgeColor: 0xff2211,
      opacityPeak: 0.96,
    });

    this._vecB.set(-0.4, 0.85, -0.35).normalize();
    this._quatB.setFromAxisAngle(this._vecB, -0.64).multiply(this._quat);
    this.shockRings.spawn({
      x,
      y,
      z,
      quaternion: this._quatB,
      startRadius: 0.48,
      maxRadius: 8.2,
      duration: 0.46,
      delay: 0.045,
      spinSpeed: -5.8,
      coreColor: 0xffd27a,
      edgeColor: 0xd90b1c,
      opacityPeak: 0.90,
    });

    // Ground acoustic compression ring + dust blast skirt if within 7m of terrain
    const groundY = groundHeightAt(x, z);
    const heightAboveGround = y - groundY;
    if (heightAboveGround < 7.5) {
      this._quatB.setFromUnitVectors(this._zAxis, this._upAxis);
      this.shockRings.spawn({
        x,
        y: groundY + 0.14,
        z,
        quaternion: this._quatB,
        startRadius: 0.65,
        maxRadius: 8.4,
        duration: 0.42,
        coreColor: 0xffe3b8,
        edgeColor: 0xff3b14,
        opacityPeak: 0.85,
      });

      const dustPuffs = 16;
      for (let i = 0; i < dustPuffs; i++) {
        const ang = (i / dustPuffs) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const r = 0.8 + Math.random() * 1.4;
        const px = x + Math.cos(ang) * r;
        const pz = z + Math.sin(ang) * r;
        const py = groundHeightAt(px, pz) + 0.24;
        const spd = 6.5 + Math.random() * 5.5;
        this.smokePlumes.spawn({
          x: px,
          y: py,
          z: pz,
          vx: Math.cos(ang) * spd,
          vy: 0.65 + Math.random() * 1.35,
          vz: Math.sin(ang) * spd,
          startScale: 0.72,
          endScale: 2.8 + Math.random() * 1.1,
          life: 0.95 + Math.random() * 0.55,
          gravity: -0.2,
          drag: 0.90,
          turbulence: 1.8,
          mode: 'smoke',
          hexColor: i % 3 === 0 ? 0xd98a6c : 0xa38e76,
          maxAlpha: 0.58,
        });
      }
    }

    // 3. Crimson-Gold Anamorphic Core Flash + Ruby PointLight + Screen-Space Refraction Wave
    this.flashBillboard.position.set(x, Math.max(0.3, y), z);
    this.flashBillboardScale = 6.8;
    this.flashBillboard.scale.setScalar(this.flashBillboardScale);
    this.flashBillboardMax = 0.08;
    this.flashBillboardTimer = 0.08;
    this.flashBillboard.visible = true;
    const flashMat = this.flashBillboard.material as THREE.ShaderMaterial;
    flashMat.uniforms.uColor.value.setHex(0xffb88c);
    flashMat.uniforms.uOpacity.value = 1.0;

    this.flashBasePos.set(x, Math.max(0.5, y), z);
    this.flashLight.position.copy(this.flashBasePos);
    this.flashLight.color.setHex(0xff3818);
    this.flashPeakIntensity = 42;
    this.flashLight.intensity = 42;
    this.flashMaxTimer = 0.44;
    this.flashTimer = 0.44;

    this.screenWaveActive = true;
    this.screenWaveWorldPos.set(x, Math.max(0.3, y), z);
    this.screenWaveAge = 0;
    this.screenWaveDuration = 0.38;
    this.screenWaveMaxRadius = 10.5;
    this.exposureDipTimer = 0.24;
    this.debris.applyBlastImpulse(x, y, z, 7.5, 11.5);

    // 4. Radial Corona of 52 Crimson-Gold Kinetic Sparks + 8 Short Energy Ribbons + 18 Crimson Feathers
    for (let i = 0; i < 52; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.85;
      const cosP = Math.cos(phi);
      const sp = 14 + Math.random() * 20;
      this.sparks.spawn({
        x: x + (Math.random() - 0.5) * 0.35,
        y: Math.max(0.2, y + (Math.random() - 0.5) * 0.35),
        z: z + (Math.random() - 0.5) * 0.35,
        vx: Math.cos(theta) * cosP * sp,
        vy: Math.sin(phi) * sp + 1.8,
        vz: Math.sin(theta) * cosP * sp,
        startScale: 0.22,
        endScale: 0.06,
        life: 0.36 + Math.random() * 0.32,
        gravity: -12.5,
        drag: 0.95,
        mode: 'spark',
        hexColor: i % 2 === 0 ? 0xff3b1f : 0xffd269,
      });
    }

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const elev = (Math.random() - 0.2) * 0.7;
      const sp = 13 + Math.random() * 9;
      this.ribbons.spawn(
        x,
        Math.max(0.3, y),
        z,
        Math.cos(ang) * Math.cos(elev) * sp,
        Math.sin(elev) * sp + 2.0,
        Math.sin(ang) * Math.cos(elev) * sp,
        0.48 + Math.random() * 0.25,
      );
    }

    this.debris.spawnFeathers('red', x, y, z, 18);
  }

  /**
   * Yellow Bird's Bespoke "Impulso Supersónico" (Prandtl-Glauert Mach Vapor Cone + Twin Sonic Boom Rings):
   * Attaches a live 3D aerodynamic Mach vapor cone to the speeding bird, detonates twin perpendicular
   * sonic-boom shock rings at the barrier breach point, and streams a golden plasma contrail + wingtip vortices.
   */
  public spawnSupersonicBoost(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): void {
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    const nz = dirZ / len;

    // 1. Trigger live Prandtl-Glauert 3D Mach Vapor Cone tracking the bird in flight
    this.machCone.trigger(x, y, z, dirX, dirY, dirZ);
    this.supersonicSlipstreamTimer = 0.75;
    this.supersonicEmitAccum = 0;

    // 2. Twin Perpendicular Sonic Boom Shock Rings oriented along the flight vector
    this._vec.set(nx, ny, nz);
    this._quat.setFromUnitVectors(this._zAxis, this._vec);

    this.shockRings.spawn({
      x,
      y,
      z,
      quaternion: this._quat,
      startRadius: 0.42,
      maxRadius: 6.2,
      duration: 0.36,
      spinSpeed: 8.5,
      coreColor: 0xffffff,
      edgeColor: 0xffcf33,
      opacityPeak: 0.96,
    });

    this.shockRings.spawn({
      x: x - nx * 0.85,
      y: y - ny * 0.85,
      z: z - nz * 0.85,
      quaternion: this._quat,
      startRadius: 0.32,
      maxRadius: 4.6,
      duration: 0.32,
      delay: 0.038,
      spinSpeed: -9.5,
      coreColor: 0xfff5c0,
      edgeColor: 0xff8811,
      opacityPeak: 0.90,
    });

    // 3. Blinding Sonic Ignition Flash + Screen-Space Refractive Boom Wave
    this.flashBillboard.position.set(x, Math.max(0.25, y), z);
    this.flashBillboardScale = 6.2;
    this.flashBillboard.scale.setScalar(this.flashBillboardScale);
    this.flashBillboardMax = 0.075;
    this.flashBillboardTimer = 0.075;
    this.flashBillboard.visible = true;
    const flashMat = this.flashBillboard.material as THREE.ShaderMaterial;
    flashMat.uniforms.uColor.value.setHex(0xfff6cc);
    flashMat.uniforms.uOpacity.value = 1.0;

    this.screenWaveActive = true;
    this.screenWaveWorldPos.set(x, Math.max(0.25, y), z);
    this.screenWaveAge = 0;
    this.screenWaveDuration = 0.30;
    this.screenWaveMaxRadius = 8.5;

    // 4. Concentrated Supersonic Afterburner Jet Plume + 40 Velocity-Stretched Golden Sparks
    for (let i = 0; i < 20; i++) {
      const axialSpd = 10 + Math.random() * 14;
      this.firePlumes.spawn({
        x: x - nx * (0.25 + i * 0.08) + (Math.random() - 0.5) * 0.24,
        y: y - ny * (0.25 + i * 0.08) + (Math.random() - 0.5) * 0.24,
        z: z - nz * (0.25 + i * 0.08) + (Math.random() - 0.5) * 0.24,
        vx: -nx * axialSpd + (Math.random() - 0.5) * 2.6,
        vy: -ny * axialSpd + (Math.random() - 0.5) * 2.6,
        vz: -nz * axialSpd + (Math.random() - 0.5) * 2.6,
        startScale: 0.52 + Math.random() * 0.32,
        endScale: 1.75 + Math.random() * 0.85,
        life: 0.26 + Math.random() * 0.16,
        gravity: 0.4,
        drag: 0.89,
        turbulence: 2.2,
        mode: 'fire',
      });
    }

    for (let i = 0; i < 40; i++) {
      const sp = 16 + Math.random() * 22;
      this.sparks.spawn({
        x: x - nx * 0.2 + (Math.random() - 0.5) * 0.22,
        y: y - ny * 0.2 + (Math.random() - 0.5) * 0.22,
        z: z - nz * 0.2 + (Math.random() - 0.5) * 0.22,
        vx: -nx * sp + (Math.random() - 0.5) * 6.5,
        vy: -ny * sp + (Math.random() - 0.5) * 6.5,
        vz: -nz * sp + (Math.random() - 0.5) * 6.5,
        startScale: 0.22,
        endScale: 0.06,
        life: 0.34 + Math.random() * 0.26,
        gravity: -8,
        drag: 0.95,
        mode: 'spark',
        hexColor: i % 2 === 0 ? 0xffffff : 0xffd23f,
      });
    }

    this.debris.spawnFeathers('yellow', x, y, z, 16);

    this.wilsonShell.position.set(x, Math.max(0.2, y), z);
    this.wilsonShell.scale.setScalar(0.6);
    this.wilsonShell.visible = true;
    this.wilsonMaxTimer = 0.11;
    this.wilsonTimer = 0.11;
    this.wilsonMaxScale = 4.5;

    this.flashBasePos.set(x, y, z);
    this.flashLight.position.copy(this.flashBasePos);
    this.flashLight.color.setHex(0xffe055);
    this.flashPeakIntensity = 38;
    this.flashLight.intensity = 38;
    this.flashMaxTimer = 0.38;
    this.flashTimer = 0.38;
  }

  public update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    obstacles: ActiveBlockObstacle[] = [],
  ): void {
    if (this.redRoarTimer > 0) {
      this.redRoarTimer = Math.max(0, this.redRoarTimer - dt);
    }

    // Update Yellow Bird live Mach cone & continuous supersonic plasma slipstream contrail
    const coneActive = this.machCone.update(
      dt,
      elapsed,
      this.trackedBirdType === 'yellow' ? this.trackedBirdPos : null,
      this.trackedBirdType === 'yellow' ? this.trackedBirdVel : null,
    );

    if (this.supersonicSlipstreamTimer > 0) {
      this.supersonicSlipstreamTimer = Math.max(0, this.supersonicSlipstreamTimer - dt);
      if (
        coneActive &&
        this.trackedBirdType === 'yellow' &&
        this.trackedBirdPos &&
        this.trackedBirdVel
      ) {
        const bx = this.trackedBirdPos.x;
        const by = this.trackedBirdPos.y;
        const bz = this.trackedBirdPos.z;
        const vx = this.trackedBirdVel.x;
        const vy = this.trackedBirdVel.y;
        const vz = this.trackedBirdVel.z;
        const speed = Math.hypot(vx, vy, vz);
        this.flashBasePos.set(bx, by, bz);

        if (speed > 12) {
          this.supersonicEmitAccum += dt;
          while (this.supersonicEmitAccum >= 0.016) {
            this.supersonicEmitAccum -= 0.016;
            const nx = vx / speed;
            const ny = vy / speed;
            const nz = vz / speed;

            // Central golden afterburner plasma core puff
            this.firePlumes.spawn({
              x: bx - nx * 0.38 + (Math.random() - 0.5) * 0.12,
              y: by - ny * 0.38 + (Math.random() - 0.5) * 0.12,
              z: bz - nz * 0.38 + (Math.random() - 0.5) * 0.12,
              vx: -nx * 3.5 + (Math.random() - 0.5) * 1.2,
              vy: -ny * 3.5 + (Math.random() - 0.5) * 1.2,
              vz: -nz * 3.5 + (Math.random() - 0.5) * 1.2,
              startScale: 0.42,
              endScale: 1.25,
              life: 0.20,
              gravity: 0.2,
              drag: 0.90,
              mode: 'fire',
              maxAlpha: 0.85,
            });

            // Twin wingtip aerodynamic condensation vapor trails
            this._vec.set(nx, ny, nz);
            this._vecB.crossVectors(this._vec, this._upAxis);
            if (this._vecB.lengthSq() < 0.001) this._vecB.set(0, 0, 1);
            else this._vecB.normalize();
            const wingSpan = 0.42;
            for (const side of [-1, 1]) {
              this.smokePlumes.spawn({
                x: bx - nx * 0.28 + this._vecB.x * side * wingSpan,
                y: Math.max(0.18, by - ny * 0.28 + this._vecB.y * side * wingSpan),
                z: bz - nz * 0.28 + this._vecB.z * side * wingSpan,
                vx: this._vecB.x * side * 1.1 + (Math.random() - 0.5) * 0.6,
                vy: 0.25 + (Math.random() - 0.5) * 0.5,
                vz: this._vecB.z * side * 1.1 + (Math.random() - 0.5) * 0.6,
                startScale: 0.28,
                endScale: 1.15,
                life: 0.36,
                gravity: 0.1,
                drag: 0.92,
                mode: 'smoke',
                hexColor: 0xf4f8ff,
                maxAlpha: 0.46,
              });
            }

            // High-speed golden slipstream sparks
            for (let s = 0; s < 2; s++) {
              this.sparks.spawn({
                x: bx - nx * 0.3 + (Math.random() - 0.5) * 0.25,
                y: Math.max(0.16, by - ny * 0.3 + (Math.random() - 0.5) * 0.25),
                z: bz - nz * 0.3 + (Math.random() - 0.5) * 0.25,
                vx: -nx * (6 + Math.random() * 8) + (Math.random() - 0.5) * 3.2,
                vy: -ny * (6 + Math.random() * 8) + (Math.random() - 0.5) * 3.2,
                vz: -nz * (6 + Math.random() * 8) + (Math.random() - 0.5) * 3.2,
                startScale: 0.17,
                endScale: 0.05,
                life: 0.24 + Math.random() * 0.14,
                gravity: -6,
                drag: 0.95,
                mode: 'spark',
                hexColor: s === 0 ? 0xffffff : 0xffd23f,
              });
            }
          }
        }
      }
    }

    // Update multi-phase hydrodynamic explosion timelines
    for (let i = 0; i < this.explosions.length; i++) {
      const exp = this.explosions[i];
      if (!exp.active) continue;
      exp.age += dt;
      const plumeProfile = computeMushroomPlumeProfile(exp.age, exp.maxAge * 0.45);
      exp.ringY = Math.max(1.2, exp.y + plumeProfile.capElevation * 0.55);

      if (exp.acousticPending && exp.age >= exp.acousticDelay) {
        exp.acousticPending = false;
        this.delayedCameraPulse = Math.max(this.delayedCameraPulse, 0.42);
      }

      // Stage 3A (t = 0.11s): Spawn Rising Pyroclastic Mushroom Stem Column
      if (exp.big && !exp.stemSpawned && exp.age >= 0.11) {
        exp.stemSpawned = true;
        this.pyroVolumes.spawn(exp.x, exp.y + 0.35, exp.z, true, 0.88, 0, 0, 0, {
          maxAge: 1.45,
          riseSpeed: 4.8,
          aspectY: 1.42,
          startScaleMult: 0.78,
        });
      }

      // Stage 3B (t = 0.22s): Spawn Billowing Toroidal Mushroom Cap Lobes at apex
      if (exp.big && !exp.capSpawned && exp.age >= 0.22) {
        exp.capSpawned = true;
        for (let c = 0; c < 3; c++) {
          const ang = (c / 3) * Math.PI * 2 + Math.random() * 0.5;
          this.pyroVolumes.spawn(
            exp.x + Math.cos(ang) * 0.55,
            exp.y + 1.45,
            exp.z + Math.sin(ang) * 0.55,
            true,
            1.08,
            0,
            Math.cos(ang) * 1.45,
            Math.sin(ang) * 1.45,
            {
              maxAge: 1.65,
              riseSpeed: 5.4,
              aspectY: 0.78,
              startScaleMult: 0.85,
            },
          );
        }
      }

      // Sequential Ground Blast Dust Wave (Mach Stem Skirt sweeping terrain radially!)
      if (exp.age <= exp.shockDuration && exp.y < 6.0) {
        const curRadius = computeShockwaveRadius(exp.age, exp.maxShockRadius, exp.shockDuration);
        while (exp.lastDustWaveRadius + 1.45 <= curRadius && exp.lastDustWaveRadius < exp.maxShockRadius) {
          exp.lastDustWaveRadius += 1.45;
          const ringR = exp.lastDustWaveRadius;
          const puffCount = exp.big ? 10 : 4;
          const baseAng = Math.random() * Math.PI * 2;
          for (let k = 0; k < puffCount; k++) {
            const ang = baseAng + (k / puffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
            const px = exp.x + Math.cos(ang) * ringR;
            const pz = exp.z + Math.sin(ang) * ringR;
            const py = groundHeightAt(px, pz) + 0.28;
            const outSpd = (exp.big ? 5.4 : 2.6) * (1 - (ringR / exp.maxShockRadius) * 0.55);
            this.smokePlumes.spawn({
              x: px,
              y: py,
              z: pz,
              vx: Math.cos(ang) * outSpd,
              vy: 0.75 + Math.random() * 1.15,
              vz: Math.sin(ang) * outSpd,
              startScale: 0.9 + ringR * 0.08,
              endScale: 3.3 + ringR * 0.16,
              life: 1.6 + Math.random() * 0.9,
              gravity: -0.15,
              drag: 0.91,
              turbulence: 1.5,
              mode: 'smoke',
              hexColor: k % 2 === 0 ? 0x8f7d64 : 0x766956,
              maxAlpha: 0.58 * (1 - (ringR / exp.maxShockRadius) * 0.45),
            });
          }
        }
      }

      // Slow post-detonation crater heat smoke wisps
      if (exp.big && exp.age >= exp.nextWispTime && exp.age < exp.maxAge - 0.8) {
        exp.nextWispTime += 0.24;
        this.smokePlumes.spawn({
          x: exp.x + (Math.random() - 0.5) * 1.6,
          y: groundHeightAt(exp.x, exp.z) + 0.25,
          z: exp.z + (Math.random() - 0.5) * 1.6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.4 + Math.random() * 1.1,
          vz: (Math.random() - 0.5) * 0.6,
          startScale: 0.7,
          endScale: 2.8,
          life: 2.4 + Math.random() * 1.0,
          gravity: 0.45,
          drag: 0.95,
          turbulence: 1.1,
          mode: 'smoke',
          hexColor: 0x3b3d42,
          maxAlpha: 0.42,
        });
      }

      if (exp.age >= exp.maxAge) {
        exp.active = false;
      }
    }

    this.debris.update(dt, elapsed, obstacles);
    this.pyroVolumes.update(dt, camera);
    this.ribbons.update(dt, camera);
    this.shockRings.update(dt);
    this.kineticSpheres.update(dt);
    this.smokePlumes.update(dt, elapsed, camera.quaternion, obstacles, this.explosions);
    this.firePlumes.update(dt, elapsed, camera.quaternion, obstacles, this.explosions);
    this.sparks.update(dt, elapsed, camera.quaternion, obstacles, this.explosions);

    if (this.smokePlumes.uniforms.uBlastGlow.value > 0) {
      this.smokePlumes.uniforms.uBlastGlow.value = Math.max(
        0,
        this.smokePlumes.uniforms.uBlastGlow.value - dt * 2.25,
      );
    }

    if (this.flashBillboardTimer > 0) {
      this.flashBillboardTimer = Math.max(0, this.flashBillboardTimer - dt);
      const t = this.flashBillboardTimer / Math.max(0.001, this.flashBillboardMax);
      this.flashBillboard.quaternion.copy(camera.quaternion);
      this.flashBillboard.scale.setScalar(this.flashBillboardScale * (1.28 - t * 0.45));
      (this.flashBillboard.material as THREE.ShaderMaterial).uniforms.uOpacity.value = t * t;
      if (this.flashBillboardTimer <= 0) {
        this.flashBillboard.visible = false;
      }
    }

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      const age = this.flashMaxTimer - this.flashTimer;
      const flicker = computeStochasticFireIntensity(age, this.flashMaxTimer, elapsed);
      this.flashLight.intensity = this.flashPeakIntensity * flicker;
      this.flashLight.position.set(
        this.flashBasePos.x + Math.sin(elapsed * 47) * 0.24,
        this.flashBasePos.y + Math.cos(elapsed * 39) * 0.22,
        this.flashBasePos.z + Math.sin(elapsed * 53) * 0.24,
      );
      if (this.flashTimer <= 0) {
        this.flashLight.intensity = 0;
      }
    }

    if (this.wilsonTimer > 0) {
      this.wilsonTimer = Math.max(0, this.wilsonTimer - dt);
      const t = 1 - this.wilsonTimer / Math.max(0.001, this.wilsonMaxTimer);
      const sc = 0.6 + Math.pow(t, 0.55) * this.wilsonMaxScale;
      this.wilsonShell.scale.setScalar(sc);
      const u = (this.wilsonShell.material as THREE.ShaderMaterial).uniforms;
      u.uAge.value = t;
      u.uOpacity.value = Math.sin(t * Math.PI) * 0.22;
      if (this.wilsonTimer <= 0) {
        this.wilsonShell.visible = false;
      }
    }

    if (this.screenWaveActive) {
      this.screenWaveAge += dt;
      if (this.screenWaveAge >= this.screenWaveDuration) {
        this.screenWaveActive = false;
      }
    }

    if (this.exposureDipTimer > 0) {
      this.exposureDipTimer = Math.max(0, this.exposureDipTimer - dt);
    }

    if (this.scorchCraters.length > 0) {
      for (const c of this.scorchCraters) {
        c.age += dt;
        const u = (c.mesh.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = elapsed;
        u.uEmberHeat.value = Math.exp(-c.age * 0.36);
      }
    }
  }

  public reset(): void {
    this.explosions.length = 0;
    this.debris.reset();
    this.pyroVolumes.reset();
    this.ribbons.reset();
    this.shockRings.reset();
    this.machCone.reset();
    this.kineticSpheres.reset();
    this.smokePlumes.reset();
    this.firePlumes.reset();
    this.sparks.reset();

    this.trackedBirdPos = null;
    this.trackedBirdVel = null;
    this.trackedBirdType = null;
    this.supersonicSlipstreamTimer = 0;
    this.supersonicEmitAccum = 0;
    this.redRoarTimer = 0;

    this.flashBillboardTimer = 0;
    this.flashBillboard.visible = false;
    this.flashTimer = 0;
    this.flashLight.intensity = 0;
    this.wilsonTimer = 0;
    this.wilsonShell.visible = false;
    this.screenWaveActive = false;
    this.exposureDipTimer = 0;
    this.delayedCameraPulse = 0;
    this.smokePlumes.uniforms.uBlastGlow.value = 0;

    for (const c of this.scorchCraters) {
      this.vfxGroup.remove(c.mesh);
      (c.mesh.material as THREE.Material).dispose();
    }
    this.scorchCraters = [];
  }

  public dispose(): void {
    this.reset();
    this.debris.dispose();
    this.pyroVolumes.dispose();
    this.ribbons.dispose();
    this.shockRings.dispose();
    this.machCone.dispose();
    this.kineticSpheres.dispose();
    this.smokePlumes.dispose();
    this.firePlumes.dispose();
    this.sparks.dispose();

    this.scorchGeo.dispose();
    this.scorchBaseMat.dispose();
    this.flashBillboard.geometry.dispose();
    (this.flashBillboard.material as THREE.Material).dispose();
    this.wilsonShell.geometry.dispose();
    (this.wilsonShell.material as THREE.Material).dispose();
    this.scene.remove(this.vfxGroup);
  }
}

/**
 * Golden-hour environmental life: sunlit drifting dust motes, subtle rising embers,
 * and windborne feathers. Zero per-frame GC allocations.
 */
export class AmbientAtmosphere {
  private moteGeo: THREE.BufferGeometry;
  private moteMat: THREE.ShaderMaterial;
  private motePoints: THREE.Points;
  private moteBasePos: Float32Array;
  private moteCount = 120;

  private emberGeo: THREE.BufferGeometry;
  private emberMat: THREE.ShaderMaterial;
  private emberPoints: THREE.Points;
  private emberBasePos: Float32Array;
  private emberCount = 26;

  private featherMesh: THREE.InstancedMesh;
  private featherSeeds: Array<{ x: number; y: number; z: number; phase: number; speed: number }>;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.moteGeo = new THREE.BufferGeometry();
    const mPos = new Float32Array(this.moteCount * 3);
    const mPhase = new Float32Array(this.moteCount);
    this.moteBasePos = new Float32Array(this.moteCount * 3);

    for (let i = 0; i < this.moteCount; i++) {
      const bx = -22 + Math.random() * 44;
      const by = 0.6 + Math.random() * 8.5;
      const bz = -11 + Math.random() * 22;
      this.moteBasePos[i * 3] = bx;
      this.moteBasePos[i * 3 + 1] = by;
      this.moteBasePos[i * 3 + 2] = bz;
      mPos[i * 3] = bx;
      mPos[i * 3 + 1] = by;
      mPos[i * 3 + 2] = bz;
      mPhase[i] = Math.random() * Math.PI * 2;
    }
    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    this.moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(mPhase, 1));

    this.moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffe19c) },
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.35 + aPhase) * 0.9;
          p.y += sin(uTime * 0.55 + aPhase * 1.7) * 0.45;
          p.z += cos(uTime * 0.28 + aPhase * 1.3) * 0.75;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = max(1.0, -mv.z);
          gl_PointSize = clamp(24.0 / dist, 1.8, 5.2);
          vAlpha = 0.32 + 0.32 * sin(uTime * 1.1 + aPhase * 2.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float soft = pow(max(0.0001, 1.0 - d * 2.0), 1.75);
          gl_FragColor = vec4(uColor, soft * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motePoints = new THREE.Points(this.moteGeo, this.moteMat);
    this.motePoints.frustumCulled = false;
    scene.add(this.motePoints);

    this.emberGeo = new THREE.BufferGeometry();
    const ePos = new Float32Array(this.emberCount * 3);
    const ePhase = new Float32Array(this.emberCount);
    this.emberBasePos = new Float32Array(this.emberCount * 3);
    for (let i = 0; i < this.emberCount; i++) {
      const bx = -20 + Math.random() * 40;
      const by = Math.random() * 6.5;
      const bz = -7 + Math.random() * 14;
      this.emberBasePos[i * 3] = bx;
      this.emberBasePos[i * 3 + 1] = by;
      this.emberBasePos[i * 3 + 2] = bz;
      ePos[i * 3] = bx;
      ePos[i * 3 + 1] = by;
      ePos[i * 3 + 2] = bz;
      ePhase[i] = Math.random() * 10;
    }
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    this.emberGeo.setAttribute('aPhase', new THREE.BufferAttribute(ePhase, 1));

    this.emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        varying float vHeat;
        void main() {
          float life = fract(uTime * 0.14 + aPhase);
          vec3 p = position;
          p.y = 0.3 + life * 7.2;
          p.x += sin(uTime * 0.9 + aPhase * 6.2) * 0.7 + life * 1.4;
          p.z += cos(uTime * 0.75 + aPhase * 4.7) * 0.55;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = max(1.0, -mv.z);
          gl_PointSize = clamp(22.0 / dist, 1.8, 4.6);
          vHeat = sin(life * 3.14159);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vHeat;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = pow(max(0.0001, 1.0 - d * 2.0), 1.6);
          vec3 col = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.85, 0.42), core);
          gl_FragColor = vec4(col, core * vHeat * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.emberPoints = new THREE.Points(this.emberGeo, this.emberMat);
    this.emberPoints.frustumCulled = false;
    scene.add(this.emberPoints);

    const fGeo = createFeatherGeometry();
    const fMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const featherCount = 8;
    this.featherMesh = new THREE.InstancedMesh(fGeo, fMat, featherCount);
    this.featherMesh.frustumCulled = false;
    this.featherSeeds = [];
    const fCol = new THREE.Color();
    for (let i = 0; i < featherCount; i++) {
      this.featherSeeds.push({
        x: -18 + i * 4.5,
        y: 1.8 + (i % 4) * 1.1,
        z: -3.5 + (i % 5) * 1.6,
        phase: i * 1.4,
        speed: 0.55 + (i % 3) * 0.22,
      });
      fCol.setHex(i % 3 === 0 ? 0xd93829 : i % 3 === 1 ? 0xe5a93b : 0xf2dec2);
      this.featherMesh.setColorAt(i, fCol);
    }
    if (this.featherMesh.instanceColor) this.featherMesh.instanceColor.needsUpdate = true;
    scene.add(this.featherMesh);
  }

  public update(elapsed: number, tintHex?: number): void {
    this.moteMat.uniforms.uTime.value = elapsed;
    this.emberMat.uniforms.uTime.value = elapsed;
    if (tintHex !== undefined) {
      this.moteMat.uniforms.uColor.value.setHex(tintHex);
    }

    for (let i = 0; i < this.featherSeeds.length; i++) {
      const f = this.featherSeeds[i];
      const t = elapsed * f.speed + f.phase;
      const x = ((f.x + elapsed * 0.95 + 22) % 44) - 22;
      const y = f.y + Math.sin(t * 1.4) * 0.55;
      const z = f.z + Math.cos(t * 0.9) * 0.85;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(
        Math.sin(t * 1.8) * 0.55,
        t * 0.85,
        Math.cos(t * 1.5) * 0.65,
      );
      this.dummy.scale.setScalar(1.25);
      this.dummy.updateMatrix();
      this.featherMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.featherMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.moteGeo.dispose();
    this.moteMat.dispose();
    this.emberGeo.dispose();
    this.emberMat.dispose();
    this.featherMesh.geometry.dispose();
    (this.featherMesh.material as THREE.Material).dispose();
  }
}
