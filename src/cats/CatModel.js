import * as THREE from 'three';
import { mergeGeometries } from '../util/bake.js';

// Cat-local layout: the cat faces +Z, origin on the ground between its feet. Sizes in metres:
// a stylised, big-headed cat (head radius 8.5 cm) that still reads as a real cat.
export const LEG = 0.11;                           // shoulder/hip joint to ground when standing
export const BODY_C = new THREE.Vector3(0, 0.02, 0.07);       // in spine space
export const BODY_R = new THREE.Vector3(0.085, 0.078, 0.155);
export const HEAD_R = 0.085;
const TAIL_N = 8, TAIL_SEG = 0.032;
const FRONT_J = new THREE.Vector3(0.045, -0.03, 0.16), HIND_J = new THREE.Vector3(0.05, -0.03, 0.0);

/** Smooth pseudo-noise for coat patches (calico), seeded per cat. */
function patchNoise(p, s) {
  return Math.sin(p.x * 31 + s) * Math.cos(p.z * 23 - s * 1.7) + Math.sin(p.y * 37 + p.z * 11 + s * 2.3) * 0.6 + Math.sin((p.x - p.z) * 17 + s * 0.4) * 0.5;
}

/**
 * Builds a whole cat as ONE skinned, vertex-coloured mesh (one draw call): rigid parts (body,
 * head, ears, eyes, legs, tail segments, collar) are each bound to a bone, and poses are made by
 * rotating bones. Big glossy anime-style eyes with two highlights, blush marks on the cheeks.
 * coat: { pattern: 'tabby'|'calico'|'tuxedo'|'solid', fur, stripe?, patch?, patch2?, white, eye, collar }
 */
export class CatModel {
  constructor(coat, seed = 1) {
    this.coat = coat;
    this.seed = seed;
    this.group = new THREE.Group();
    this._buildSkeleton();
    this._buildMesh();
    this.blink = 1;
  }

