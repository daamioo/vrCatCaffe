import * as THREE from 'three';
import { Item } from './Item.js';

const N = 7;                 // rope points (tip + 6)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * A cat-teaser wand: a stick with a string and a fluffy feather on the end. Grab the stick and
 * wave it — the string swings (verlet rope with gravity, it drapes over the floor and furniture)
 * and cats track the feather, stalk it, pounce on it when it's low and bat at it when it hangs
 * within reach. You feel their swats in your hand. Lies flat when put down.
 * def: { length = 0.5, string = 0.38, color }
 */
export class FeatherWand extends Item {
  build() {
    const L = this.length = this.def.length ?? 0.5;
    this.height = L;
    this.grabRadius = 0.03;
    const add = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })); m.position.y = y; this.object3D.add(m); return m; };
    add(new THREE.CapsuleGeometry(0.014, 0.12, 4, 10), this.def.color ?? '#f6a9bb', 0.075);       // soft grip
    add(new THREE.CylinderGeometry(0.0045, 0.006, L - 0.14, 8), '#e3b98a', 0.14 + (L - 0.14) / 2);
    add(new THREE.SphereGeometry(0.01, 10, 8), '#fde7b0', L);

    // rope + feather live in world space (added to the scene in onAdded)
    this.seg = (this.def.string ?? 0.38) / (N - 1);
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    this.prev = Array.from({ length: N }, () => new THREE.Vector3());
    this.lineGeo = new THREE.BufferGeometry().setFromPoints(this.pts);
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0x8a7a80 }));
    this.line.frustumCulled = false; this.line.raycast = () => {};
    this.feather = new THREE.Group();
    const plumeCols = ['#f7b8c6', '#d9cff2', '#bfe6d6', '#ffffff', '#fde7b0'];
    const plumes = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: plumeCols[i] }));
      m.scale.set(0.012, 0.05, 0.004);
      m.position.y = -0.045; m.rotation.z = (i - 2) * 0.35; m.rotation.y = i * 0.6;
      const pivot = new THREE.Group(); pivot.add(m); plumes.add(pivot);
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshLambertMaterial({ color: '#f2cf6b' }));
    this.feather.add(plumes, bead);
    this.feather.traverse((o) => { o.raycast = () => {}; });
    this._speed = 0;
    this._lastSwish = 0;
    this._init = false;
  }

  onAdded() {
    super.onAdded();
    this.body.restHeight = 0.015;
    this.world.scene.add(this.line, this.feather);
    this.world.toys.add(this);
    this._resetRope();
  }

  onRemoved() {
    super.onRemoved();
    this.world.toys.delete(this);
    this.world.scene.remove(this.line, this.feather);
    this.lineGeo.dispose();
    this.feather.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  /** Put down: lies flat on its side. */
  restQuaternion(yaw) { return this._rest.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiply(this._lay); }

  tip(target = new THREE.Vector3()) { return this.worldPointAt(this.length, target); }

  _resetRope() {
    this.object3D.updateMatrixWorld(true);
    const t = this.tip(_a);
    this.pts.forEach((p, i) => { p.set(t.x, Math.max(0.01, t.y - i * this.seg), t.z); this.prev[i].copy(p); });
    this._init = true;
  }

  lure() {
    return { point: this.pts[N - 1], speed: this._speed, kind: 'feather' };
  }

  /** A cat bats the feather: it flies off a little; the hand holding the wand feels it. */
  onSwat(cat, dir, strength = 1) {
    const end = this.pts[N - 1], prev = this.prev[N - 1];
    prev.copy(end).addScaledVector(dir, -0.035 * strength);
    prev.y -= 0.02 * strength;
    this.world.audio?.play('swish', 0.5 * strength, { pos: end });
    this.body.held?.pulse?.(0.35 + 0.3 * strength, 50);
    this.swats = (this.swats ?? 0) + 1;
  }

  update(dt) {
    if (!this._init) this._resetRope();
    this.object3D.updateMatrixWorld(true);
    const pts = this.pts, prev = this.prev, phys = this.world.physics;
    const tip = this.tip(_a);
    const g = 9.81 * dt * dt;
    const lastBefore = _b.copy(pts[N - 1]);
    pts[0].copy(tip); prev[0].copy(tip);
    for (let i = 1; i < N; i++) {
      const p = pts[i], q = prev[i];
      _d.copy(p).sub(q).multiplyScalar(0.985);           // air drag
      q.copy(p);
      p.add(_d); p.y -= g * (i === N - 1 ? 0.7 : 1);       // the feather floats a little
    }
    for (let it = 0; it < 6; it++) {
      for (let i = 1; i < N; i++) {
        const a = pts[i - 1], b = pts[i];
        _d.copy(b).sub(a);
        const len = _d.length() || 1e-6, diff = (len - this.seg) / len;
        if (i === 1) b.addScaledVector(_d, -diff);
        else { a.addScaledVector(_d, diff * 0.5); b.addScaledVector(_d, -diff * 0.5); }
      }
      // lie on whatever is underneath (floor, table, cushion…)
      for (let i = 1; i < N; i++) {
        const p = pts[i], s = phys.surfaceAt(p.x, p.z, p.y + 0.03), floor = (s?.top ?? 0) + 0.006;
        if (p.y < floor) { p.y = floor; prev[i].x += (p.x - prev[i].x) * 0.3; prev[i].z += (p.z - prev[i].z) * 0.3; }
      }
      const room = this.world.settings.room;
      for (const p of pts) { p.x = THREE.MathUtils.clamp(p.x, -room.width / 2 + 0.02, room.width / 2 - 0.02); p.z = THREE.MathUtils.clamp(p.z, -room.depth / 2 + 0.02, room.depth / 2 - 0.02); }
    }
    const v = lastBefore.distanceTo(pts[N - 1]) / Math.max(dt, 1e-4);
    this._speed += (v - this._speed) * (1 - Math.exp(-10 * dt));
    if (this.body.held && this._speed > 2.2 && this.world.time - this._lastSwish > 0.25) { this._lastSwish = this.world.time; this.world.audio?.play('swish', 0.35, { pos: pts[N - 1] }); }

    const attr = this.lineGeo.attributes.position;
    pts.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z));
    attr.needsUpdate = true;
    this.lineGeo.computeBoundingSphere();
    this.feather.position.copy(pts[N - 1]);
    _d.copy(pts[N - 1]).sub(pts[N - 2]).normalize();
    if (_d.lengthSq() > 0.5) this.feather.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _d);
  }
}
