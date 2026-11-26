import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import type {
  BirdType,
  BlockRole,
  CameraMode,
  FreeCamGesture,
  GameHudSnapshot,
  GamePhase,
  LevelDefinition,
} from './types';
import { computeStars, LEVEL_COUNT, LEVEL_METADATA, SLINGSHOT_ORIGIN } from './levels';
import { loadLevelDefinition } from './levelLoader';
import { OcclusionCuller } from './occlusionCulling';
import {
  isLevelUnlocked,
  loadCampaignProgress,
  recordLevelVictory,
  saveCampaignProgress,
  type CampaignProgress,
} from './progression';
import {
  applyDebrisChunkImpact,
  BIRD_PHYSICS_PROPS,
  buildStructuralJoints,
  createBirdBody,
  createBlockBody,
  createPhysicsWorld,
  createPigBody,
  isWorldSettled,
  predictTrajectory,
  stepPhysicsWorld,
  triggerBirdAbility,
  wakeAllNearby,
  type PhysicsWorld,
  type RigidBody,
} from './physics';
import { createTextureLibrary, type TextureLibrary } from './textures';
import {
  ArchitecturalGeometryCache,
  buildEnvironment,
  createBirdModel,
  createBlockMaterials,
  createPigModel,
  createSlingshotModel,
  FortressBatchManager,
  groundHeightAt,
  inferBlockRole,
  type BirdVisual,
  type BlockMaterialSet,
  type EnvironmentHandle,
  type SlingshotRig,
} from './models';
import { AmbientAtmosphere, VfxManager } from './vfx';
import type { ActiveBlockObstacle } from './debris';
import { ProceduralAudioEngine } from './audio';

interface BodyVisualEntry {
  body: RigidBody;
  mesh: THREE.Object3D | null;
  birdVisual?: BirdVisual;
  isBatchedBlock?: boolean;
  blockRole?: BlockRole;
  shadowDiameter?: number;
  contactShadowYOffset?: number;
  wasFlashing?: boolean;
  materials: THREE.MeshStandardMaterial[];
  baseEmissives: THREE.Color[];
  dispose: () => void;
}

function disposeUnsharedMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (!mesh.geometry.userData?.sharedCached) {
        mesh.geometry.dispose();
      }
      const m = mesh.material;
      if (Array.isArray(m)) {
        for (let i = 0; i < m.length; i++) {
          if (!m[i].userData?.sharedCached) m[i].dispose();
        }
      } else if (m && !m.userData?.sharedCached) {
        m.dispose();
      }
    }
  });
}

const SLINGSHOT_REST = new THREE.Vector3(SLINGSHOT_ORIGIN.x, SLINGSHOT_ORIGIN.y, SLINGSHOT_ORIGIN.z);
const MAX_PULL_DIST = 3.5;
const LAUNCH_MULTIPLIER = 9.6;

interface LevelAtmospherePreset {
  sunDir: THREE.Vector3;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  fogColor: number;
  hazeHorizon: number;
  hazeZenith: number;
  moteTint: number;
  skyTurbidity: number;
  skyRayleigh: number;
  vignetteStrength: number;
  menuCamPos: [number, number, number];
  menuLookAt: [number, number, number];
}

const LEVEL_ATMOSPHERES: LevelAtmospherePreset[] = [
  {
    // Level 1: Atalaya del Valle — Crisp Alpine Golden Hour
    sunDir: new THREE.Vector3(0.62, 0.27, 0.73).normalize(),
    sunColor: 0xffc982,
    sunIntensity: 3.15,
    hemiSky: 0x7cb6f2,
    hemiGround: 0x2c361c,
    hemiIntensity: 0.48,
    rimColor: 0x8ebdf2,
    rimIntensity: 0.22,
    fogColor: 0xbfc9d4,
    hazeHorizon: 0xd8c1a2,
    hazeZenith: 0x6798d0,
    moteTint: 0xffe29c,
    skyTurbidity: 2.3,
    skyRayleigh: 1.85,
    vignetteStrength: 0.24,
    menuCamPos: [-21.4, 3.65, -4.4],
    menuLookAt: [14.0, 2.85, 1.8],
  },
  {
    // Level 2: Puente de Cristal — Crisp Alpenglow Morning & Crystal Highlights
    sunDir: new THREE.Vector3(0.46, 0.34, -0.82).normalize(),
    sunColor: 0xffe0b2,
    sunIntensity: 3.05,
    hemiSky: 0x70b2f5,
    hemiGround: 0x27382b,
    hemiIntensity: 0.5,
    rimColor: 0xffcca0,
    rimIntensity: 0.26,
    fogColor: 0xb2c8de,
    hazeHorizon: 0xc5d5e5,
    hazeZenith: 0x588cc9,
    moteTint: 0xdbeeff,
    skyTurbidity: 2.0,
    skyRayleigh: 1.65,
    vignetteStrength: 0.25,
    menuCamPos: [-21.0, 4.45, -4.6],
    menuLookAt: [14.0, 2.65, 1.6],
  },
  {
    // Level 3: Ciudadela de Granito — Dramatic Amber Siege Dusk
    sunDir: new THREE.Vector3(0.75, 0.21, 0.63).normalize(),
    sunColor: 0xff9a52,
    sunIntensity: 3.2,
    hemiSky: 0x5f86b5,
    hemiGround: 0x2c1f18,
    hemiIntensity: 0.44,
    rimColor: 0x7aa4d6,
    rimIntensity: 0.24,
    fogColor: 0xc29070,
    hazeHorizon: 0xd69b6f,
    hazeZenith: 0x4f6e9a,
    moteTint: 0xffb66b,
    skyTurbidity: 3.6,
    skyRayleigh: 2.35,
    vignetteStrength: 0.3,
    menuCamPos: [-21.6, 3.15, -4.1],
    menuLookAt: [14.5, 3.15, 1.7],
  },
  {
    // Preset 4: Crisp High-Altitude Alpine Noon
    sunDir: new THREE.Vector3(0.54, 0.44, 0.72).normalize(),
    sunColor: 0xfff0d4,
    sunIntensity: 3.1,
    hemiSky: 0x7bc2ff,
    hemiGround: 0x334022,
    hemiIntensity: 0.54,
    rimColor: 0xa4d1ff,
    rimIntensity: 0.24,
    fogColor: 0xc4d4e2,
    hazeHorizon: 0xd6e1ea,
    hazeZenith: 0x5c96d8,
    moteTint: 0xfff3c8,
    skyTurbidity: 1.85,
    skyRayleigh: 1.55,
    vignetteStrength: 0.22,
    menuCamPos: [-21.2, 4.1, -4.5],
    menuLookAt: [14.5, 3.3, 1.5],
  },
  {
    // Preset 5: Emerald Valley Mist Dawn
    sunDir: new THREE.Vector3(0.68, 0.24, -0.69).normalize(),
    sunColor: 0xffd7a8,
    sunIntensity: 3.0,
    hemiSky: 0x7eb8de,
    hemiGround: 0x243627,
    hemiIntensity: 0.5,
    rimColor: 0x9cd2e6,
    rimIntensity: 0.26,
    fogColor: 0xb6cad1,
    hazeHorizon: 0xcfd6cf,
    hazeZenith: 0x5886ad,
    moteTint: 0xe6f2c4,
    skyTurbidity: 2.75,
    skyRayleigh: 1.95,
    vignetteStrength: 0.26,
    menuCamPos: [-21.5, 4.35, -4.2],
    menuLookAt: [15.0, 3.4, 1.4],
  },
  {
    // Preset 6: Imperial Royal Crimson Twilight
    sunDir: new THREE.Vector3(0.79, 0.19, 0.58).normalize(),
    sunColor: 0xff8c48,
    sunIntensity: 3.25,
    hemiSky: 0x5774a8,
    hemiGround: 0x2b1d17,
    hemiIntensity: 0.45,
    rimColor: 0x89a8db,
    rimIntensity: 0.28,
    fogColor: 0xba8468,
    hazeHorizon: 0xcf8c66,
    hazeZenith: 0x425a88,
    moteTint: 0xffc070,
    skyTurbidity: 4.0,
    skyRayleigh: 2.55,
    vignetteStrength: 0.32,
    menuCamPos: [-22.2, 4.2, -4.4],
    menuLookAt: [15.5, 3.8, 1.4],
  },
];

const AgxCinematicPostShader = {
  name: 'AgxCinematicPostShader',
  defines: {
    AGX_TONE_MAPPING: '',
    SRGB_TRANSFER: '',
  },
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1.05 },
    vignetteStrength: { value: 0.22 },
    aberration: { value: 0.0 },
    uShockwave: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
    uAspect: { value: 1.6 },
    uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uSharpness: { value: 0.34 },
  },
  vertexShader: /* glsl */ `
    precision highp float;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float aberration;
    uniform vec4 uShockwave;
    uniform float uAspect;
    uniform vec2 uTexelSize;
    uniform float uSharpness;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    varying vec2 vUv;

    void main() {
      vec2 sc = (vUv - uShockwave.xy) * vec2(max(0.25, uAspect), 1.0);
      float scDist = length(sc);
      float ringDiff = scDist - uShockwave.z;
      float waveBand = exp(-ringDiff * ringDiff * 640.0) * (1.0 - smoothstep(0.0, 0.14, abs(ringDiff)));
      vec2 waveDir = scDist > 0.0001 ? sc / scDist : vec2(0.0);
      vec2 refractShift = waveDir * vec2(1.0 / max(0.25, uAspect), 1.0) * waveBand * uShockwave.w;
      vec2 baseUv = clamp(vUv - refractShift, vec2(0.001), vec2(0.999));

      vec2 offset = baseUv - 0.5;
      float dist2 = dot(offset, offset);
      vec2 shift = offset * dist2 * aberration * 1.8 + waveDir * waveBand * uShockwave.w * 0.34;
      vec3 cCenter;
      if (dot(shift, shift) > 1e-10) {
        cCenter.r = texture2D(tDiffuse, clamp(baseUv + shift, vec2(0.001), vec2(0.999))).r;
        cCenter.g = texture2D(tDiffuse, baseUv).g;
        cCenter.b = texture2D(tDiffuse, clamp(baseUv - shift, vec2(0.001), vec2(0.999))).b;
      } else {
        cCenter = texture2D(tDiffuse, baseUv).rgb;
      }

      // Contrast-Adaptive Sharpening (CAS) 5-tap cross kernel for crisp near & medium detail
      vec3 cN = texture2D(tDiffuse, clamp(baseUv + vec2(0.0, -uTexelSize.y), vec2(0.001), vec2(0.999))).rgb;
      vec3 cS = texture2D(tDiffuse, clamp(baseUv + vec2(0.0,  uTexelSize.y), vec2(0.001), vec2(0.999))).rgb;
      vec3 cW = texture2D(tDiffuse, clamp(baseUv + vec2(-uTexelSize.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
      vec3 cE = texture2D(tDiffuse, clamp(baseUv + vec2( uTexelSize.x, 0.0), vec2(0.001), vec2(0.999))).rgb;
      vec3 minCol = min(cCenter, min(min(cN, cS), min(cW, cE)));
      vec3 maxCol = max(cCenter, max(max(cN, cS), max(cW, cE)));
      vec3 neighborAvg = (cN + cS + cW + cE) * 0.25;
      float localContrast = dot(maxCol - minCol, vec3(0.299, 0.587, 0.114));
      float casWeight = uSharpness * (1.0 - smoothstep(0.35, 1.25, localContrast));
      vec3 sharpened = clamp(cCenter + (cCenter - neighborAvg) * casWeight, minCol * 0.92, maxCol * 1.08);
      vec4 outCol = vec4(max(vec3(0.0), sharpened), 1.0);

      outCol.rgb = AgXToneMapping(outCol.rgb);
      outCol = sRGBTransferOETF(outCol);

      float vig = 1.0 - dist2 * vignetteStrength * 1.32;
      outCol.rgb *= clamp(vig, 0.62, 1.0);
      gl_FragColor = outCol;
    }
  `,
};

