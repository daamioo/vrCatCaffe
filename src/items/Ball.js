import * as THREE from 'three';
import { Item } from './Item.js';

const _c = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A throwable ball (adapted from the lab's BouncyBall): throw it and it bounces off floor,
 * furniture and walls, then rolls to a stop. Squeeze it while held (trigger / fist / Space) and it
 * squashes. Cats chase it while it moves and bat it around (onSwat). Origin is the ball's centre.
 * Subclasses build the look in buildMesh() and set the sounds.
 * def: { radius, restitution, rollFriction, massG }
 */
export class Ball extends Item {
  build() {
    const r = this.radius = this.def.radius ?? 0.035;
    this.height = 0;
    this.grabRadius = r + 0.01;
    this.squeeze = 0;
    this._impact = 0;
    this._lastNotch = 0;
    this.impactSound = 'boing';
    this.squeezeSound = 'rubberSqueak';
    this.squashFrame = new THREE.Group();
    this.mesh = this.buildMesh(r);
    this.squashFrame.add(this.mesh);
    this.object3D.add(this.squashFrame);
  }

  buildMesh(r) { return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshLambertMaterial({ color: this.def.color ?? '#f6a9bb' })); }

  onAdded() {
    super.onAdded();
    const b = this.body;
    b.restHeight = this.radius;
    b.restitution = this.def.restitution ?? 0.5;
    b.rollRadius = this.radius;
    b.rollFriction = this.def.rollFriction ?? 0.9;
    this.world.toys.add(this);
  }
  onRemoved() { super.onRemoved(); this.world.toys.delete(this); }

  get totalMassG() { return this.def.massG ?? 40; }
  get collisionRadius() { return this.radius; }
  onKnock(dv) { this.body.velocity.add(dv); if (dv.y > 0.4) this.body.support = null; }
  restQuaternion() { return this._rest.copy(this.object3D.quaternion); }
  distanceToPoint(p) { return Math.max(0, this.object3D.getWorldPosition(_c).distanceTo(p) - this.radius); }

  /** What cats see: where it is and how fast it moves. */
  lure() {
    const hand = this.body.held;
    return { point: this.object3D.position, speed: hand ? hand.velocity.length() : this.body.velocity.length(), kind: 'ball' };
  }

  /** A cat's paw hits it: off it goes (a held ball just tugs at your hand). */
  onSwat(cat, dir, strength = 1) {
    const hand = this.body.held;
    if (hand) { hand.pulse?.(0.5, 60); return; }
    const v = this.body.velocity, side = (Math.random() - 0.5) * 0.9, s = (1.0 + Math.random() * 0.7) * strength;
    v.x += dir.x * s - dir.z * side; v.z += dir.z * s + dir.x * side;
    v.y = Math.max(v.y, Math.random() < 0.4 ? 0.8 + Math.random() * 0.6 : 0);
    if (v.y > 0.4) this.body.support = null;
    this.onSwatSound();
  }
  onSwatSound() { this.world.audio?.play(this.impactSound, 0.6, { pos: this.object3D.position }); }

  onImpact(speed) {
    if (speed < 0.3) return;
    this._impact = Math.min(0.45, Math.max(this._impact, speed * 0.09));
    this.world.audio?.play(this.impactSound, Math.min(1, speed / 4), { pos: this.object3D.position });
  }

  update(dt) {
    const hand = this.body.held;
    const target = hand ? (hand.squeeze ?? 0) : 0;
    this.squeeze += (target - this.squeeze) * (1 - Math.exp(-(target > this.squeeze ? 18 : 10) * dt));
    this._impact *= Math.exp(-14 * dt);
    if (hand && this.squeeze > 0.05) {
      const notch = Math.floor(this.squeeze * 6);
      if (notch !== this._lastNotch) {
        if (notch > this._lastNotch) this.world.audio?.play(this.squeezeSound, 0.4 + this.squeeze * 0.8, { pos: this.object3D.position });
        this._lastNotch = notch;
      }
      hand.pulse?.(0.1 + this.squeeze * 0.4, 20);
    } else this._lastNotch = 0;
    const s = Math.min(0.6, this.squeeze * (this.def.squash ?? 0.5) + this._impact);
    const flat = 1 - s, bulge = 1 / Math.sqrt(flat);
    if (hand) _axis.set(1, 0, 0).applyQuaternion(hand.quaternion); else _axis.copy(UP);
    _axis.applyQuaternion(_q.copy(this.object3D.quaternion).invert());
    this.squashFrame.quaternion.setFromUnitVectors(UP, _axis.normalize());
    this.mesh.quaternion.copy(this.squashFrame.quaternion).invert();
    this.squashFrame.scale.set(bulge, flat, bulge);
  }
}

/** A soft ball of yarn: wound strands in a few directions and a loose end. Rolls slowly, hardly bounces. */
export class YarnBall extends Ball {
  build() { super.build(); this.impactSound = 'thud'; this.squeezeSound = 'thud'; }
  buildMesh(r) {
    const base = new THREE.Color(this.def.color ?? '#f6a9bb'), dark = base.clone().multiplyScalar(0.78), light = base.clone().lerp(new THREE.Color('#ffffff'), 0.3);
    const geo = new THREE.SphereGeometry(r, 32, 24).toNonIndexed();
    const axes = [new THREE.Vector3(1, 0.2, 0).normalize(), new THREE.Vector3(0.1, 1, 0.4).normalize(), new THREE.Vector3(0.3, -0.2, 1).normalize()];
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).divideScalar(r);
      // which winding layer is on top here, and its strand pattern
      const layer = Math.floor((Math.sin(v.x * 5.1) + Math.sin(v.y * 4.3 + 1) + Math.sin(v.z * 3.7 + 2) + 3) / 2) % 3;
      const band = Math.sin(v.dot(axes[layer]) * 70);
      const c = band > 0.55 ? light : band < -0.55 ? dark : base;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    // loose strand curling off the surface
    const pts = [new THREE.Vector3(r * 0.95, 0, 0), new THREE.Vector3(r * 1.25, -r * 0.4, r * 0.3), new THREE.Vector3(r * 1.5, -r * 0.95, r * 0.1)];
    const strand = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0025, 5), new THREE.MeshLambertMaterial({ color: base }));
    mesh.add(strand);
    return mesh;
  }
}

/** A crumpled, shiny crinkle ball: rustles when it lands, when squeezed and when a cat bats it. */
export class CrinkleBall extends Ball {
  build() { super.build(); this.impactSound = 'crinkle'; this.squeezeSound = 'crinkle'; }
  buildMesh(r) {
    const geo = new THREE.IcosahedronGeometry(r, 2);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    let s = 5;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const bumps = new Map();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
      if (!bumps.has(key)) bumps.set(key, 0.82 + rnd() * 0.3);
      v.multiplyScalar(bumps.get(key));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: this.def.color ?? '#c9b8f0', metalness: 0.65, roughness: 0.3, flatShading: true }));
  }
}
