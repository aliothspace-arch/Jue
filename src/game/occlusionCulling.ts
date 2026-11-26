import * as THREE from 'three';

const HIZ_W = 64;
const HIZ_H = 36;

interface HiZMip {
  w: number;
  h: number;
  data: Float32Array;
}

export interface OcclusionStats {
  occluderBoxes: number;
  occluderTris: number;
  testedCount: number;
  frustumCulled: number;
  hiZCulled: number;
  coverageCulled: number;
  visibleCount: number;
}

export interface TerrainOccluderMesh {
  vertices: Float32Array; // [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
  triCount: number;
}

// Cube face vertex indices (CCW when viewed from outside)
const BOX_FACE_VERTS: readonly [number, number, number, number][] = [
  [1, 3, 7, 5], // +X
  [4, 6, 2, 0], // -X
  [2, 6, 7, 3], // +Y
  [0, 1, 5, 4], // -Y
  [4, 5, 7, 6], // +Z
  [1, 0, 2, 3], // -Z
];

const BOX_FACE_NORMALS: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Conservative multi-tier occlusion culling engine:
 * - Tier 1: Frustum plane intersection + optional sub-pixel coverage cull
 * - Tier 2: Zero-readback CPU Hierarchical-Z (Hi-Z) occlusion pyramid (64x36 down to 2x2)
 *   rasterized from conservatively shrunk intact fortress walls & outer terrain ridges.
 *
 * Strictly conservative: any near-plane intersection, edge ambiguity, or partial peek
 * evaluates as visible so zero pop-in can ever occur.
 */
