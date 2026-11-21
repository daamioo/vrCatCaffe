import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { CanvasPanel } from '../ui/CanvasPanel.js';
import { paw } from './textures.js';
import { bake } from '../util/bake.js';

const _l = new THREE.Vector3();
const SEGMENTS = 12;
const OFF = new THREE.Color('#e9d3da'), ON = new THREE.Color('#f6a9bb'), DONE = new THREE.Color('#97d1bb');

class ResetSign extends CanvasPanel {
  constructor() { super(0.3, 0.12, 900); this.redraw(); }
  draw(g, w, h) {
    g.fillStyle = '#fff6e6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f6a9bb'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#c4637f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${h * 0.32}px "Comic Sans MS", cursive, sans-serif`; g.fillText('OD NOWA', w / 2, h * 0.4);
    g.fillStyle = '#7a6a70'; g.font = `${h * 0.16}px "Comic Sans MS", cursive, sans-serif`; g.fillText('wciśnij i przytrzymaj 1 s', w / 2, h * 0.76);
    g.fillStyle = '#f6a9bb'; paw(g, h * 0.35, h * 0.5, h * 0.18); paw(g, w - h * 0.35, h * 0.5, h * 0.18);
  }
}

/**
 * A big round paw-print button on the wall that puts the café back to its starting state
 * (CafeFactory.resetRoom): toys and bowls back in place, treats tidied away, cats back on their
 * spots. Physical: push it in with your fingertip (or click and hold on desktop) and keep it
 * pressed — a ring fills up over `holdS` seconds, then the café resets. Letting go early cancels.
 * The ring fills as you hold it (driven by your hand, no blinking). The radio keeps playing.
 * def: { position, rotationY, holdS = 1 }
 */
export class ResetButton extends Entity {
  constructor(world, def) {
    super(world);
    this.def = def;
    this.persistent = true;
    this.holdS = def.holdS ?? 1;
    this.progress = 0; this.depth = 0; this.locked = false;
    this.travel = 0.012; this.capR = 0.04;
    this.object3D.position.set(...(def.position ?? [0, 1.2, 0]));
    this.object3D.rotation.y = THREE.MathUtils.degToRad(def.rotationY ?? 0);

    // local frame: +Z points out of the wall toward the player
    const plate = new THREE.MeshLambertMaterial({ color: '#bfe6d6' });
    const ringMat = new THREE.MeshLambertMaterial({ color: '#fff6e6' });
    const add = (geo, mat, x, y, z, parent = this.object3D) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 32).rotateX(Math.PI / 2), plate, 0, 0, 0.015);
    add(new THREE.TorusGeometry(0.05, 0.007, 8, 32), ringMat, 0, 0, 0.032);
    this.cap = new THREE.Group();
    this.cap.position.z = 0.032;
    this.capMat = new THREE.MeshLambertMaterial({ color: '#f6a9bb', emissive: 0x000000 });
    const dome = add(new THREE.SphereGeometry(this.capR, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), this.capMat, 0, 0, 0.012, this.cap);
    dome.scale.z = 0.55;
    const padMat = new THREE.MeshLambertMaterial({ color: '#fff6e6' });
    add(new THREE.SphereGeometry(0.013, 12, 8).scale(1.2, 1, 0.4), padMat, 0, -0.008, 0.033, this.cap);
    for (const [x, y] of [[-0.016, 0.01], [-0.006, 0.019], [0.006, 0.019], [0.016, 0.01]]) add(new THREE.SphereGeometry(0.005, 8, 6).scale(1, 1.2, 0.5), padMat, x, y, 0.031, this.cap);
    this.object3D.add(this.cap);
    // progress ring: one mesh, a vertex-coloured segment per step
    const geos = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = -(i / SEGMENTS) * Math.PI * 2 + Math.PI / 2;
      const g = new THREE.BoxGeometry(0.014, 0.007, 0.004).toNonIndexed().rotateZ(a + Math.PI / 2).translate(Math.cos(a) * 0.068, Math.sin(a) * 0.068, 0.032);
      g.userData.seg = i;
      geos.push(g);
    }
    this.segVerts = geos[0].attributes.position.count;
    const pos = new Float32Array(geos.length * this.segVerts * 3), nor = new Float32Array(pos.length);
    geos.forEach((g, i) => { pos.set(g.attributes.position.array, i * this.segVerts * 3); nor.set(g.attributes.normal.array, i * this.segVerts * 3); g.dispose(); });
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    rg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.object3D.add(this.ring);
    this._lit = -1;
    this._paintRing(0, false);
    const sign = new ResetSign();
    sign.mesh.position.set(0, 0.16, 0.002);
    this.object3D.add(sign.mesh);
    bake(this.cap);
    bake(this.object3D, new Set([this.cap, this.ring, sign.mesh]));
  }

  _paintRing(lit, done) {
    const key = done ? -2 : lit;
    if (key === this._lit) return;
    this._lit = key;
    const col = this.ring.geometry.attributes.color;
    for (let i = 0; i < SEGMENTS; i++) {
      const c = done ? DONE : i < lit ? ON : OFF;
      for (let v = 0; v < this.segVerts; v++) col.setXYZ(i * this.segVerts + v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** How far a hand pushes the cap in (0..1), from its fingertip; desktop: clicking on it counts as fully in. */
  _push(hand) {
    if (hand.held || hand.heldControl || !hand.touching) return 0;
    const l = this.object3D.worldToLocal(_l.copy(hand.touchPoint));
    if (Math.hypot(l.x, l.y) > this.capR + 0.015 || l.z < 0.015) return 0;
    const face = 0.032 + 0.012 + this.capR * 0.55;
    if (hand.name === 'mouse') return l.z < face + 0.02 ? 1 : 0;
    return THREE.MathUtils.clamp((face + 0.005 - l.z) / this.travel, 0, 1);
  }

  update(dt) {
    const w = this.world;
    let push = 0, pusher = null;
    for (const h of w.input?.hands ?? []) { const p = this._push(h); if (p > push) { push = p; pusher = h; } }
    const was = this.depth;
    this.depth += (push - this.depth) * (1 - Math.exp(-25 * dt));
    this.cap.position.z = 0.032 - this.depth * this.travel;
    if (was < 0.7 && this.depth >= 0.7) { w.audio?.play('tick', 1); pusher?.pulse?.(0.6, 40); }

    const held = this.depth >= 0.7 && !this.locked;
    this.progress = held ? this.progress + dt / this.holdS : Math.max(0, this.progress - dt * 3);
    if (held) pusher?.pulse?.(0.15 + this.progress * 0.4, 20);
    if (this.progress >= 1) {
      this.progress = 0; this.locked = true;
      w.audio?.play('chime', 1);
      pusher?.pulse?.(1, 150);
      w.after(0, () => w.factory?.resetRoom());
    }
    if (push < 0.2) this.locked = false;
    this._paintRing(Math.floor(this.progress * SEGMENTS + 1e-6), this.locked);
    this.capMat.emissive.setRGB(0.18 * this.progress, 0.08 * this.progress, 0.1 * this.progress);
  }
}