  _bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name; b.position.set(x, y, z);
    (parent ?? this.group).add(b);
    this.bones.push(b);
    this.b[name] = b;
    return b;
  }

  _buildSkeleton() {
    this.bones = []; this.b = {};
    const root = this._bone('root', null, 0, 0, 0);
    const spine = this._bone('spine', root, 0, 0.14, -0.07);
    const neck = this._bone('neck', spine, 0, 0.06, 0.15);
    const head = this._bone('head', neck, 0, 0.065, 0.045);
    this._bone('earL', head, 0.052, 0.058, -0.005).rotation.z = -0.35;
    this._bone('earR', head, -0.052, 0.058, -0.005).rotation.z = 0.35;
    this._bone('eyes', head, 0, 0.004, 0.071);
    this._bone('legFL', spine, FRONT_J.x, FRONT_J.y, FRONT_J.z);
    this._bone('legFR', spine, -FRONT_J.x, FRONT_J.y, FRONT_J.z);
    this._bone('legHL', spine, HIND_J.x, HIND_J.y, HIND_J.z);
    this._bone('legHR', spine, -HIND_J.x, HIND_J.y, HIND_J.z);
    this.tail = [];
    let parent = spine;
    for (let i = 0; i < TAIL_N; i++) {
      const t = i === 0 ? this._bone('tail0', spine, 0, 0.05, -0.135) : this._bone(`tail${i}`, parent, 0, 0, -TAIL_SEG);
      this.tail.push(t); parent = t;
    }
    this.group.updateMatrixWorld(true);
  }

  /** Vertex colour for a part at bind-pose position p (cat space). */
  _color(part, p, out) {
    const c = this.coat, fur = c.fur, white = c.white ?? '#ffffff';
    const fixed = { nose: '#f2a0b0', earInner: '#f7b8c6', iris: c.eye ?? '#7fbf6a', pupil: '#2b2230', shine: '#ffffff', blush: '#f7a1b8', collar: c.collar ?? '#f6a9bb', tag: '#f2cf6b', mouth: '#5a4048' };
    if (fixed[part]) return out.set(fixed[part]);
    // body-space helpers
    const isBelly = part === 'body' && p.y < 0.12 && p.z > -0.12;
    const isChest = (part === 'body' || part === 'neck') && p.z > 0.1 && p.y < 0.2;
    const isMuzzle = part === 'muzzle';
    const isPaw = part === 'paw';
    switch (c.pattern) {
      case 'tabby': {
        if (isMuzzle || isPaw || isBelly || isChest) return out.set(white);
        const stripe = c.stripe ?? '#8a5a3a';
        if (part === 'body' && p.y > 0.13 && Math.sin(p.z * 70 + Math.abs(p.x) * 30) > 0.35) return out.set(stripe);
        if (part === 'head' && p.y > 0.3 && p.z > 0.12 && Math.sin(p.x * 140) > 0.4) return out.set(stripe);
        if (part === 'head' && Math.abs(p.y - 0.255) < 0.03 && Math.abs(p.x) > 0.07 && Math.sin(p.y * 260) > 0.2) return out.set(stripe);
        if (part === 'tail' && Math.sin(p.z * 90) > 0.3) return out.set(stripe);
        if (part === 'leg' && Math.sin(p.y * 160) > 0.55) return out.set(stripe);
        return out.set(fur);
      }
      case 'calico': {
        if (isMuzzle || isPaw || isBelly) return out.set(white);
        if (part === 'ear') return out.set(p.x > 0 ? c.patch : c.patch2);
        const n = patchNoise(p, this.seed);
        if (n > 0.55) return out.set(c.patch);
        if (n < -0.75) return out.set(c.patch2);
        return out.set(fur);
      }
      case 'tuxedo': {
        if (isMuzzle || isPaw || isChest || (part === 'body' && p.y < 0.1)) return out.set(white);
        if (part === 'head' && p.z > 0.17 && p.y < 0.25) return out.set(white);
        if (part === 'tail' && p.z < -0.38) return out.set(white);
        return out.set(fur);
      }
      default: {
        if (isMuzzle || isPaw) return out.set(white);
        if (isBelly || isChest) return out.copy(new THREE.Color(fur).lerp(new THREE.Color(white), 0.5));
        return out.set(fur);
      }
    }
  }

  _buildMesh() {
    const geos = [], col = new THREE.Color(), v = new THREE.Vector3();
    const part = (boneName, partName, geo, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
      const bone = this.b[boneName], idx = this.bones.indexOf(bone);
      let g = geo.index ? geo.toNonIndexed() : geo;
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, local));
      const n = g.attributes.position.count, cols = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      const pname = typeof partName === 'function' ? null : partName;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(g.attributes.position, i);
        this._color(pname ?? partName(v), v, col);
        cols.set([col.r, col.g, col.b], i * 3);
        si[i * 4] = idx; sw[i * 4] = 1;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geos.push(g);
    };
    const S = (r = 1, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);

    // body + haunches + chest fluff
    part('spine', 'body', S(1, 28, 18), BODY_C.x, BODY_C.y, BODY_C.z, { sx: BODY_R.x, sy: BODY_R.y, sz: BODY_R.z });
    for (const sx of [-1, 1]) part('spine', 'body', S(0.058, 16, 12), sx * 0.052, -0.005, -0.04, { sz: 1.25 });
    part('neck', 'neck', S(0.05, 16, 12), 0, 0.015, 0.01);
    part('neck', 'collar', new THREE.TorusGeometry(0.047, 0.008, 6, 20), 0, 0.02, 0.012, { rx: Math.PI / 2 - 0.55 });
    part('neck', 'tag', new THREE.CylinderGeometry(0.011, 0.011, 0.004, 12), 0, -0.012, 0.055, { rx: Math.PI / 2 - 0.4 });

    // head: big round skull, cheeks, muzzle, nose, blush, mouth
    part('head', 'head', S(HEAD_R, 30, 20), 0, 0, 0, { sx: 1.08, sy: 0.95, sz: 0.95 });
    for (const sx of [-1, 1]) {
      part('head', 'head', S(0.04, 14, 10), sx * 0.052, -0.03, 0.035, { sz: 0.8 });                // cheek fluff
      part('head', 'muzzle', S(0.022, 14, 10), sx * 0.016, -0.03, 0.07);
      part('head', 'blush', S(1, 12, 8), sx * 0.056, -0.022, 0.06, { sx: 0.017, sy: 0.009, sz: 0.004, ry: sx * 0.78 });
    }
    part('head', 'nose', S(1, 12, 8), 0, -0.014, 0.084, { sx: 0.011, sy: 0.008, sz: 0.007 });
    for (const sx of [-1, 1]) part('head', 'mouth', new THREE.TorusGeometry(0.007, 0.0016, 4, 10, Math.PI), sx * 0.007, -0.034, 0.09, { rz: Math.PI, rx: -0.3 });
    // ears
    for (const [bn, sx] of [['earL', 1], ['earR', -1]]) {
      part(bn, 'ear', new THREE.ConeGeometry(0.034, 0.06, 14), 0, 0.026, 0, { sz: 0.6 });
      part(bn, 'earInner', new THREE.ConeGeometry(0.021, 0.04, 12), 0, 0.02, 0.008, { sz: 0.35 });
      void sx;
    }
    // eyes: big oval irises, large pupils, two highlights each
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034, ry = sx * 0.32;
      part('eyes', 'iris', S(0.021, 18, 14), ex, 0, 0, { sy: 1.25, sz: 0.5, ry });
      part('eyes', 'pupil', S(0.0145, 16, 12), ex + sx * 0.0012, -0.002, 0.004, { sy: 1.3, sz: 0.5, ry });
      part('eyes', 'shine', S(0.0062, 10, 8), ex + 0.007, 0.01, 0.0105, { sz: 0.5 });
      part('eyes', 'shine', S(0.0032, 8, 6), ex - 0.006, -0.009, 0.0105, { sz: 0.5 });
    }
    // legs + paws
    for (const bn of ['legFL', 'legFR', 'legHL', 'legHR']) {
      const hind = bn.startsWith('legH');
      part(bn, 'leg', new THREE.CapsuleGeometry(hind ? 0.024 : 0.021, 0.07, 4, 10), 0, -0.056, 0);
      if (hind) part(bn, 'leg', S(0.032, 12, 10), 0, -0.02, -0.005, { sz: 1.2 });
      part(bn, 'paw', S(0.026, 12, 10), 0, -0.095, 0.008, { sy: 0.7, sz: 1.25 });
    }
    // tail: tapering capsules along each bone's -Z
    this.tail.forEach((t, i) => {
      const r = 0.019 - i * 0.0009;
      part(`tail${i}`, 'tail', new THREE.CapsuleGeometry(r, TAIL_SEG, 4, 10).rotateX(Math.PI / 2), 0, 0, -TAIL_SEG / 2);
    });

    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.add(this.b.root);
    this.group.add(this.mesh);
    this.group.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
  }

  /** Leg angle (from vertical, + = backward) that puts the paw on the ground for a joint at height h. */
  static plant(h) { return Math.acos(THREE.MathUtils.clamp(h / LEG, 0, 1)); }

  /** World-space-ish height of a spine-space point for a given spine height and pitch. */
  static jointHeight(spineY, pitch, j) { return spineY + j.y * Math.cos(pitch) - j.z * Math.sin(pitch); }

  /**
   * Poses the skeleton. P: { spineY, spinePitch, spineRoll, neckPitch, neckYaw, headTilt,
   *   front: number|null (null = planted), hind: number|null, frontL, frontR (extra), tailUp, tailCurlX, tailCurlY,
   *   eyeOpen, earBack }, plus gait (0..1), phase (walk cycle), t (time), tailSway (amplitude).
   */
  apply(P, { gait = 0, phase = 0, t = 0, sway = 0.25, swayFreq = 1.2, twitch = [0, 0] } = {}) {
    const b = this.b;
    b.spine.position.y = P.spineY;
    b.spine.rotation.set(P.spinePitch, 0, P.spineRoll);
    b.neck.rotation.set(P.neckPitch - P.spinePitch * 0.85, P.neckYaw, 0, 'YXZ');
    b.head.rotation.z = P.headTilt;

    const fH = CatModel.jointHeight(P.spineY, P.spinePitch, FRONT_J), hH = CatModel.jointHeight(P.spineY, P.spinePitch, HIND_J);
    const front = P.front ?? -CatModel.plant(fH), hind = P.hind ?? CatModel.plant(hH);
    const swing = Math.sin(phase) * 0.5 * gait;
    b.legFL.rotation.x = front + swing + P.frontL - P.spinePitch;
    b.legFR.rotation.x = front - swing + P.frontR - P.spinePitch;
    b.legHL.rotation.x = hind - swing - P.spinePitch;
    b.legHR.rotation.x = hind + swing - P.spinePitch;

    this.tail.forEach((j, i) => {
      const s = Math.sin(t * swayFreq - i * 0.6) * sway * (0.3 + i / TAIL_N);
      if (i === 0) { j.rotation.set(P.tailUp - P.spinePitch * 0.5, s * 0.5, 0, 'YXZ'); return; }
      j.rotation.set(P.tailCurlX, P.tailCurlY + s, 0, 'YXZ');
    });
    b.earL.rotation.x = -P.earBack - twitch[0] * 0.6; b.earR.rotation.x = -P.earBack - twitch[1] * 0.6;
    b.earL.rotation.y = twitch[0] * 0.4; b.earR.rotation.y = -twitch[1] * 0.4;
    b.eyes.scale.y = Math.max(0.06, P.eyeOpen * this.blink);
  }
}