export class GameEngine {
  private container: HTMLElement;
  private onHudChange: (snapshot: GameHudSnapshot) => void;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private lensPass: ShaderPass | null = null;
  private depthTarget: THREE.WebGLRenderTarget | null = null;
  private depthOverrideMat: THREE.MeshBasicMaterial | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;

  private sky!: Sky;
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;

  private textures: TextureLibrary;
  private blockMaterials: BlockMaterialSet;
  private geoCache = new ArchitecturalGeometryCache();
  private fortressBatch = new FortressBatchManager();
  public readonly culler = new OcclusionCuller();
  private slingshot: SlingshotRig;
  private vfx: VfxManager;
  private ambientAtmos: AmbientAtmosphere;
  public audio: ProceduralAudioEngine;
  private envCleanup: EnvironmentHandle;
  private envMapRT: THREE.WebGLRenderTarget | null = null;
  private envMapLevelIndex = 0;
  private isMobileGpu = false;
  private viewW = 1280;
  private viewH = 720;
  private currentDpr = 1;
  private perfFrames = 0;
  private perfAccumMs = 0;
  private lastDprAdjustMs = 0;
  private shadowDirtyFrames = 3;
  private blocksDirtyForCull = true;
  private lastCullViewProj = new THREE.Matrix4();
  private currentViewProj = new THREE.Matrix4();
  private lastContactShadowCount = -1;
  private contactShadowsDirty = true;

  private trajectoryDots: THREE.InstancedMesh;
  private trajectoryDotGeo: THREE.BufferGeometry;
  private trajectoryDotMat: THREE.MeshBasicMaterial;

  private readonly contactShadowCapacity = 160;
  private contactShadowMesh: THREE.InstancedMesh;
  private contactShadowGeo: THREE.BufferGeometry;
  private contactShadowMat: THREE.MeshBasicMaterial;
  private contactShadowAlphas = new Float32Array(160);
  private contactShadowAlphaAttr: THREE.InstancedBufferAttribute;

  private waitingBirdGroup = new THREE.Group();
  private levelGroup = new THREE.Group();
  private visuals = new Map<string, BodyVisualEntry>();

  private world: PhysicsWorld = createPhysicsWorld(-19.5);
  private phase: GamePhase = 'title';
  private cameraMode: CameraMode = 'aim';
  private freeCamGesture: FreeCamGesture = 'orbit';
  private levelIndex = 0;
  private levelLoadSeq = 0;
  private activeLevelDef: LevelDefinition | null = null;
  private initialCompileDone = false;
  private score = 0;
  private progress: CampaignProgress = loadCampaignProgress(LEVEL_COUNT);
  private bestScores: number[] = LEVEL_METADATA.map((_, i) => this.progress.records[i]?.bestScore ?? 0);
  private birdQueue: BirdType[] = [];
  private activeBirdBody: RigidBody | null = null;
  private abilityUsed = false;
  private unusedBirdBonus = 0;
  private pressedKeys = new Set<string>();

  // Slingshot drag state
  private isPulling = false;
  private dragStartClient = { x: 0, y: 0 };
  private pullOffset = new THREE.Vector3(0, 0, 0);
  private launchVelocity = new THREE.Vector3(0, 0, 0);

  // Turn & Juice timers
  private flightTimer = 0;
  private settleTimer = 0;
  private turnEndDelay = 0;
  private pendingTurnAdvance = false;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private titleOrbitAngle = 0;
  private lastHudEmitMs = 0;
  private pointerParallax = new THREE.Vector2(0, 0);
  private pointerParallaxTarget = new THREE.Vector2(0, 0);

  // Smooth atmosphere transition scratch
  private _sunDirCurrent = new THREE.Vector3(0.62, 0.27, 0.73).normalize();
  private _sunColorTarget = new THREE.Color(0xffca86);
  private _hemiSkyTarget = new THREE.Color(0x86bcf0);
  private _hemiGroundTarget = new THREE.Color(0x4d492b);
  private _rimColorTarget = new THREE.Color(0x9ec8f8);
  private _fogColorTarget = new THREE.Color(0xc2ccd6);
  private _hazeHorizonCurrent = new THREE.Color(0xd9c2a3);
  private _hazeHorizonTarget = new THREE.Color(0xd9c2a3);
  private _hazeZenithCurrent = new THREE.Color(0x6f9fd4);
  private _hazeZenithTarget = new THREE.Color(0x6f9fd4);
  private _moteColorCurrent = new THREE.Color(0xffe29c);
  private _moteColorTarget = new THREE.Color(0xffe29c);

  // Camera smoothing
  private camPosCurrent = new THREE.Vector3(-21.4, 3.65, -4.4);
  private camLookCurrent = new THREE.Vector3(14.0, 2.85, 1.8);
  private camPosTarget = new THREE.Vector3(-21.4, 3.65, -4.4);
  private camLookTarget = new THREE.Vector3(14.0, 2.85, 1.8);

