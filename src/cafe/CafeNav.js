import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * What the cats know about the room: floor obstacles (2D rects / circles they walk around),
 * perches (cushions, cat-tree platforms, shelves, window seats, beds they can hop onto) and
 * 3D boxes (for the laser dot to land on furniture). Built by the furniture builders.
 *
 * Perch: { id, kind, x, y, z, r, yaw, via, approach: {x, z}, nap, occupant }
 *  - `via`: the perch to hop from (null = from the floor at `approach`)
 *  - `yaw`: the way a cat sitting there faces; `nap`: how cosy it is for a nap (0..1)
 */
export class CafeNav {
  constructor(room) {
    const m = 0.22;
    this.bounds = { minX: -room.width / 2 + m, maxX: room.width / 2 - m, minZ: -room.depth / 2 + m, maxZ: room.depth / 2 - m };
    this.blockers = [];      // {shape:'rect', x, z, hx, hz} | {shape:'circle', x, z, r}
    this.perches = [];
    this.boxes = [];         // THREE.Box3 (laser)
    this.player = null;      // {x, z, r}: cats step around the player's feet
  }

  addRect(x, z, hx, hz) { this.blockers.push({ shape: 'rect', x, z, hx, hz }); }
  addCircle(x, z, r) { this.blockers.push({ shape: 'circle', x, z, r }); }
  addBox(minX, minY, minZ, maxX, maxY, maxZ) { this.boxes.push(new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ))); }

  addPerch(p) {
    const perch = { kind: 'cushion', r: 0.18, yaw: 0, via: null, nap: 0.3, occupant: null, ...p };
    if (perch.via && typeof perch.via === 'string') perch.via = this.perches.find((q) => q.id === perch.via) ?? null;
    if (!perch.approach && !perch.via) perch.approach = { x: perch.x + Math.sin(perch.yaw) * 0.35, z: perch.z + Math.cos(perch.yaw) * 0.35 };
    this.perches.push(perch);
    return perch;
  }

  /** How far (x, z) is inside an obstacle grown by `margin` (> 0 = blocked). */
  penetration(x, z, margin = 0.12, withPlayer = true) {
    let worst = -Infinity;
    const b = this.bounds;
    worst = Math.max(worst, b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ);
    for (const o of this.blockers) worst = Math.max(worst, this._pen(o, x, z, margin));
    if (withPlayer && this.player) worst = Math.max(worst, this._pen({ shape: 'circle', ...this.player }, x, z, margin));
    return worst;
  }

  _pen(o, x, z, margin) {
    if (o.shape === 'circle') return o.r + margin - Math.hypot(x - o.x, z - o.z);
    const dx = Math.abs(x - o.x) - o.hx - margin, dz = Math.abs(z - o.z) - o.hz - margin;
    return dx < 0 && dz < 0 ? -Math.max(dx, dz) : -Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  }

  isFree(x, z, margin = 0.12, withPlayer = true) { return this.penetration(x, z, margin, withPlayer) <= 0; }

  /** Pushes a point out of obstacles and walls (returns it). */
  resolve(p, margin = 0.12) {
    const b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX); p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    const list = this.player ? [...this.blockers, { shape: 'circle', ...this.player }] : this.blockers;
    for (const o of list) {
      if (this._pen(o, p.x, p.z, margin) <= 0) continue;
      if (o.shape === 'circle') {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1e-3, r = o.r + margin;
        p.x = o.x + (dx / d) * r; p.z = o.z + (dz / d) * r;
      } else {
        const ox = o.hx + margin - Math.abs(p.x - o.x), oz = o.hz + margin - Math.abs(p.z - o.z);
        if (ox < oz) p.x += Math.sign(p.x - o.x || 1) * ox; else p.z += Math.sign(p.z - o.z || 1) * oz;
      }
    }
    return p;
  }

  /** A random free floor point (optionally within `radius` of `near`). */
  randomPoint(near = null, radius = 2, tries = 40) {
    const b = this.bounds;
    for (let i = 0; i < tries; i++) {
      const x = near ? near.x + (Math.random() * 2 - 1) * radius : b.minX + Math.random() * (b.maxX - b.minX);
      const z = near ? near.z + (Math.random() * 2 - 1) * radius : b.minZ + Math.random() * (b.maxZ - b.minZ);
      if (this.isFree(x, z, 0.18)) return { x, z };
    }
    return this.resolve({ x: near?.x ?? 0, z: near?.z ?? 0 }, 0.18);
  }

  /** The nearest free floor point to (x, z). */
  nearestFree(x, z, margin = 0.15) {
    if (this.isFree(x, z, margin)) return { x, z };
    for (let r = 0.1; r < 1.5; r += 0.1) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.isFree(px, pz, margin)) return { x: px, z: pz };
    }
    return this.resolve({ x, z }, margin);
  }

  /** Perches you can reach from the floor through their `via` chain: [floor-level ... perch]. */
  chain(perch) {
    const out = [];
    for (let p = perch; p; p = p.via) out.unshift(p);
    return out;
  }

  /**
   * Casts a ray against the room (floor, walls, ceiling) and the furniture boxes.
   * Returns {point, normal, distance} or null.
   */
  raycast(origin, dir, room, maxDist = 20) {
    let best = null;
    const consider = (t, n) => { if (t > 1e-4 && t < maxDist && (!best || t < best.distance)) best = { distance: t, normal: n }; };
    // inside of the room box
    const hw = room.width / 2, hd = room.depth / 2, H = room.height;
    if (dir.y < 0) consider(-origin.y / dir.y, new THREE.Vector3(0, 1, 0));
    if (dir.y > 0) consider((H - origin.y) / dir.y, new THREE.Vector3(0, -1, 0));
    if (dir.x > 0) consider((hw - origin.x) / dir.x, new THREE.Vector3(-1, 0, 0));
    if (dir.x < 0) consider((-hw - origin.x) / dir.x, new THREE.Vector3(1, 0, 0));
    if (dir.z > 0) consider((hd - origin.z) / dir.z, new THREE.Vector3(0, 0, -1));
    if (dir.z < 0) consider((-hd - origin.z) / dir.z, new THREE.Vector3(0, 0, 1));
    // furniture boxes (slab test, entering face)
    for (const box of this.boxes) {
      let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
      for (let a = 0; a < 3; a++) {
        const o = origin.getComponent(a), d = dir.getComponent(a), lo = box.min.getComponent(a), hi = box.max.getComponent(a);
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { tmin = Infinity; break; } continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
        if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        tmax = Math.min(tmax, t2);
      }
      if (tmin <= tmax && tmin > 1e-4 && axis >= 0) {
        const n = new THREE.Vector3(); n.setComponent(axis, sign);
        consider(tmin, n);
      }
    }
    if (!best) return null;
    best.point = _v.copy(origin).addScaledVector(dir, best.distance).clone();
    return best;
  }
}