/** Pose presets; front/hind = null means "plant the paws on the ground". */
export const POSES = {
  stand: { spineY: 0.14, spinePitch: 0, spineRoll: 0, neckPitch: 0, neckYaw: 0, headTilt: 0, front: null, hind: null, frontL: 0, frontR: 0, tailUp: 1.0, tailCurlX: -0.12, tailCurlY: 0, eyeOpen: 1, earBack: 0 },
  sit: { spineY: 0.052, spinePitch: -0.62, spineRoll: 0, neckPitch: 0.05, neckYaw: 0, headTilt: 0, front: null, hind: -1.25, frontL: 0, frontR: 0, tailUp: 0.15, tailCurlX: -0.04, tailCurlY: 0.28, eyeOpen: 1, earBack: 0 },
  loaf: { spineY: 0.074, spinePitch: 0, spineRoll: 0, neckPitch: 0.1, neckYaw: 0, headTilt: 0, front: -1.45, hind: -1.3, frontL: 0, frontR: 0, tailUp: -0.25, tailCurlX: 0, tailCurlY: 0.32, eyeOpen: 0.75, earBack: 0 },
  nap: { spineY: 0.07, spinePitch: 0, spineRoll: 0.22, neckPitch: 0.65, neckYaw: 1.15, headTilt: 0.45, front: -1.45, hind: -1.3, frontL: 0, frontR: 0, tailUp: -0.35, tailCurlX: 0, tailCurlY: 0.45, eyeOpen: 0.05, earBack: 0.1 },
  groom: { spineY: 0.052, spinePitch: -0.62, spineRoll: 0, neckPitch: 0.4, neckYaw: 0.35, headTilt: 0.2, front: null, hind: -1.25, frontL: -1.9, frontR: 0, tailUp: 0.15, tailCurlX: -0.04, tailCurlY: 0.28, eyeOpen: 0.15, earBack: 0 },
  crouch: { spineY: 0.095, spinePitch: 0.1, spineRoll: 0, neckPitch: -0.15, neckYaw: 0, headTilt: 0, front: null, hind: null, frontL: 0, frontR: 0, tailUp: 0.15, tailCurlX: 0.03, tailCurlY: 0, eyeOpen: 1.15, earBack: 0.15 },
  eat: { spineY: 0.105, spinePitch: 0.3, spineRoll: 0, neckPitch: 1.0, neckYaw: 0, headTilt: 0, front: null, hind: null, frontL: 0, frontR: 0, tailUp: 0.7, tailCurlX: -0.1, tailCurlY: 0, eyeOpen: 0.6, earBack: 0 },
  rear: { spineY: 0.105, spinePitch: -1.15, spineRoll: 0, neckPitch: -0.2, neckYaw: 0, headTilt: 0, front: -1.2, hind: null, frontL: 0, frontR: 0, tailUp: 0.6, tailCurlX: 0, tailCurlY: 0, eyeOpen: 1.1, earBack: 0 },
  leap: { spineY: 0.14, spinePitch: -0.2, spineRoll: 0, neckPitch: -0.1, neckYaw: 0, headTilt: 0, front: -1.1, hind: 0.9, frontL: 0, frontR: 0, tailUp: 0.35, tailCurlX: 0, tailCurlY: 0, eyeOpen: 1.1, earBack: 0.1 },
};