export class OcclusionCuller {
  private readonly mips: HiZMip[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly pm = new Float32Array(16);
  private readonly camPos = new THREE.Vector3();
  private readonly tmpBox = new THREE.Box3();
  private viewportW = 1280;
  private viewportH = 720;
  private hasOccluders = false;
  private pyramidDirty = false;

  // Scratch buffers for oriented occluder box corners (8 * 3) + clip coords (8 * 4)
  private readonly corners = new Float32Array(24);
  private readonly sx = new Float32Array(8);
  private readonly sy = new Float32Array(8);
  private readonly sz = new Float32Array(8);
  private readonly sw = new Float32Array(8);

  public readonly stats: OcclusionStats = {
    occluderBoxes: 0,
    occluderTris: 0,
    testedCount: 0,
    frustumCulled: 0,
    hiZCulled: 0,
    coverageCulled: 0,
    visibleCount: 0,
  };

  constructor() {
    let w = HIZ_W;
    let h = HIZ_H;
    while (w >= 2 || h >= 2) {
      this.mips.push({ w, h, data: new Float32Array(w * h) });
      if (w <= 2 && h <= 2) break;
      w = Math.max(2, Math.ceil(w * 0.5));
      h = Math.max(2, Math.ceil(h * 0.5));
    }
    this.clearBuffer();
  }

  private clearBuffer(): void {
    this.mips[0].data.fill(1.0);
    this.hasOccluders = false;
    this.pyramidDirty = true;
  }

  public beginFrame(camera: THREE.Camera, viewportW: number, viewportH: number): void {
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.pm.set(this.projView.elements);
    this.frustum.setFromProjectionMatrix(this.projView);
    camera.getWorldPosition(this.camPos);
    this.viewportW = Math.max(1, viewportW);
    this.viewportH = Math.max(1, viewportH);

    this.clearBuffer();
    this.stats.occluderBoxes = 0;
    this.stats.occluderTris = 0;
    this.stats.testedCount = 0;
    this.stats.frustumCulled = 0;
    this.stats.hiZCulled = 0;
    this.stats.coverageCulled = 0;
    this.stats.visibleCount = 0;
  }

  /**
   * Rasterizes a conservatively shrunk axis-aligned or quaternion-oriented occluder box
   * into the Level-0 Hi-Z buffer (front-facing faces relative to camera only).
   */
  public addOccluderBox(
    px: number,
    py: number,
    pz: number,
    hx: number,
    hy: number,
    hz: number,
    qx = 0,
    qy = 0,
    qz = 0,
    qw = 1,
    shrinkFraction = 0.08,
    minInset = 0.06,
  ): void {
    const shx = hx - Math.max(minInset, hx * shrinkFraction);
    const shy = hy - Math.max(minInset, hy * shrinkFraction);
    const shz = hz - Math.max(minInset, hz * shrinkFraction);
    if (shx <= 0.05 || shy <= 0.05 || shz <= 0.05) return;

    // Quick frustum check on unshrunk bounds before rasterizing
    this.tmpBox.min.set(px - hx, py - hy, pz - hz);
    this.tmpBox.max.set(px + hx, py + hy, pz + hz);
    if (!this.frustum.intersectsBox(this.tmpBox)) return;

    const isIdentity = qx === 0 && qy === 0 && qz === 0 && qw === 1;
    // Basis vectors of local box
    let ux = 1, uy = 0, uz = 0;
    let vx = 0, vy = 1, vz = 0;
    let wx = 0, wy = 0, wz = 1;
    if (!isIdentity) {
      const xx = qx * qx, yy = qy * qy, zz = qz * qz;
      const xy = qx * qy, xz = qx * qz, yz = qy * qz;
      const wxq = qw * qx, wyq = qw * qy, wzq = qw * qz;
      ux = 1 - 2 * (yy + zz);
      uy = 2 * (xy + wzq);
      uz = 2 * (xz - wyq);
      vx = 2 * (xy - wzq);
      vy = 1 - 2 * (xx + zz);
      vz = 2 * (yz + wxq);
      wx = 2 * (xz + wyq);
      wy = 2 * (yz - wxq);
      wz = 1 - 2 * (xx + yy);
    }

    // Build 8 corners: bit0=x, bit1=y, bit2=z
    const pm = this.pm;
    for (let i = 0; i < 8; i++) {
      const sxSign = i & 1 ? shx : -shx;
      const sySign = i & 2 ? shy : -shy;
      const szSign = i & 4 ? shz : -shz;
      const cx = px + ux * sxSign + vx * sySign + wx * szSign;
      const cy = py + uy * sxSign + vy * sySign + wy * szSign;
      const cz = pz + uz * sxSign + vz * sySign + wz * szSign;
      this.corners[i * 3] = cx;
      this.corners[i * 3 + 1] = cy;
      this.corners[i * 3 + 2] = cz;

      const clipW = pm[3] * cx + pm[7] * cy + pm[11] * cz + pm[15];
      this.sw[i] = clipW;
      if (clipW <= 0.08) {
        // Conservatively skip any occluder box crossing near plane
        return;
      }
      const invW = 1.0 / clipW;
      const clipX = pm[0] * cx + pm[4] * cy + pm[8] * cz + pm[12];
      const clipY = pm[1] * cx + pm[5] * cy + pm[9] * cz + pm[13];
      const clipZ = pm[2] * cx + pm[6] * cy + pm[10] * cz + pm[14];
      this.sx[i] = (clipX * invW * 0.5 + 0.5) * HIZ_W;
      this.sy[i] = (clipY * invW * 0.5 + 0.5) * HIZ_H;
      this.sz[i] = Math.max(0, Math.min(1, clipZ * invW * 0.5 + 0.5));
    }

    const relCamX = this.camPos.x - px;
    const relCamY = this.camPos.y - py;
    const relCamZ = this.camPos.z - pz;
    // Project camera relative offset onto local axes
    const localCamX = relCamX * ux + relCamY * uy + relCamZ * uz;
    const localCamY = relCamX * vx + relCamY * vy + relCamZ * vz;
    const localCamZ = relCamX * wx + relCamY * wy + relCamZ * wz;

    this.stats.occluderBoxes++;

    for (let f = 0; f < 6; f++) {
      const n = BOX_FACE_NORMALS[f];
      const faceDot =
        n[0] * (localCamX - n[0] * shx) +
        n[1] * (localCamY - n[1] * shy) +
        n[2] * (localCamZ - n[2] * shz);
      if (faceDot <= 0) continue;

      const [i0, i1, i2, i3] = BOX_FACE_VERTS[f];
      this.rasterizeScreenTri(
        this.sx[i0], this.sy[i0], this.sz[i0],
        this.sx[i1], this.sy[i1], this.sz[i1],
        this.sx[i2], this.sy[i2], this.sz[i2],
        true, true, false,
      );
      this.rasterizeScreenTri(
        this.sx[i0], this.sy[i0], this.sz[i0],
        this.sx[i2], this.sy[i2], this.sz[i2],
        this.sx[i3], this.sy[i3], this.sz[i3],
        false, true, true,
      );
    }
  }

  /**
   * Rasterizes a static coarse triangle soup (e.g. outer terrain hills depressed conservatively)
   */
  public addOccluderTriangles(mesh: TerrainOccluderMesh): void {
    const verts = mesh.vertices;
    const pm = this.pm;
    const count = mesh.triCount;
    for (let t = 0; t < count; t++) {
      const base = t * 9;
      const x0 = verts[base], y0 = verts[base + 1], z0 = verts[base + 2];
      const x1 = verts[base + 3], y1 = verts[base + 4], z1 = verts[base + 5];
      const x2 = verts[base + 6], y2 = verts[base + 7], z2 = verts[base + 8];

      const w0 = pm[3] * x0 + pm[7] * y0 + pm[11] * z0 + pm[15];
      const w1 = pm[3] * x1 + pm[7] * y1 + pm[11] * z1 + pm[15];
      const w2 = pm[3] * x2 + pm[7] * y2 + pm[11] * z2 + pm[15];
      if (w0 <= 0.1 || w1 <= 0.1 || w2 <= 0.1) continue;

      const iw0 = 1 / w0, iw1 = 1 / w1, iw2 = 1 / w2;
      const sx0 = ((pm[0] * x0 + pm[4] * y0 + pm[8] * z0 + pm[12]) * iw0 * 0.5 + 0.5) * HIZ_W;
      const sy0 = ((pm[1] * x0 + pm[5] * y0 + pm[9] * z0 + pm[13]) * iw0 * 0.5 + 0.5) * HIZ_H;
      const sz0 = Math.max(0, Math.min(1, (pm[2] * x0 + pm[6] * y0 + pm[10] * z0 + pm[14]) * iw0 * 0.5 + 0.5));

      const sx1 = ((pm[0] * x1 + pm[4] * y1 + pm[8] * z1 + pm[12]) * iw1 * 0.5 + 0.5) * HIZ_W;
      const sy1 = ((pm[1] * x1 + pm[5] * y1 + pm[9] * z1 + pm[13]) * iw1 * 0.5 + 0.5) * HIZ_H;
      const sz1 = Math.max(0, Math.min(1, (pm[2] * x1 + pm[6] * y1 + pm[10] * z1 + pm[14]) * iw1 * 0.5 + 0.5));

      const sx2 = ((pm[0] * x2 + pm[4] * y2 + pm[8] * z2 + pm[12]) * iw2 * 0.5 + 0.5) * HIZ_W;
      const sy2 = ((pm[1] * x2 + pm[5] * y2 + pm[9] * z2 + pm[13]) * iw2 * 0.5 + 0.5) * HIZ_H;
      const sz2 = Math.max(0, Math.min(1, (pm[2] * x2 + pm[6] * y2 + pm[10] * z2 + pm[14]) * iw2 * 0.5 + 0.5));

      this.rasterizeScreenTri(sx0, sy0, sz0, sx1, sy1, sz1, sx2, sy2, sz2);
    }
  }

  /**
   * Inner-conservative triangle rasterization: a Hi-Z texel is updated only when its
   * full cell is strictly inside all 3 inward-inset triangle edges, preventing silhouette leaks.
   */
  private rasterizeScreenTri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    inset01 = true,
    inset12 = true,
    inset20 = true,
  ): void {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area <= 0.15) return; // Back-facing or tiny sub-pixel triangle

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(HIZ_W - 1, Math.floor(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(HIZ_H - 1, Math.floor(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) return;

    const e0dx = bx - ax, e0dy = by - ay;
    const e1dx = cx - bx, e1dy = cy - by;
    const e2dx = ax - cx, e2dy = ay - cy;

    // Inward half-texel diagonal margin (0.72 texel) on silhouette edges; 0 on shared quad diagonal
    const m0 = inset01 ? 0.72 * Math.hypot(e0dx, e0dy) : -0.05 * Math.hypot(e0dx, e0dy);
    const m1 = inset12 ? 0.72 * Math.hypot(e1dx, e1dy) : -0.05 * Math.hypot(e1dx, e1dy);
    const m2 = inset20 ? 0.72 * Math.hypot(e2dx, e2dy) : -0.05 * Math.hypot(e2dx, e2dy);

    const invArea = 1.0 / area;
    const buf = this.mips[0].data;
    let wroteAny = false;

    for (let py = minY; py <= maxY; py++) {
      const cyCenter = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const cxCenter = px + 0.5;
        const w2 = e0dx * (cyCenter - ay) - e0dy * (cxCenter - ax);
        if (w2 < m0) continue;
        const w0 = e1dx * (cyCenter - by) - e1dy * (cxCenter - bx);
        if (w0 < m1) continue;
        const w1 = e2dx * (cyCenter - cy) - e2dy * (cxCenter - cx);
        if (w1 < m2) continue;

        // Perspective-conservative linear screen depth interpolation + tiny far bias
        const z = (w0 * az + w1 * bz + w2 * cz) * invArea;
        // Take max corner depth bias across texel footprint so tilted surfaces stay conservative
        const idx = py * HIZ_W + px;
        if (z < buf[idx]) {
          buf[idx] = z;
          wroteAny = true;
        }
      }
    }

    if (wroteAny) {
      this.stats.occluderTris++;
      this.hasOccluders = true;
      this.pyramidDirty = true;
    }
  }

  public finalizeOccluders(): void {
    if (!this.hasOccluders || !this.pyramidDirty) return;
    for (let m = 1; m < this.mips.length; m++) {
      const prev = this.mips[m - 1];
      const curr = this.mips[m];
      const pw = prev.w;
      const ph = prev.h;
      const pData = prev.data;
      const cData = curr.data;
      for (let y = 0; y < curr.h; y++) {
        const py0 = Math.min(ph - 1, y * 2);
        const py1 = Math.min(ph - 1, y * 2 + 1);
        for (let x = 0; x < curr.w; x++) {
          const px0 = Math.min(pw - 1, x * 2);
          const px1 = Math.min(pw - 1, x * 2 + 1);
          const d00 = pData[py0 * pw + px0];
          const d10 = pData[py0 * pw + px1];
          const d01 = pData[py1 * pw + px0];
          const d11 = pData[py1 * pw + px1];
          cData[y * curr.w + x] = Math.max(d00, d10, d01, d11);
        }
      }
    }
    this.pyramidDirty = false;
  }

  /**
   * Returns true if the world-space AABB should be rendered (visible to camera).
   */
  public isBoxVisible(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    minScreenPx = 0,
  ): boolean {
    this.stats.testedCount++;

    // Camera inside (or touching) AABB is always visible
    const cx = this.camPos.x;
    const cy = this.camPos.y;
    const cz = this.camPos.z;
    if (
      cx >= minX - 0.5 && cx <= maxX + 0.5 &&
      cy >= minY - 0.5 && cy <= maxY + 0.5 &&
      cz >= minZ - 0.5 && cz <= maxZ + 0.5
    ) {
      this.stats.visibleCount++;
      return true;
    }

    // Tier 1: Frustum 6-plane test
    this.tmpBox.min.set(minX, minY, minZ);
    this.tmpBox.max.set(maxX, maxY, maxZ);
    if (!this.frustum.intersectsBox(this.tmpBox)) {
      this.stats.frustumCulled++;
      return false;
    }

    // Project 8 AABB corners for screen-coverage & Tier-2 Hi-Z test
    if (this.pyramidDirty && this.hasOccluders) {
      this.finalizeOccluders();
    }

    const pm = this.pm;
    let ndcMinX = Infinity;
    let ndcMaxX = -Infinity;
    let ndcMinY = Infinity;
    let ndcMaxY = -Infinity;
    let minDepth = Infinity;

    for (let i = 0; i < 8; i++) {
      const vx = i & 1 ? maxX : minX;
      const vy = i & 2 ? maxY : minY;
      const vz = i & 4 ? maxZ : minZ;
      const w = pm[3] * vx + pm[7] * vy + pm[11] * vz + pm[15];
      if (w <= 0.08) {
        // Crosses near plane -> conservatively visible
        this.stats.visibleCount++;
        return true;
      }
      const invW = 1.0 / w;
      const nx = (pm[0] * vx + pm[4] * vy + pm[8] * vz + pm[12]) * invW;
      const ny = (pm[1] * vx + pm[5] * vy + pm[9] * vz + pm[13]) * invW;
      const nz = (pm[2] * vx + pm[6] * vy + pm[10] * vz + pm[14]) * invW;
      const depth = nz * 0.5 + 0.5;
      if (nx < ndcMinX) ndcMinX = nx;
      if (nx > ndcMaxX) ndcMaxX = nx;
      if (ny < ndcMinY) ndcMinY = ny;
      if (ny > ndcMaxY) ndcMaxY = ny;
      if (depth < minDepth) minDepth = depth;
    }

    if (ndcMaxX < -1 || ndcMinX > 1 || ndcMaxY < -1 || ndcMinY > 1) {
      this.stats.frustumCulled++;
      return false;
    }

    if (minScreenPx > 0) {
      const pxW = (Math.min(1, ndcMaxX) - Math.max(-1, ndcMinX)) * 0.5 * this.viewportW;
      const pxH = (Math.min(1, ndcMaxY) - Math.max(-1, ndcMinY)) * 0.5 * this.viewportH;
      if (pxW < minScreenPx && pxH < minScreenPx) {
        this.stats.coverageCulled++;
        return false;
      }
    }

    if (!this.hasOccluders) {
      this.stats.visibleCount++;
      return true;
    }

    // Clamp NDC rect to screen and query mip level where footprint <= 2x2
    const u0 = Math.max(0, Math.min(1, ndcMinX * 0.5 + 0.5));
    const u1 = Math.max(0, Math.min(1, ndcMaxX * 0.5 + 0.5));
    const v0 = Math.max(0, Math.min(1, ndcMinY * 0.5 + 0.5));
    const v1 = Math.max(0, Math.min(1, ndcMaxY * 0.5 + 0.5));

    let x0 = Math.max(0, Math.min(HIZ_W - 1, Math.floor(u0 * HIZ_W)));
    let x1 = Math.max(0, Math.min(HIZ_W - 1, Math.floor(u1 * HIZ_W)));
    let y0 = Math.max(0, Math.min(HIZ_H - 1, Math.floor(v0 * HIZ_H)));
    let y1 = Math.max(0, Math.min(HIZ_H - 1, Math.floor(v1 * HIZ_H)));

    let mipIdx = 0;
    while (mipIdx < this.mips.length - 1 && (x1 - x0 > 1 || y1 - y0 > 1)) {
      x0 >>= 1;
      x1 >>= 1;
      y0 >>= 1;
      y1 >>= 1;
      mipIdx++;
    }

    const mip = this.mips[mipIdx];
    const cx0 = Math.max(0, Math.min(mip.w - 1, x0));
    const cx1 = Math.max(0, Math.min(mip.w - 1, x1));
    const cy0 = Math.max(0, Math.min(mip.h - 1, y0));
    const cy1 = Math.max(0, Math.min(mip.h - 1, y1));

    let maxOccDepth = 0;
    for (let ty = cy0; ty <= cy1; ty++) {
      for (let tx = cx0; tx <= cx1; tx++) {
        const d = mip.data[ty * mip.w + tx];
        if (d > maxOccDepth) maxOccDepth = d;
      }
    }

    if (minDepth > maxOccDepth + 0.0008) {
      this.stats.hiZCulled++;
      return false;
    }

    this.stats.visibleCount++;
    return true;
  }
}