  // Scratch objects (zero GC in render loop)
  private _dummy = new THREE.Object3D();
  private _vecA = new THREE.Vector3();
  private _vecB = new THREE.Vector3();
  private _vecC = new THREE.Vector3();
  private _vecD = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _invQuat = new THREE.Quaternion();
  private _raycaster = new THREE.Raycaster();
  private _ndc = new THREE.Vector2();
  private _projA = new THREE.Vector3();
  private _projB = new THREE.Vector3();
  private _obstacles: ActiveBlockObstacle[] = [];
  private _lastTime = performance.now();
  private frameId = 0;
  public renderedFrames = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    onHudChange: (snapshot: GameHudSnapshot) => void,
    autostart = false,
  ) {
    this.container = container;
    this.onHudChange = onHudChange;
    this.audio = new ProceduralAudioEngine();

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    document.documentElement.dataset.gpu = this.isSoftwareGl ? 'false' : 'true';

    this.isMobileGpu =
      !this.isSoftwareGl &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') &&
      window.innerWidth <= 920;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.viewW = width;
    this.viewH = height;
    this.currentDpr = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, this.isMobileGpu ? 1.75 : 2.0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      preserveDrawingBuffer: this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.currentDpr);
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const horizonColor = new THREE.Color(LEVEL_ATMOSPHERES[0].hazeHorizon);
    this.scene.background = horizonColor;
    // Linear distance fog starting at 68m (well behind the fortress arena) so near & medium objects stay 100% razor-sharp!
    this.scene.fog = new THREE.Fog(LEVEL_ATMOSPHERES[0].fogColor, 68, 240);

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.25, 380);
    this.camera.position.copy(this.camPosCurrent);
    this.camera.lookAt(this.camLookCurrent);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enabled = false;
    this.orbitControls.enableDamping = !this.isSoftwareGl;
    this.orbitControls.dampingFactor = 0.085;
    this.orbitControls.screenSpacePanning = false;
    this.orbitControls.panSpeed = 1.25;
    this.orbitControls.rotateSpeed = 0.85;
    this.orbitControls.zoomSpeed = 1.1;
    this.orbitControls.maxPolarAngle = Math.PI * 0.485;
    this.orbitControls.minDistance = 4.5;
    this.orbitControls.maxDistance = 68;
    this.orbitControls.target.set(13, 3, 0);
    this.applyFreeCamTouchMapping();

    // Physical Sky-Derived Alpine IBL environment
    const initialPreset = LEVEL_ATMOSPHERES[0];
    this.rebuildSkyEnvironmentMap(initialPreset);

    this.setupAtmosphereAndLights(initialPreset);

    this.textures = createTextureLibrary(this.renderer);
    this.blockMaterials = createBlockMaterials(this.textures, this.isSoftwareGl);
    this.envCleanup = buildEnvironment(
      this.scene,
      this.renderer,
      this.isSoftwareGl,
      this.isMobileGpu,
    );

    this.slingshot = createSlingshotModel(SLINGSHOT_ORIGIN, this.textures);
    this.scene.add(this.slingshot.group);
    this.scene.add(this.waitingBirdGroup);
    this.levelGroup.add(this.fortressBatch.group);
    this.scene.add(this.levelGroup);

    // Single InstancedMesh pool for all block/pig/bird ground contact shadow discs
    this.contactShadowGeo = new THREE.CircleGeometry(0.5, 16);
    this.contactShadowGeo.rotateX(-Math.PI * 0.5);
    this.contactShadowAlphaAttr = new THREE.InstancedBufferAttribute(this.contactShadowAlphas, 1);
    this.contactShadowAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.contactShadowGeo.setAttribute('aShadowAlpha', this.contactShadowAlphaAttr);
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      map: this.textures.contactShadow,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    this.contactShadowMat.customProgramCacheKey = () => 'contact-shadow-instanced-v1';
    this.contactShadowMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aShadowAlpha;\nvarying float vShadowAlpha;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShadowAlpha = aShadowAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShadowAlpha;')
        .replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\ngl_FragColor.a *= vShadowAlpha;',
        );
    };
    this.contactShadowMesh = new THREE.InstancedMesh(
      this.contactShadowGeo,
      this.contactShadowMat,
      this.contactShadowCapacity,
    );
    this.contactShadowMesh.frustumCulled = false;
    this.contactShadowMesh.renderOrder = 2;
    this.contactShadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.contactShadowMesh.count = 0;
    this.contactShadowMesh.visible = false;
    this.scene.add(this.contactShadowMesh);

    this.vfx = new VfxManager(
      this.scene,
      this.textures,
      this.isSoftwareGl,
      (pos, vel, radius, material) => {
        if (this.phase !== 'playing') return;
        const evs = applyDebrisChunkImpact(this.world, pos, vel, radius, material);
        if (evs.length > 0) this.processCollisionEvents(evs);
      },
    );
    this.ambientAtmos = new AmbientAtmosphere(this.scene);

    // 3D Parabolic Trajectory Dots (InstancedMesh)
    this.trajectoryDotGeo = new THREE.SphereGeometry(0.14, 10, 8);
    this.trajectoryDotMat = new THREE.MeshBasicMaterial({
      color: 0xfff8dc,
      transparent: true,
      opacity: 0.9,
    });
    this.trajectoryDots = new THREE.InstancedMesh(
      this.trajectoryDotGeo,
      this.trajectoryDotMat,
      26,
    );
    this.trajectoryDots.frustumCulled = false;
    this.trajectoryDots.visible = false;
    this.scene.add(this.trajectoryDots);

    // Post-processing (4x MSAA EffectComposer + Conditional Half-Res HDR Bloom + Merged AgX Output & Lens Finish) on hardware GPUs
    if (!this.isSoftwareGl) {
      const depthScale = 0.5;
      const depthW = Math.max(1, Math.floor(width * depthScale));
      const depthH = Math.max(1, Math.floor(height * depthScale));
      const depthTex = new THREE.DepthTexture(depthW, depthH);
      depthTex.minFilter = THREE.NearestFilter;
      depthTex.magFilter = THREE.NearestFilter;
      depthTex.generateMipmaps = false;
      this.depthTarget = new THREE.WebGLRenderTarget(depthW, depthH, {
        depthBuffer: true,
        depthTexture: depthTex,
      });
      this.depthOverrideMat = new THREE.MeshBasicMaterial({ colorWrite: false });

      const msaaSamples = this.renderer.capabilities.isWebGL2
        ? Math.min(4, this.renderer.capabilities.maxSamples || 4, this.isMobileGpu ? 2 : 4)
        : 0;
      const effW = Math.max(1, Math.floor(width * this.currentDpr));
      const effH = Math.max(1, Math.floor(height * this.currentDpr));
      const composerRT = new THREE.WebGLRenderTarget(effW, effH, {
        type: THREE.HalfFloatType,
        samples: msaaSamples,
      });
      this.composer = new EffectComposer(this.renderer, composerRT);
      this.composer.setPixelRatio(this.currentDpr);
      this.composer.setSize(width, height);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(
          Math.max(1, Math.floor(width * 0.5)),
          Math.max(1, Math.floor(height * 0.5)),
        ),
        0.18,
        0.32,
        1.85,
      );
      this.bloomPass.enabled = false;
      this.composer.addPass(this.bloomPass);

      const lensMaterial = new THREE.RawShaderMaterial({
        name: AgxCinematicPostShader.name,
        defines: { ...AgxCinematicPostShader.defines },
        uniforms: THREE.UniformsUtils.clone(AgxCinematicPostShader.uniforms),
        vertexShader: AgxCinematicPostShader.vertexShader,
        fragmentShader: AgxCinematicPostShader.fragmentShader,
      });
      this.lensPass = new ShaderPass(lensMaterial);
      this.lensPass.uniforms['uAspect'].value = width / Math.max(1, height);
      this.lensPass.uniforms['uTexelSize'].value.set(1 / effW, 1 / effH);
      this.lensPass.uniforms['toneMappingExposure'].value = this.renderer.toneMappingExposure;
      this.composer.addPass(this.lensPass);
    }

    this.phase = autostart ? 'playing' : 'title';
    document.body.dataset.state = this.phase;
    this.snapCameraForCurrentMode();
    void this.loadLevel(0, this.phase);

    this.bindEvents();
    this.emitHud(true);
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__gameEngine = this;
    }
    this._lastTime = performance.now();
    this.tick();
  }

  private rebuildSkyEnvironmentMap(preset: LevelAtmospherePreset): void {
    const envScene = new THREE.Scene();

    // True physical Sky scattering dome for authentic golden-hour/alpine reflections
    const envSky = new Sky();
    envSky.scale.setScalar(120);
    const u = envSky.material.uniforms;
    u['turbidity'].value = preset.skyTurbidity;
    u['rayleigh'].value = preset.skyRayleigh;
    u['mieCoefficient'].value = 0.0011;
    u['mieDirectionalG'].value = 0.72;
    if (u['showSunDisc']) u['showSunDisc'].value = 0.0;
    u['sunPosition'].value.copy(preset.sunDir);
    envScene.add(envSky);

    // Rich alpine forest-meadow ground bounce hemisphere
    const groundHem = new THREE.Mesh(
      new THREE.SphereGeometry(90, 24, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: preset.hemiGround, side: THREE.BackSide }),
    );
    envScene.add(groundHem);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const nextRT = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();

    this.envMapRT?.dispose();
    this.envMapRT = nextRT;
    this.scene.environment = nextRT.texture;
    // Calibrated intensity so raw HDR Sky scattering enriches glass/steel without bleaching matte foliage
    this.scene.environmentIntensity = 0.24;

    envScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
        const m = (obj as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }

  private setupAtmosphereAndLights(preset: LevelAtmospherePreset): void {
    this.sky = new Sky();
    this.sky.scale.setScalar(480);
    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['turbidity'].value = preset.skyTurbidity;
    skyUniforms['rayleigh'].value = preset.skyRayleigh;
    skyUniforms['mieCoefficient'].value = 0.0024;
    skyUniforms['mieDirectionalG'].value = 0.8;
    if (skyUniforms['showSunDisc']) {
      skyUniforms['showSunDisc'].value = 0.0;
    }
    this._sunDirCurrent
      .set(preset.sunDir.x, preset.sunDir.y + 0.24, preset.sunDir.z)
      .normalize();
    skyUniforms['sunPosition'].value.copy(this._sunDirCurrent);
    this.scene.add(this.sky);

    // Low golden-hour directional sun key light casting sharp sculptural shadows across valley & fortress
    this.sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
    this.sunLight.position.copy(this._sunDirCurrent).multiplyScalar(58);
    this.sunLight.castShadow = !this.isSoftwareGl;
    const shadowRes = this.isMobileGpu ? 1024 : 2048;
    this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.sunLight.shadow.radius = 1.5;
    this.sunLight.shadow.camera.near = 12;
    this.sunLight.shadow.camera.far = 115;
    this.sunLight.shadow.camera.left = -38;
    this.sunLight.shadow.camera.right = 38;
    this.sunLight.shadow.camera.top = 26;
    this.sunLight.shadow.camera.bottom = -18;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.028;
    this.scene.add(this.sunLight);

    // Sky azure / warm olive earth hemisphere fill light
    this.hemiLight = new THREE.HemisphereLight(
      preset.hemiSky,
      preset.hemiGround,
      preset.hemiIntensity,
    );
    this.scene.add(this.hemiLight);

    // Soft cool sky bounce fill on camera-facing shadowed surfaces
    this.rimLight = new THREE.DirectionalLight(preset.rimColor, preset.rimIntensity);
    this.rimLight.position.set(-24, 16, -22);
    this.scene.add(this.rimLight);
  }

  private getAtmospherePreset(idx = this.levelIndex): LevelAtmospherePreset {
    return LEVEL_ATMOSPHERES[((idx % LEVEL_ATMOSPHERES.length) + LEVEL_ATMOSPHERES.length) % LEVEL_ATMOSPHERES.length];
  }

  private snapSunToPreset(preset: LevelAtmospherePreset): void {
    this._sunDirCurrent
      .set(preset.sunDir.x, preset.sunDir.y + 0.24, preset.sunDir.z)
      .normalize();
    this.sunLight.position.copy(this._sunDirCurrent).multiplyScalar(58);
    this.sunLight.updateMatrixWorld();
    this.sunLight.shadow.camera.updateMatrixWorld();
    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['sunPosition'].value.copy(this._sunDirCurrent);
  }

  private updateAtmosphereSmooth(dt: number): void {
    const preset = this.getAtmospherePreset(this.levelIndex);
    const alpha = 1 - Math.exp(-3.4 * dt);

    // Keep directional sun position locked to the level preset so shadow texels never swim sub-texel across static edges
    this._vecD.set(preset.sunDir.x, preset.sunDir.y + 0.24, preset.sunDir.z).normalize();
    if (this._sunDirCurrent.distanceToSquared(this._vecD) > 1e-6) {
      this.snapSunToPreset(preset);
      this.shadowDirtyFrames = Math.max(this.shadowDirtyFrames, 2);
    }
    this._sunColorTarget.setHex(preset.sunColor);
    this.sunLight.color.lerp(this._sunColorTarget, alpha);
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      preset.sunIntensity,
      alpha,
    );

    this._hemiSkyTarget.setHex(preset.hemiSky);
    this._hemiGroundTarget.setHex(preset.hemiGround);
    this.hemiLight.color.lerp(this._hemiSkyTarget, alpha);
    this.hemiLight.groundColor.lerp(this._hemiGroundTarget, alpha);
    this.hemiLight.intensity = THREE.MathUtils.lerp(
      this.hemiLight.intensity,
      preset.hemiIntensity,
      alpha,
    );

    this._rimColorTarget.setHex(preset.rimColor);
    this.rimLight.color.lerp(this._rimColorTarget, alpha);
    this.rimLight.intensity = THREE.MathUtils.lerp(
      this.rimLight.intensity,
      preset.rimIntensity,
      alpha,
    );

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms['sunPosition'].value.copy(this._sunDirCurrent);
    skyUniforms['turbidity'].value = THREE.MathUtils.lerp(
      skyUniforms['turbidity'].value,
      preset.skyTurbidity,
      alpha,
    );
    skyUniforms['rayleigh'].value = THREE.MathUtils.lerp(
      skyUniforms['rayleigh'].value,
      preset.skyRayleigh,
      alpha,
    );

    this._fogColorTarget.setHex(preset.fogColor);
    this._hazeHorizonTarget.setHex(preset.hazeHorizon);
    this._hazeZenithTarget.setHex(preset.hazeZenith);
    this._hazeHorizonCurrent.lerp(this._hazeHorizonTarget, alpha);
    this._hazeZenithCurrent.lerp(this._hazeZenithTarget, alpha);

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.lerp(this._fogColorTarget, alpha);
    } else if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(this._fogColorTarget, alpha);
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(this._hazeHorizonTarget, alpha);
    }

    this._moteColorTarget.setHex(preset.moteTint);
    this._moteColorCurrent.lerp(this._moteColorTarget, alpha);

    if (this.lensPass) {
      this.lensPass.uniforms['vignetteStrength'].value = THREE.MathUtils.lerp(
        this.lensPass.uniforms['vignetteStrength'].value,
        this.phase === 'title' ? preset.vignetteStrength : 0.18,
        alpha,
      );
    }
  }

  private clearLevelVisuals(): void {
    for (const entry of this.visuals.values()) {
      if (entry.mesh) this.levelGroup.remove(entry.mesh);
      entry.dispose();
    }
    this.visuals.clear();
    this.fortressBatch.clear();
    this.contactShadowMesh.count = 0;
    this.contactShadowMesh.visible = false;
    this.vfx.reset();

    while (this.waitingBirdGroup.children.length > 0) {
      const ch = this.waitingBirdGroup.children[0];
      this.waitingBirdGroup.remove(ch);
      disposeUnsharedMeshes(ch);
    }
  }

  public async loadLevel(index: number, nextPhase: GamePhase = 'playing'): Promise<void> {
    const clampedIdx = Math.max(0, Math.min(LEVEL_COUNT - 1, index));
    if (!isLevelUnlocked(this.progress, clampedIdx, LEVEL_COUNT)) {
      return;
    }
    const reqSeq = ++this.levelLoadSeq;
    this.levelIndex = clampedIdx;
    this.phase = nextPhase;
    document.body.dataset.state =
      nextPhase === 'victory' || nextPhase === 'defeat' ? 'gameover' : nextPhase;
    this.isPulling = false;
    this.trajectoryDots.visible = false;
    this.pendingTurnAdvance = false;

    const lvl = await loadLevelDefinition(clampedIdx);
    if (this.disposed || reqSeq !== this.levelLoadSeq) {
      return;
    }
    this.activeLevelDef = lvl;

    this.clearLevelVisuals();
    const presetIdx = this.levelIndex % LEVEL_ATMOSPHERES.length;
    const activePreset = this.getAtmospherePreset(this.levelIndex);
    this.snapSunToPreset(activePreset);
    if (this.envMapLevelIndex !== presetIdx) {
      this.envMapLevelIndex = presetIdx;
      this.rebuildSkyEnvironmentMap(activePreset);
    }

    this.world = createPhysicsWorld(-19.5);
    this.score = 0;
    this.unusedBirdBonus = 0;
    this.birdQueue = [...lvl.birds];
    const queryBird =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('bird')
        : null;
    if (queryBird === 'red' || queryBird === 'yellow' || queryBird === 'black') {
      this.birdQueue = [queryBird, ...lvl.birds];
    }
    this.activeBirdBody = null;
    this.abilityUsed = false;
    this.isPulling = false;
    this.pullOffset.set(0, 0, 0);
    this.trajectoryDots.visible = false;
    this.pendingTurnAdvance = false;
    this.flightTimer = 0;
    this.settleTimer = 0;
    this.turnEndDelay = 0;
    this.cameraMode = 'aim';
    this.orbitControls.enabled = false;
    this.shadowDirtyFrames = 3;
    this.blocksDirtyForCull = true;
    this.contactShadowsDirty = true;
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    // Create fortress physics bodies & batch specs
    const batchSpecs: Array<{
      id: string;
      bp: LevelDefinition['blocks'][number];
      hx: number;
      hy: number;
      hz: number;
      qx: number;
      qy: number;
      qz: number;
      qw: number;
    }> = [];

    lvl.blocks.forEach((b, idx) => {
      const id = `blk-${idx}`;
      const body = createBlockBody(id, b.x, b.y, b.z, b.w, b.h, b.d, b.material, b.ry ?? 0);
      this.world.bodies.push(body);
      batchSpecs.push({
        id,
        bp: b,
        hx: body.halfExtents.x,
        hy: body.halfExtents.y,
        hz: body.halfExtents.z,
        qx: body.quaternion.x,
        qy: body.quaternion.y,
        qz: body.quaternion.z,
        qw: body.quaternion.w,
      });

      this.visuals.set(id, {
        body,
        mesh: null,
        isBatchedBlock: true,
        blockRole: inferBlockRole(b),
        shadowDiameter: 0,
        contactShadowYOffset: 0,
        wasFlashing: false,
        materials: [],
        baseEmissives: [],
        dispose: () => {},
      });
    });

    this.fortressBatch.buildForLevel(batchSpecs, this.blockMaterials, this.geoCache, this.isSoftwareGl);

    // Bind structural mortar & mortise-tenon joints across stacked fortress blocks
    buildStructuralJoints(this.world);

    // Create pigs
    lvl.pigs.forEach((p, idx) => {
      const id = `pig-${idx}`;
      const body = createPigBody(id, p.x, p.y, p.z, p.radius, p.variant);
      this.world.bodies.push(body);

      const pigGroup = createPigModel(p.radius, p.variant);
      pigGroup.position.set(p.x, p.y, p.z);
      this.levelGroup.add(pigGroup);

      const mats: THREE.MeshStandardMaterial[] = [];
      const baseEms: THREE.Color[] = [];
      pigGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = (obj as THREE.Mesh).material;
          if (m instanceof THREE.MeshStandardMaterial && !m.userData?.sharedCached) {
            mats.push(m);
            baseEms.push(m.emissive.clone());
          }
        }
      });

      this.visuals.set(id, {
        body,
        mesh: pigGroup,
        shadowDiameter: p.radius * 2.1,
        contactShadowYOffset: ((idx + 1) % 7) * 0.001,
        materials: mats,
        baseEmissives: baseEms,
        dispose: () => disposeUnsharedMeshes(pigGroup),
      });
    });

    this.loadNextBirdInSlingshot();
    this.snapCameraForCurrentMode();
    if (!this.initialCompileDone && !this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
      this.initialCompileDone = true;
    }
    this.emitHud(true);
    this.renderFrame();
  }

  private loadNextBirdInSlingshot(): void {
    // Rebuild waiting bird queue visuals
    while (this.waitingBirdGroup.children.length > 0) {
      const ch = this.waitingBirdGroup.children[0];
      this.waitingBirdGroup.remove(ch);
      disposeUnsharedMeshes(ch);
    }

    if (this.birdQueue.length === 0) {
      this.activeBirdBody = null;
      this.slingshot.updateBands(SLINGSHOT_REST, new THREE.Vector3(1, 0, 0));
      return;
    }

    const nextType = this.birdQueue[0];
    const props = BIRD_PHYSICS_PROPS[nextType];
    const id = `bird-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const body = createBirdBody(id, nextType, SLINGSHOT_REST.x, SLINGSHOT_REST.y, SLINGSHOT_REST.z);
    body.launched = false;
    this.world.bodies.push(body);
    this.activeBirdBody = body;
    this.abilityUsed = false;

    const birdVisual = createBirdModel(nextType, props.radius, this.isSoftwareGl);
    birdVisual.group.position.copy(SLINGSHOT_REST);
    this.levelGroup.add(birdVisual.group);

    const mats: THREE.MeshStandardMaterial[] = [];
    const baseEms: THREE.Color[] = [];
    birdVisual.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = (obj as THREE.Mesh).material;
        if (m instanceof THREE.MeshStandardMaterial && !m.userData?.sharedCached) {
          mats.push(m);
          baseEms.push(m.emissive.clone());
        }
      }
    });

    this.visuals.set(id, {
      body,
      mesh: birdVisual.group,
      birdVisual,
      shadowDiameter: props.radius * 2.2,
      contactShadowYOffset: 0.0075,
      materials: mats,
      baseEmissives: baseEms,
      dispose: () => disposeUnsharedMeshes(birdVisual.group),
    });

    this.slingshot.updateBands(SLINGSHOT_REST, new THREE.Vector3(1, 0, 0));

    // Render remaining birds waiting beside the slingshot (share all materials & cached geometry)
    for (let i = 1; i < this.birdQueue.length; i++) {
      const qType = this.birdQueue[i];
      const qRadius = BIRD_PHYSICS_PROPS[qType].radius * 0.92;
      const qVis = createBirdModel(qType, qRadius, true, true);
      qVis.group.position.set(SLINGSHOT_ORIGIN.x - 1.6 - i * 1.35, qRadius + 0.04, 1.8 + (i % 2) * 0.7);
      qVis.group.rotation.y = 0.25;
      this.waitingBirdGroup.add(qVis.group);
    }
    this.shadowDirtyFrames = Math.max(this.shadowDirtyFrames, 2);
    this.contactShadowsDirty = true;
    this.blocksDirtyForCull = true;
  }

  public startGame(levelIdx?: number): void {
    this.audio.unlock();
    const targetIdx = typeof levelIdx === 'number' ? levelIdx : this.levelIndex;
    if (!isLevelUnlocked(this.progress, targetIdx, LEVEL_COUNT)) {
      return;
    }
    if (!this.activeLevelDef || (typeof levelIdx === 'number' && levelIdx !== this.levelIndex)) {
      void this.loadLevel(targetIdx, 'playing');
    } else {
      this.phase = 'playing';
      document.body.dataset.state = 'playing';
      this.cameraMode = 'aim';
      this.orbitControls.enabled = false;
      this.snapCameraForCurrentMode();
      this.emitHud(true);
    }
    this.renderFrame();
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    document.body.dataset.state =
      next === 'victory' || next === 'defeat' ? 'gameover' : next;
    if (next === 'paused') {
      this.isPulling = false;
      this.trajectoryDots.visible = false;
    }
    this.emitHud(true);
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.setPhase('paused');
    } else if (this.phase === 'paused') {
      this.setPhase('playing');
    }
  }

  public toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.emitHud(true);
  }

  private applyFreeCamTouchMapping(): void {
    if (this.cameraMode === 'inspect') {
      this.orbitControls.enabled = !this.isPulling && this.freeCamGesture !== 'aim';
    }
    if (this.freeCamGesture === 'pan') {
      this.orbitControls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
      this.orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    } else {
      this.orbitControls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      this.orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }

  public setFreeCamGesture(gesture: FreeCamGesture): void {
    this.freeCamGesture = gesture;
    this.applyFreeCamTouchMapping();
    this.emitHud(true);
  }

  public resetFreeCamView(): void {
    if (this.cameraMode !== 'inspect') return;
    const fc = LEVEL_METADATA[this.levelIndex].fortressCenter;
    const distBoost = this.levelIndex >= 14 ? 4.5 : this.levelIndex >= 9 ? 1.5 : 0;
    this.orbitControls.target.set(fc.x - 4, fc.y, fc.z);
    this.camera.position.set(fc.x - 16 - distBoost * 0.4, fc.y + 9.5 + distBoost * 0.35, fc.z + 20 + distBoost);
    this.orbitControls.update();
  }

  public toggleCameraMode(): void {
    if (this.phase !== 'playing') return;

    if (this.cameraMode !== 'inspect') {
      this.isPulling = false;
      this.trajectoryDots.visible = false;
      this.cameraMode = 'inspect';
      this.applyFreeCamTouchMapping();
      const fc = LEVEL_METADATA[this.levelIndex].fortressCenter;
      const distBoost = this.levelIndex >= 14 ? 4.5 : this.levelIndex >= 9 ? 1.5 : 0;
      this.orbitControls.target.set(fc.x - 3, fc.y, fc.z);
      this.camera.position.set(fc.x - 15 - distBoost * 0.4, fc.y + 9.0 + distBoost * 0.35, fc.z + 19.5 + distBoost);
      this.orbitControls.update();
    } else {
      this.cameraMode = this.activeBirdBody?.launched ? 'follow' : 'aim';
      this.orbitControls.enabled = false;
    }
    this.emitHud(true);
  }

  public restartLevel(): void {
    this.audio.unlock();
    void this.loadLevel(this.levelIndex, 'playing');
  }

  public nextLevel(): void {
    this.audio.unlock();
    const nextIdx = Math.min(LEVEL_COUNT - 1, this.levelIndex + 1);
    if (!isLevelUnlocked(this.progress, nextIdx, LEVEL_COUNT)) return;
    void this.loadLevel(nextIdx, 'playing');
  }

  private computeTitleCameraTargets(posOut: THREE.Vector3, lookOut: THREE.Vector3): void {
    const preset = this.getAtmospherePreset(this.levelIndex);
    const aspect = this.camera.aspect || 1.6;
    const desktopMix = THREE.MathUtils.clamp((aspect - 0.65) / 0.6, 0, 1);

    // Mobile portrait: frame entire slingshot + perched bird + fortress in mid-band without edge cropping
    const mobPosX = -24.8;
    const mobPosY = 4.95;
    const mobPosZ = -0.15;
    const mobLookX = 3.0;
    const mobLookY = 2.55;
    const mobLookZ = -0.45;

    posOut.set(
      THREE.MathUtils.lerp(mobPosX, preset.menuCamPos[0], desktopMix),
      THREE.MathUtils.lerp(mobPosY, preset.menuCamPos[1], desktopMix),
      THREE.MathUtils.lerp(mobPosZ, preset.menuCamPos[2], desktopMix),
    );
    lookOut.set(
      THREE.MathUtils.lerp(mobLookX, preset.menuLookAt[0], desktopMix),
      THREE.MathUtils.lerp(mobLookY, preset.menuLookAt[1], desktopMix),
      THREE.MathUtils.lerp(mobLookZ, preset.menuLookAt[2], desktopMix),
    );
  }

  private snapCameraForCurrentMode(): void {
    if (this.phase === 'title') {
      this.computeTitleCameraTargets(this.camPosTarget, this.camLookTarget);
      // Only snap instantaneously on initial boot (when switching levels in menu, glide smoothly!)
      if (this.camPosCurrent.distanceToSquared(this.camPosTarget) > 36) {
        this.camPosCurrent.copy(this.camPosTarget);
        this.camLookCurrent.copy(this.camLookTarget);
        this.camera.position.copy(this.camPosCurrent);
        this.camera.lookAt(this.camLookCurrent);
      }
    } else {
      this.camPosTarget.set(SLINGSHOT_ORIGIN.x - 11.2, 6.2, 14.5);
      this.camLookTarget.set(-0.8, 3.1, 0);
      this.camPosCurrent.copy(this.camPosTarget);
      this.camLookCurrent.copy(this.camLookTarget);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
    }
  }

  // --- Input Handling ---

  private isPointerNearSlingshot(e: PointerEvent): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this._ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const distToRay = this._raycaster.ray.distanceToPoint(SLINGSHOT_REST);
    return distToRay <= 3.1;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.audio.unlock();

    // If bird is in flight: trigger ability on tap in standard follow camera OR in Free-Cam 'aim' mode
    if (this.activeBirdBody && this.activeBirdBody.launched) {
      if (this.cameraMode !== 'inspect' || this.freeCamGesture === 'aim') {
        this.activateCurrentBirdAbility();
      }
      return;
    }

    if (!this.activeBirdBody) return;

    // Allow aiming & launching in BOTH standard 'aim' camera AND Free Camera ('inspect') mode:
    // - In Free Camera, players can pull via the 'Lanzar' gesture toggle, Shift+Drag, OR by grabbing directly on the slingshot!
    if (this.cameraMode === 'inspect') {
      const wantsSlingshotPull =
        this.freeCamGesture === 'aim' || e.shiftKey || this.isPointerNearSlingshot(e);
      if (!wantsSlingshotPull) return;
      this.orbitControls.enabled = false;
    } else if (this.cameraMode !== 'aim') {
      return;
    }

    this.isPulling = true;
    this.dragStartClient = { x: e.clientX, y: e.clientY };
    this.pullOffset.set(-1.1, -0.35, 0);
    this.updatePullState();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isPulling || this.phase !== 'playing' || !this.activeBirdBody) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const dx = (e.clientX - this.dragStartClient.x) / Math.max(220, rect.width * 0.28);
    const dy = (e.clientY - this.dragStartClient.y) / Math.max(200, rect.height * 0.34);

    if (this.cameraMode === 'inspect') {
      // Camera-aware Free-Cam pull: project slingshot->fortress axis onto screen so pulling away from the castle always tensions cleanly
      const fc = LEVEL_METADATA[this.levelIndex].fortressCenter;
      this._projA.copy(SLINGSHOT_REST).project(this.camera);
      this._projB.set(fc.x, fc.y, fc.z).project(this.camera);
      let fx = this._projB.x - this._projA.x;
      let fy = -(this._projB.y - this._projA.y); // flip NDC Y to client Y
      const fLen = Math.hypot(fx, fy);
      if (fLen < 0.08) {
        fx = 1;
        fy = 0;
      } else {
        fx /= fLen;
        fy /= fLen;
      }
      const alongForward = dx * fx + dy * fy;
      const perpRight = -dx * fy + dy * fx;
      const pullBack = THREE.MathUtils.clamp(-alongForward * 2.4 + 1.05, 0.45, MAX_PULL_DIST);
      const pullY = THREE.MathUtils.clamp(-dy * 2.35 - 0.35, -2.3, 1.2);
      const rawZ = perpRight * 1.15;
      const pullZ = Math.abs(rawZ) < 0.14 ? 0 : THREE.MathUtils.clamp(rawZ, -1.75, 1.75);
      this.pullOffset.set(-pullBack, pullY, pullZ);
    } else {
      // Dragging down-left pulls directly along the slingshot-to-fortress line with zero lateral drift
      const pullBack = THREE.MathUtils.clamp(-dx * 2.2 + dy * 1.2 + 1.05, 0.45, MAX_PULL_DIST);
      const pullY = THREE.MathUtils.clamp(-dy * 2.4 - 0.35, -2.3, 1.2);
      const rawZ = dx * 0.55 + dy * 0.5;
      const pullZ = Math.abs(rawZ) < 0.14 ? 0 : THREE.MathUtils.clamp(rawZ, -1.6, 1.6);
      this.pullOffset.set(-pullBack, pullY, pullZ);
    }

    if (this.pullOffset.length() > MAX_PULL_DIST) {
      this.pullOffset.setLength(MAX_PULL_DIST);
    }

    this.updatePullState();
    this.audio.playStretch(this.pullOffset.length() / MAX_PULL_DIST);
  };

  private onPointerUp = (): void => {
    if (!this.isPulling) return;
    this.isPulling = false;
    this.trajectoryDots.visible = false;

    if (this.phase === 'playing' && this.activeBirdBody && !this.activeBirdBody.launched) {
      if (this.pullOffset.length() > 0.55) {
        this.launchActiveBird();
      } else {
        // Cancel shot cleanly
        this.pullOffset.set(0, 0, 0);
        this.activeBirdBody.position.x = SLINGSHOT_REST.x;
        this.activeBirdBody.position.y = SLINGSHOT_REST.y;
        this.activeBirdBody.position.z = SLINGSHOT_REST.z;
        this.slingshot.updateBands(SLINGSHOT_REST, new THREE.Vector3(1, 0, 0));
        this.emitHud(true);
      }
    }

    if (this.cameraMode === 'inspect') {
      this.orbitControls.enabled = this.freeCamGesture !== 'aim';
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.pressedKeys.add(e.code);
    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.phase === 'playing' || this.phase === 'paused') {
        this.togglePause();
      }
      return;
    }
    if (this.phase !== 'playing') return;

    if (e.code === 'KeyR') {
      this.restartLevel();
      return;
    }
    if (e.code === 'KeyC') {
      this.toggleCameraMode();
      return;
    }
    if (e.code === 'Space') {
      if (this.activeBirdBody && this.activeBirdBody.launched) {
        e.preventDefault();
        this.activateCurrentBirdAbility();
      }
    }
    // Optional keyboard lateral aim nudge while pulling
    if (this.isPulling && (e.code === 'ArrowLeft' || e.code === 'KeyA')) {
      this.pullOffset.z = Math.min(1.8, this.pullOffset.z + 0.16);
      this.updatePullState();
    } else if (this.isPulling && (e.code === 'ArrowRight' || e.code === 'KeyD')) {
      this.pullOffset.z = Math.max(-1.8, this.pullOffset.z - 0.16);
      this.updatePullState();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressedKeys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.pressedKeys.clear();
    if (this.isPulling) {
      this.isPulling = false;
      this.trajectoryDots.visible = false;
      this.emitHud(true);
    }
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.viewW = width;
    this.viewH = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.phase === 'title') {
      this.computeTitleCameraTargets(this.camPosTarget, this.camLookTarget);
      this.camPosCurrent.copy(this.camPosTarget);
      this.camLookCurrent.copy(this.camLookTarget);
      this.camera.position.copy(this.camPosCurrent);
      this.camera.lookAt(this.camLookCurrent);
    }
    this.renderer.setSize(width, height);
    if (this.depthTarget) {
      const depthScale = 0.5;
      this.depthTarget.setSize(
        Math.max(1, Math.floor(width * depthScale)),
        Math.max(1, Math.floor(height * depthScale)),
      );
    }
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(width * 0.5)),
        Math.max(1, Math.floor(height * 0.5)),
      );
    }
    if (this.lensPass) {
      const effW = Math.max(1, Math.floor(width * this.currentDpr));
      const effH = Math.max(1, Math.floor(height * this.currentDpr));
      this.lensPass.uniforms['uAspect'].value = width / Math.max(1, height);
      this.lensPass.uniforms['uTexelSize'].value.set(1 / effW, 1 / effH);
    }
    this.shadowDirtyFrames = 3;
    this.blocksDirtyForCull = true;
    this.renderFrame(true);
  };

  private onWindowPointerMove = (e: PointerEvent): void => {
    if (this.phase === 'title') {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      this.pointerParallaxTarget.set(
        THREE.MathUtils.clamp((e.clientX / w - 0.5) * 2, -1, 1),
        THREE.MathUtils.clamp((e.clientY / h - 0.5) * 2, -1, 1),
      );
    }
    this.onPointerMove(e);
  };

  private onDeviceOrientation = (e: DeviceOrientationEvent): void => {
    if (this.phase !== 'title') return;
    if (typeof e.gamma === 'number' && typeof e.beta === 'number') {
      this.pointerParallaxTarget.set(
        THREE.MathUtils.clamp(e.gamma / 28, -1, 1),
        THREE.MathUtils.clamp((e.beta - 35) / 28, -1, 1),
      );
    }
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('deviceorientation', this.onDeviceOrientation, { passive: true });
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('deviceorientation', this.onDeviceOrientation);
  }

  private updatePullState(): void {
    if (!this.activeBirdBody) return;
    const birdPos = this._vecA.copy(SLINGSHOT_REST).add(this.pullOffset);
    this.activeBirdBody.position.x = birdPos.x;
    this.activeBirdBody.position.y = birdPos.y;
    this.activeBirdBody.position.z = birdPos.z;

    this.launchVelocity.copy(this.pullOffset).multiplyScalar(-LAUNCH_MULTIPLIER);
    const dir = this._vecB.copy(this.launchVelocity).normalize();
    this.slingshot.updateBands(birdPos, dir);

    // Update 3D parabolic trajectory dots
    const pts = predictTrajectory(
      { x: birdPos.x, y: birdPos.y, z: birdPos.z },
      { x: this.launchVelocity.x, y: this.launchVelocity.y, z: this.launchVelocity.z },
      this.world.gravity,
      26,
      0.075,
    );
    this.trajectoryDots.visible = pts.length > 0;
    for (let i = 0; i < 26; i++) {
      if (i < pts.length) {
        const s = 1 - (i / 26) * 0.55;
        this._dummy.position.set(pts[i].x, pts[i].y, pts[i].z);
        this._dummy.scale.setScalar(s);
      } else {
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.setScalar(0);
      }
      this._dummy.updateMatrix();
      this.trajectoryDots.setMatrixAt(i, this._dummy.matrix);
    }
    this.trajectoryDots.instanceMatrix.needsUpdate = true;
    this.emitHud(false);
  }

  private launchActiveBird(): void {
    if (!this.activeBirdBody || !this.activeLevelDef) return;
    const b = this.activeBirdBody;
    b.launched = true;
    b.isSleeping = false;
    b.velocity.x = this.launchVelocity.x;
    b.velocity.y = this.launchVelocity.y;
    b.velocity.z = this.launchVelocity.z;

    // Wake nearby fortress blocks proactively on launch
    const fc = LEVEL_METADATA[this.levelIndex].fortressCenter;
    wakeAllNearby(this.world, fc, 14);

    this.birdQueue.shift();
    this.flightTimer = 0;
    this.settleTimer = 0;
    if (this.cameraMode !== 'inspect') {
      this.cameraMode = 'follow';
      this.orbitControls.enabled = false;
    } else {
      this.orbitControls.enabled = this.freeCamGesture !== 'aim';
    }
    this.slingshot.updateBands(SLINGSHOT_REST, new THREE.Vector3(1, 0, 0));
    this.audio.playLaunch(b.birdType ?? 'red');
    this.vfx.spawnFeathers(b.birdType ?? 'red', b.position.x, b.position.y, b.position.z, 6);
    this.emitHud(true);
  }

  public activateCurrentBirdAbility(): void {
    if (!this.activeBirdBody || !this.activeBirdBody.launched || this.abilityUsed) return;
    if (!this.activeBirdBody.alive) return;

    this.abilityUsed = true;
    const b = this.activeBirdBody;
    const birdType = b.birdType ?? 'red';
    this.audio.playAbility(birdType);

    const camDist = this.camera.position.distanceTo(
      this._vecA.set(b.position.x, b.position.y, b.position.z),
    );
    const events = triggerBirdAbility(this.world, b);
    if (birdType === 'black') {
      this.hitstopTimer = 0.062;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.98);
      this.vfx.spawnExplosion(b.position.x, b.position.y, b.position.z, true, camDist);
    } else if (birdType === 'red') {
      this.hitstopTimer = 0.032;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.58);
      this.vfx.spawnRedShockwave(
        b.position.x,
        b.position.y,
        b.position.z,
        b.velocity.x,
        b.velocity.y,
        b.velocity.z,
      );
    } else if (birdType === 'yellow') {
      this.hitstopTimer = 0.024;
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.42);
      this.vfx.spawnSupersonicBoost(
        b.position.x,
        b.position.y,
        b.position.z,
        b.velocity.x,
        b.velocity.y,
        b.velocity.z,
      );
      this.vfx.updateTrackedBirdAbility(b.position, b.velocity, 'yellow', b.alive);
    }

    this.shadowDirtyFrames = Math.max(this.shadowDirtyFrames, 2);
    this.processCollisionEvents(events);
    this.emitHud(true);
  }

  private processCollisionEvents(events: ReturnType<typeof stepPhysicsWorld>): void {
    let scoreChanged = false;
    for (const ev of events) {
      if (ev.scoreDelta > 0) {
        this.score += ev.scoreDelta;
        scoreChanged = true;
      }

      if (ev.type === 'pig_pop') {
        this.audio.playPigPop();
        this.vfx.spawnMaterialImpact('pig', ev.position.x, ev.position.y, ev.position.z, true);
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.32);
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
      } else if (ev.type === 'destroy') {
        this.audio.playImpact(ev.material, ev.intensity, true);
        this.cameraTrauma = Math.min(1, this.cameraTrauma + ev.intensity * 0.28);
        if (ev.intensity > 0.95 && (ev.material === 'stone' || ev.material === 'metal')) {
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.028);
        }
      } else if (ev.type === 'joint_snap') {
        this.vfx.spawnJointSnapDust(
          ev.material === 'wood' || ev.material === 'stone' || ev.material === 'glass' || ev.material === 'metal'
            ? ev.material
            : 'stone',
          ev.position.x,
          ev.position.y,
          ev.position.z,
          ev.intensity,
        );
        if (ev.intensity > 0.55) {
          this.audio.playImpact(ev.material, ev.intensity * 0.48, false);
        }
      } else if (ev.type === 'impact' && ev.isGroundContact) {
        this.vfx.spawnGroundContactDust(
          ev.material === 'wood' || ev.material === 'stone' || ev.material === 'glass' || ev.material === 'metal'
            ? ev.material
            : 'ground',
          ev.position.x,
          ev.position.y,
          ev.position.z,
          Math.min(1, ev.intensity),
        );
        if (ev.intensity > 0.38) {
          this.audio.playImpact(ev.material, ev.intensity * 0.7, false);
        }
      } else if (ev.type === 'impact' && ev.intensity > 0.28) {
        this.audio.playImpact(ev.material, ev.intensity, false);
        this.vfx.spawnMaterialImpact(
          ev.material,
          ev.position.x,
          ev.position.y,
          ev.position.z,
          false,
          ev.impactDir,
        );
        if (ev.intensity > 0.6) {
          this.cameraTrauma = Math.min(1, this.cameraTrauma + ev.intensity * 0.16);
        }
      }
    }

    // Remove dead visual entries and spawn directional Voronoi fracture debris
    for (const [id, entry] of this.visuals.entries()) {
      if (!entry.body.alive) {
        if (entry.body.kind === 'bird' && entry.body.birdType) {
          this.vfx.spawnFeathers(
            entry.body.birdType,
            entry.body.position.x,
            entry.body.position.y,
            entry.body.position.z,
            10,
          );
        } else if (entry.body.kind === 'block' && entry.body.material) {
          this.vfx.spawnBlockFracture(
            entry.body.material,
            entry.body.position,
            entry.body.halfExtents,
            entry.body.quaternion,
            entry.body.velocity,
            entry.body.lastImpactPoint,
            entry.body.lastImpactDir,
            entry.body.lastImpactSpeed,
          );
        }
        if (entry.isBatchedBlock) {
          this.fortressBatch.removeBlock(id);
        } else if (entry.mesh) {
          this.levelGroup.remove(entry.mesh);
        }
        entry.dispose();
        this.visuals.delete(id);
        this.shadowDirtyFrames = 3;
        this.blocksDirtyForCull = true;
        this.contactShadowsDirty = true;
      }
    }

    if (scoreChanged) {
      this.emitHud(false);
    }
  }

  private updateTurnLifecycle(dt: number): void {
    if (this.phase !== 'playing' || !this.activeLevelDef) return;

    const pigsAlive = this.world.bodies.filter((b) => b.kind === 'pig' && b.alive).length;
    if (pigsAlive === 0 && !this.pendingTurnAdvance) {
      this.pendingTurnAdvance = true;
      this.turnEndDelay = 0.75;
    }

    if (this.pendingTurnAdvance) {
      this.turnEndDelay -= dt;
      if (this.turnEndDelay <= 0) {
        this.pendingTurnAdvance = false;
        if (pigsAlive === 0) {
          this.unusedBirdBonus = this.birdQueue.length * 10000;
          this.score += this.unusedBirdBonus;
          if (this.score > this.bestScores[this.levelIndex]) {
            this.bestScores[this.levelIndex] = this.score;
          }
          const earnedStars = Math.max(
            1,
            computeStars(this.score, LEVEL_METADATA[this.levelIndex].starThresholds),
          );
          this.progress = recordLevelVictory(
            this.progress,
            this.levelIndex,
            this.score,
            earnedStars,
            LEVEL_COUNT,
          );
          saveCampaignProgress(this.progress);
          this.audio.playVictory();
          this.setPhase('victory');
        } else if (this.birdQueue.length > 0) {
          if (this.cameraMode !== 'inspect') {
            this.cameraMode = 'aim';
            this.orbitControls.enabled = false;
          } else {
            this.orbitControls.enabled = this.freeCamGesture !== 'aim';
          }
          this.loadNextBirdInSlingshot();
          this.emitHud(true);
        } else {
          this.audio.playDefeat();
          this.setPhase('defeat');
        }
      }
      return;
    }

    if (this.activeBirdBody && this.activeBirdBody.launched) {
      this.flightTimer += dt;
      if (isWorldSettled(this.world) || this.flightTimer > 5.8) {
        this.settleTimer += dt;
        if (this.settleTimer > 0.55 || this.flightTimer > 6.5) {
          this.pendingTurnAdvance = true;
          this.turnEndDelay = 0.25;
        }
      } else {
        this.settleTimer = 0;
      }
    }
  }

  private syncVisualsAndShadows(dt: number, elapsed: number, worldSettled: boolean): void {
    let shadowIdx = 0;
    const shadowQuat = this._quat.set(0, 0, 0, 1);

    for (const [id, entry] of this.visuals.entries()) {
      const b = entry.body;

      if (entry.isBatchedBlock) {
        this.fortressBatch.setBlockTransform(
          id,
          b.position.x,
          b.position.y,
          b.position.z,
          b.quaternion.x,
          b.quaternion.y,
          b.quaternion.z,
          b.quaternion.w,
        );

        const wasFlashing = entry.wasFlashing ?? false;
        if (b.hitFlashTimer > 0) {
          b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt);
        }
        const isFlashing = b.hitFlashTimer > 0;
        const hpRatio = b.maxHp > 0 ? Math.max(0, Math.min(1, b.hp / b.maxHp)) : 1;

        if (isFlashing || wasFlashing || hpRatio < 0.999) {
          let ix = 0;
          let iy = 0;
          let iz = 0;
          if (b.lastImpactPoint) {
            this._invQuat
              .set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
              .invert();
            this._vecA
              .set(
                b.lastImpactPoint.x - b.position.x,
                b.lastImpactPoint.y - b.position.y,
                b.lastImpactPoint.z - b.position.z,
              )
              .applyQuaternion(this._invQuat);
            ix = this._vecA.x;
            iy = this._vecA.y;
            iz = this._vecA.z;
          }
          const wearShade = b.material === 'glass' ? 1.0 : 0.72 + 0.28 * hpRatio;
          this.fortressBatch.setBlockDamageState(
            id,
            1 - hpRatio,
            ix,
            iy,
            iz,
            isFlashing ? 0.55 : 0,
            wearShade,
          );
        }
        entry.wasFlashing = isFlashing;
      } else if (entry.mesh) {
        entry.mesh.position.set(b.position.x, b.position.y, b.position.z);
        entry.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);

        // Update bird idle 3/4 hero turn + breathing in menu, wing flutter in flight & bomb fuse glow
        if (entry.birdVisual) {
          if (this.phase === 'title' && b === this.activeBirdBody && !b.launched) {
            entry.mesh.position.y = b.position.y + Math.sin(elapsed * 2.4) * 0.032;
            entry.mesh.rotation.y = 0.95 + Math.sin(elapsed * 0.85) * 0.14;
            entry.mesh.rotation.z = Math.sin(elapsed * 1.4) * 0.04;
            const idleFlap = Math.sin(elapsed * 2.4) * 0.06;
            entry.birdVisual.wingLeft.rotation.x = idleFlap;
            entry.birdVisual.wingRight.rotation.x = -idleFlap;
          } else {
            const speed = Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z);
            if (b.launched && speed > 2) {
              const flap = Math.sin(elapsed * 22) * 0.45;
              entry.birdVisual.wingLeft.rotation.x = flap;
              entry.birdVisual.wingRight.rotation.x = -flap;
            }
          }
          if (entry.birdVisual.fuseTip) {
            const pulse = 3.2 + Math.sin(elapsed * 26) * 1.1;
            const m = entry.birdVisual.fuseTip.material as THREE.MeshStandardMaterial;
            m.emissiveIntensity = pulse;
          }
        }

        // Dynamic Hero Bird Ability Scale & Emissive Roar / Afterburner Feedback
        const abilityPulse =
          b === this.activeBirdBody && b.kind === 'bird'
            ? this.vfx.getBirdAbilityVisualPulse(b.birdType)
            : { scaleMult: 1, emissiveHex: 0, emissiveIntensity: 0 };
        if (b.kind === 'bird') {
          entry.mesh.scale.setScalar(abilityPulse.scaleMult);
        }

        // Hit flash & structural stress weathering feedback
        if (b.hitFlashTimer > 0) {
          b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt);
          for (const m of entry.materials) {
            m.emissive.setHex(0xffffff);
            m.emissiveIntensity = 0.55;
          }
        } else if (abilityPulse.emissiveIntensity > 0.01) {
          for (const m of entry.materials) {
            m.emissive.setHex(abilityPulse.emissiveHex);
            m.emissiveIntensity = abilityPulse.emissiveIntensity;
          }
        } else {
          for (let i = 0; i < entry.materials.length; i++) {
            entry.materials[i].emissive.copy(entry.baseEmissives[i]);
            entry.materials[i].emissiveIntensity = 1.0;
          }
        }
      }

      // Instanced Ground Contact Shadow Disc (deterministic per-body Y offset avoids index-shift Z-fighting)
      if (entry.shadowDiameter && entry.shadowDiameter > 0 && shadowIdx < this.contactShadowCapacity) {
        const floorY = groundHeightAt(b.position.x, b.position.z);
        const halfH = b.kind === 'block' ? b.halfExtents.y : b.radius;
        const h = Math.max(0, b.position.y - floorY - halfH);
        const fade = Math.max(0.06, 1 - h / 6.5);
        const alpha = (b.kind === 'block' ? 0.24 : 0.46) * fade;
        const sc = entry.shadowDiameter * (1 + h * 0.14);
        const yOff = entry.contactShadowYOffset ?? 0;
        this._vecA.set(b.position.x, floorY + 0.042 + yOff, b.position.z);
        this._vecB.set(sc, 1, sc);
        this._dummy.matrix.compose(this._vecA, shadowQuat, this._vecB);
        this.contactShadowMesh.setMatrixAt(shadowIdx, this._dummy.matrix);
        this.contactShadowAlphas[shadowIdx] = alpha;
        shadowIdx++;
      }
    }

    this.contactShadowMesh.count = shadowIdx;
    this.contactShadowMesh.visible = shadowIdx > 0;
    if (shadowIdx > 0) {
      const needShadowUpload =
        this.contactShadowsDirty ||
        shadowIdx !== this.lastContactShadowCount ||
        this.isPulling ||
        Boolean(this.activeBirdBody?.launched) ||
        !worldSettled;
      if (needShadowUpload) {
        this.contactShadowMesh.instanceMatrix.needsUpdate = true;
        this.contactShadowAlphaAttr.needsUpdate = true;
        this.lastContactShadowCount = shadowIdx;
        this.contactShadowsDirty = false;
      }
    } else {
      this.lastContactShadowCount = 0;
      this.contactShadowsDirty = false;
    }
  }

  private updateCamera(dt: number): void {
    const fc = LEVEL_METADATA[this.levelIndex].fortressCenter;

    if (this.phase === 'title') {
      this.titleOrbitAngle += dt * 0.24;
      const pAlpha = 1 - Math.exp(-4.5 * dt);
      this.pointerParallax.lerp(this.pointerParallaxTarget, pAlpha);

      this.computeTitleCameraTargets(this._vecC, this._vecD);
      const swayX = Math.sin(this.titleOrbitAngle) * 0.55;
      const swayY = Math.sin(this.titleOrbitAngle * 0.72) * 0.18;
      const swayZ = Math.cos(this.titleOrbitAngle * 0.85) * 0.65;

      this.camPosTarget.set(
        this._vecC.x + swayX - this.pointerParallax.x * 0.35,
        this._vecC.y + swayY - this.pointerParallax.y * 0.32,
        this._vecC.z + swayZ + this.pointerParallax.x * 0.78,
      );
      this.camLookTarget.set(
        this._vecD.x,
        this._vecD.y - this.pointerParallax.y * 0.25,
        this._vecD.z + this.pointerParallax.x * 0.55,
      );
    } else if (this.cameraMode === 'inspect') {
      // Smooth WASD / Arrow camera pan in Free Camera mode
      const panSpeed = 22 * dt;
      this._vecA.set(0, 0, 0);
      this.camera.getWorldDirection(this._vecB);
      this._vecB.y = 0;
      if (this._vecB.lengthSq() > 0.0001) this._vecB.normalize();
      const right = this._dummy.position.crossVectors(this._vecB, this.camera.up).normalize();

      if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
        this._vecA.addScaledVector(this._vecB, panSpeed);
      }
      if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
        this._vecA.addScaledVector(this._vecB, -panSpeed);
      }
      if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) {
        this._vecA.addScaledVector(right, panSpeed);
      }
      if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) {
        this._vecA.addScaledVector(right, -panSpeed);
      }
      if (this._vecA.lengthSq() > 0) {
        this.camera.position.add(this._vecA);
        this.orbitControls.target.add(this._vecA);
      }

      this.orbitControls.update();
      // Keep free camera anchored safely above valley terrain
      this.orbitControls.target.x = THREE.MathUtils.clamp(this.orbitControls.target.x, -32, 34);
      this.orbitControls.target.y = THREE.MathUtils.clamp(this.orbitControls.target.y, 0.8, 16);
      this.orbitControls.target.z = THREE.MathUtils.clamp(this.orbitControls.target.z, -26, 26);
      if (this.camera.position.y < 1.2) this.camera.position.y = 1.2;
      return;
    } else if (this.cameraMode === 'follow' && this.activeBirdBody && this.activeBirdBody.launched) {
      const bx = this.activeBirdBody.position.x;
      const by = this.activeBirdBody.position.y;
      const bz = this.activeBirdBody.position.z;
      const lookX = THREE.MathUtils.clamp(bx + 6, -4, fc.x + 2);
      this.camPosTarget.set(
        THREE.MathUtils.clamp(bx - 10, -22, fc.x - 6),
        Math.max(4.8, by + 3.8),
        THREE.MathUtils.clamp(bz + 12.5, 9.5, 17),
      );
      this.camLookTarget.set(lookX, Math.max(2.0, by * 0.65 + 1.2), bz * 0.4);
    } else {
      // Aim mode: hero slingshot in lower-left foreground, fortress in right-center
      const pullRatio = this.isPulling ? this.pullOffset.length() / MAX_PULL_DIST : 0;
      this.camPosTarget.set(
        SLINGSHOT_ORIGIN.x - 11.2 - pullRatio * 1.1,
        6.2 + pullRatio * 0.45,
        14.5 + this.pullOffset.z * 0.4,
      );
      this.camLookTarget.set(-0.8, 3.1 - this.pullOffset.y * 0.35, -this.pullOffset.z * 1.4);
    }

    const alpha = 1 - Math.exp(-6.5 * dt);
    this.camPosCurrent.lerp(this.camPosTarget, alpha);
    this.camLookCurrent.lerp(this.camLookTarget, alpha);

    this.camera.position.copy(this.camPosCurrent);
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.55;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.position.z += (Math.random() - 0.5) * shake;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.9);
    }
    this.camera.lookAt(this.camLookCurrent);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    const maxDt = this.isSoftwareGl ? 0.085 : 0.05;
    const dt = Math.min(Math.max(rawDt, 0.001), maxDt);
    const elapsed = now * 0.001;
    this.blockMaterials.uTime.value = elapsed;

    // Update photorealistic environment wind, aerial perspective, and volumetric cloud dome
    const activeFogColor =
      this.scene.fog instanceof THREE.FogExp2
        ? this.scene.fog.color
        : this._hazeHorizonCurrent;
    this.envCleanup.update(
      elapsed,
      dt,
      this._sunDirCurrent,
      this.sunLight.color,
      activeFogColor,
      this._hazeHorizonCurrent,
      this._hazeZenithCurrent,
      this.camera.position,
    );

    if (this.phase === 'playing' && this.activeLevelDef) {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        if (dt > 0.045) {
          const half = dt * 0.5;
          const ev1 = stepPhysicsWorld(this.world, half);
          if (ev1.length > 0) this.processCollisionEvents(ev1);
          const ev2 = stepPhysicsWorld(this.world, half);
          if (ev2.length > 0) this.processCollisionEvents(ev2);
        } else {
          const events = stepPhysicsWorld(this.world, dt);
          if (events.length > 0) {
            this.processCollisionEvents(events);
          }
        }
        this.updateTurnLifecycle(dt);
      }
    }

    this.updateAtmosphereSmooth(dt);
    const worldSettled = this.phase === 'playing' ? isWorldSettled(this.world) : true;
    this.syncVisualsAndShadows(dt, elapsed, worldSettled);
    let obsCount = 0;
    for (const entry of this.visuals.values()) {
      const b = entry.body;
      if (b.alive && b.kind === 'block') {
        if (obsCount < this._obstacles.length) {
          const ob = this._obstacles[obsCount];
          ob.position = b.position;
          ob.halfExtents = b.halfExtents;
        } else {
          this._obstacles.push({ position: b.position, halfExtents: b.halfExtents });
        }
        obsCount++;
      }
    }
    this._obstacles.length = obsCount;
    if (this.activeBirdBody && this.activeBirdBody.launched && this.abilityUsed) {
      this.vfx.updateTrackedBirdAbility(
        this.activeBirdBody.position,
        this.activeBirdBody.velocity,
        this.activeBirdBody.birdType ?? null,
        this.activeBirdBody.alive,
      );
    } else {
      this.vfx.updateTrackedBirdAbility(null, null, null, false);
    }
    this.vfx.update(dt, elapsed, this.camera, this._obstacles);
    const acousticPulse = this.vfx.consumeDelayedCameraPulse();
    if (acousticPulse > 0) {
      this.cameraTrauma = Math.min(1, this.cameraTrauma + acousticPulse);
    }

    // Adaptive FPS governor on hardware GPUs (after initial warm-up): preserves full native HiDPI sharpness
    if (!this.isSoftwareGl && this.renderedFrames > 120 && rawDt > 0.001 && rawDt < 0.25) {
      this.perfFrames++;
      this.perfAccumMs += rawDt * 1000;
      if (this.perfFrames >= 60) {
        const avgMs = this.perfAccumMs / this.perfFrames;
        const maxDpr = Math.min(window.devicePixelRatio || 1, this.isMobileGpu ? 1.75 : 2.0);
        const minDpr = Math.min(maxDpr, this.isMobileGpu ? 1.25 : 1.5);
        if (avgMs > 26 && this.currentDpr > minDpr && now - this.lastDprAdjustMs > 2500) {
          this.currentDpr = Math.max(minDpr, Number((this.currentDpr - 0.15).toFixed(2)));
          this.renderer.setPixelRatio(this.currentDpr);
          this.renderer.setSize(this.viewW, this.viewH);
          this.composer?.setPixelRatio(this.currentDpr);
          this.composer?.setSize(this.viewW, this.viewH);
          this.lastDprAdjustMs = now;
        } else if (avgMs < 14.5 && this.currentDpr < maxDpr && now - this.lastDprAdjustMs > 2500) {
          this.currentDpr = Math.min(maxDpr, Number((this.currentDpr + 0.15).toFixed(2)));
          this.renderer.setPixelRatio(this.currentDpr);
          this.renderer.setSize(this.viewW, this.viewH);
          this.composer?.setPixelRatio(this.currentDpr);
          this.composer?.setSize(this.viewW, this.viewH);
          this.lastDprAdjustMs = now;
        }
        this.perfFrames = 0;
        this.perfAccumMs = 0;
      }
    }

    const viewW = this.viewW;
    const viewH = this.viewH;
    const activeHdrVfx = this.vfx.hasActiveHdrVfx();
    this.vfx.setEnvironmentContext(
      this._sunDirCurrent,
      activeHdrVfx && this.depthTarget ? this.depthTarget.depthTexture : null,
      this.camera.near,
      this.camera.far,
      viewW,
      viewH,
    );
    const exposure = Math.max(0.72, 1.06 + this.vfx.getExposureOffset());
    this.renderer.toneMappingExposure = exposure;
    if (this.bloomPass) {
      this.bloomPass.enabled = activeHdrVfx || this.hitstopTimer > 0;
    }
    if (this.lensPass) {
      const effW = Math.max(1, Math.floor(viewW * this.currentDpr));
      const effH = Math.max(1, Math.floor(viewH * this.currentDpr));
      this.lensPass.uniforms['uAspect'].value = viewW / Math.max(1, viewH);
      this.lensPass.uniforms['uTexelSize'].value.set(1 / effW, 1 / effH);
      this.lensPass.uniforms['toneMappingExposure'].value = exposure;
      this.vfx.getActiveShockwaveScreenData(
        this.camera,
        this.lensPass.uniforms['uShockwave'].value as THREE.Vector4,
      );
    }

    this.ambientAtmos.update(elapsed, this._moteColorCurrent.getHex());
    this.updateCamera(dt);

    // Conservative CPU Hi-Z + Frustum + Coverage Occlusion Culling (skip when camera & fortress are stationary)
    this.camera.updateMatrixWorld();
    this.currentViewProj.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    let camChanged = false;
    const curEl = this.currentViewProj.elements;
    const prevEl = this.lastCullViewProj.elements;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(curEl[i] - prevEl[i]) > 1e-5) {
        camChanged = true;
        break;
      }
    }
    if (this.blocksDirtyForCull || camChanged || !worldSettled || this.phase === 'title') {
      this.lastCullViewProj.copy(this.currentViewProj);
      this.blocksDirtyForCull = false;
      this.culler.beginFrame(this.camera, viewW, viewH);
      this.culler.addOccluderTriangles(this.envCleanup.getTerrainOccluderMesh());
      for (const entry of this.visuals.values()) {
        const b = entry.body;
        if (!b.alive || b.kind !== 'block' || b.material === 'glass') continue;
        const role = entry.blockRole;
        if (
          role === 'roof_wood' ||
          role === 'roof_stone' ||
          role === 'arch_stone' ||
          role === 'palisade' ||
          role === 'window_glass' ||
          role === 'lantern_glass'
        ) {
          continue;
        }
        const shrink = 0.84;
        this.culler.addOccluderBox(
          b.position.x,
          b.position.y,
          b.position.z,
          b.halfExtents.x * shrink,
          b.halfExtents.y * shrink,
          b.halfExtents.z * shrink,
          b.quaternion.x,
          b.quaternion.y,
          b.quaternion.z,
          b.quaternion.w,
        );
      }
      this.culler.finalizeOccluders();
      this.fortressBatch.updateOcclusion(this.culler);
      this.envCleanup.updateCulling(this.culler);
      this.waitingBirdGroup.visible = this.waitingBirdGroup.children.length > 0;
    }

    this.renderFrame(worldSettled);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private renderFrame(worldSettled = false): void {
    const activeShadowDebris = this.vfx.hasActiveShadowCasters();
    if (this.renderer.shadowMap.enabled) {
      const dynamicShadowNeeded =
        this.shadowDirtyFrames > 0 ||
        this.isPulling ||
        Boolean(this.activeBirdBody?.launched) ||
        this.vfx.hasActiveHdrVfx() ||
        activeShadowDebris ||
        !worldSettled;
      if (dynamicShadowNeeded) {
        this.renderer.shadowMap.needsUpdate = true;
        if (this.shadowDirtyFrames > 0) {
          this.shadowDirtyFrames--;
        }
      }
    }

    if (this.composer && !this.isSoftwareGl) {
      // Only run the half-res depth pre-pass when soft volumetric VFX are active (saves an entire scene pass every idle frame!)
      if (this.depthTarget && this.depthOverrideMat && this.vfx.hasActiveHdrVfx()) {
        const prevTarget = this.renderer.getRenderTarget();
        const prevSkyVisible = this.sky.visible;
        const prevVfxVisible = this.vfx.vfxGroup.visible;
        const prevTrajVisible = this.trajectoryDots.visible;
        const prevShadowEnabled = this.renderer.shadowMap.enabled;
        const prevShadowNeedsUpdate = this.renderer.shadowMap.needsUpdate;
        // CRITICAL: Never let the half-res depth pre-pass trigger or consume the directional shadow pass
        // while setDepthPassMode(true) has hidden foliagePool.mesh!
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.needsUpdate = false;
        this.sky.visible = false;
        this.envCleanup.setDepthPassMode(true);
        this.vfx.vfxGroup.visible = false;
        this.trajectoryDots.visible = false;
        this.scene.overrideMaterial = this.depthOverrideMat;
        this.renderer.setRenderTarget(this.depthTarget);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
        this.scene.overrideMaterial = null;
        this.sky.visible = prevSkyVisible;
        this.envCleanup.setDepthPassMode(false);
        this.vfx.vfxGroup.visible = prevVfxVisible;
        this.trajectoryDots.visible = prevTrajVisible;
        this.renderer.setRenderTarget(prevTarget);
        this.renderer.shadowMap.enabled = prevShadowEnabled;
        this.renderer.shadowMap.needsUpdate = prevShadowNeedsUpdate;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.renderedFrames++;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private emitHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmitMs < 95) return;
    this.lastHudEmitMs = now;

    const meta = LEVEL_METADATA[this.levelIndex];
    const pigsRemaining = this.activeLevelDef
      ? this.world.bodies.filter((b) => b.kind === 'pig' && b.alive).length
      : meta.pigCount;
    const pullMag = this.pullOffset.length();
    const pullPower = Math.round((pullMag / MAX_PULL_DIST) * 100);
    const pullAngleDeg = Math.round(
      THREE.MathUtils.radToDeg(
        Math.atan2(this.launchVelocity.y, Math.hypot(this.launchVelocity.x, this.launchVelocity.z)),
      ),
    );

    this.onHudChange({
      phase: this.phase,
      levelIndex: this.levelIndex,
      levelCount: LEVEL_COUNT,
      levelName: meta.name,
      levelSubtitle: meta.subtitle,
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScores[this.levelIndex]),
      stars: computeStars(this.score, meta.starThresholds),
      starThresholds: meta.starThresholds,
      pigsRemaining,
      pigsTotal: meta.pigCount,
      birdQueue: this.activeBirdBody?.launched ? [...this.birdQueue] : this.birdQueue.slice(1),
      activeBird: this.activeBirdBody?.birdType ?? null,
      abilityReady: Boolean(
        this.activeBirdBody && this.activeBirdBody.launched && !this.abilityUsed && this.activeBirdBody.alive,
      ),
      abilityUsed: this.abilityUsed,
      cameraMode: this.cameraMode,
      freeCamGesture: this.freeCamGesture,
      isPulling: this.isPulling,
      pullPower,
      pullAngleDeg,
      muted: this.audio.muted,
      unusedBirdBonus: this.unusedBirdBonus,
      highestUnlockedIndex: this.progress.highestUnlockedIndex,
      levelRecords: this.progress.records,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.clearLevelVisuals();
    this.fortressBatch.dispose();
    this.geoCache.dispose();
    this.contactShadowGeo.dispose();
    this.contactShadowMat.dispose();
    this.vfx.dispose();
    this.ambientAtmos.dispose();
    this.envCleanup.dispose();
    this.envMapRT?.dispose();
    this.textures.dispose();
    this.trajectoryDotGeo.dispose();
    this.trajectoryDotMat.dispose();
    this.blockMaterials.dispose();
    this.orbitControls.dispose();
    this.depthTarget?.dispose();
    this.depthOverrideMat?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
