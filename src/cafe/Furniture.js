import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { Surface } from '../physics/Surface.js';
import { Registry } from '../core/Registry.js';
import { ColorBatch } from '../util/bake.js';
import { roundedBox, cushion, sisal, tube } from './shapes.js';

export const C = {
  pink: '#f6a9bb', blush: '#fbd3dc', cream: '#fff6e6', mint: '#bfe6d6', mintDark: '#97d1bb', lavender: '#d9cff2', lilac: '#bfaee8',
  peach: '#fbd3b5', butter: '#fde7b0', wood: '#e3b98a', woodDark: '#c99a6b', white: '#ffffff', berry: '#e5536f', choco: '#8a5a44',
  leaf: '#7cc49a', leafDark: '#5aa77e', sky: '#cfe3f7', grey: '#8f8a92',
};

/**
 * Places one furniture piece: local coordinates (x, y, z relative to `position`, rotated by
 * `rotationY` in 90° steps) go into the shared batches, surfaces, cat obstacles and perches.
 */
class Placer {
  constructor(ctx, def) {
    this.ctx = ctx; this.def = def;
    const [x, y, z] = def.position ?? [0, 0, 0];
    this.x = x; this.y = y; this.z = z;
    this.rot = THREE.MathUtils.degToRad(def.rotationY ?? 0);
    this.cos = Math.cos(this.rot); this.sin = Math.sin(this.rot);
    this.base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.rot), new THREE.Vector3(1, 1, 1));
    this._l = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
  }
  _m(x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    this._l.compose(new THREE.Vector3(x, y, z), this._q.setFromEuler(this._e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    return this.base.clone().multiply(this._l);
  }
  add(geo, color, x = 0, y = 0, z = 0, o = {}) { return this.ctx.solid.add(geo, color, 0, 0, 0, { matrix: this._m(x, y, z, o) }); }
  glass(geo, color, x = 0, y = 0, z = 0, o = {}) { return this.ctx.glass.add(geo, color, 0, 0, 0, { matrix: this._m(x, y, z, o) }); }
  glow(geo, color, x = 0, y = 0, z = 0, o = {}) { return this.ctx.glow.add(geo, color, 0, 0, 0, { matrix: this._m(x, y, z, o) }); }
  /** local (x, z) -> world {x, z} */
  w(lx, lz) { return { x: this.x + lx * this.cos + lz * this.sin, z: this.z - lx * this.sin + lz * this.cos }; }
  /** local half extents -> world (90° steps swap them) */
  ext(hx, hz) { return Math.abs(this.sin) > 0.5 ? [hz, hx] : [hx, hz]; }
  yaw(localYaw) { return localYaw + this.rot; }

  surface({ x = 0, z = 0, top, hx, hz, r, solidDepth = 0 }) {
    const p = this.w(x, z), [ex, ez] = hx != null ? this.ext(hx, hz) : [0, 0];
    const s = new Surface({ owner: this.ctx.owner, shape: r ? 'circle' : 'rect', x: p.x, z: p.z, top: this.y + top, halfX: ex, halfZ: ez, radius: r ?? 0,
      solid: solidDepth ? Surface.box({ depth: solidDepth }) : null });
    this.ctx.surfaces.push(s);
    return s;
  }
  rect(x, z, hx, hz) { const p = this.w(x, z), [ex, ez] = this.ext(hx, hz); this.ctx.nav.addRect(p.x, p.z, ex, ez); }
  circle(x, z, r) { const p = this.w(x, z); this.ctx.nav.addCircle(p.x, p.z, r); }
  box(x, z, hx, hz, y0, y1) { const p = this.w(x, z), [ex, ez] = this.ext(hx, hz); this.ctx.nav.addBox(p.x - ex, this.y + y0, p.z - ez, p.x + ex, this.y + y1, p.z + ez); }
  perch({ x = 0, z = 0, y, yaw = null, approach = null, ...rest }) {
    const p = this.w(x, z);
    const facing = yaw != null ? this.yaw(yaw) : Math.atan2(-p.x, -p.z + 0.5);      // default: face the room
    const a = approach ? this.w(approach[0], approach[1]) : null;
    return this.ctx.nav.addPerch({ x: p.x, z: p.z, y: this.y + y, yaw: facing, approach: a ?? undefined, ...rest });
  }
}

// ----------------------------------------------------------------------------- builders
// Each builder(p: Placer, def) adds geometry + physics + navigation for one piece.

function Counter(p, def) {
  const [w, h, d] = def.size ?? [3.2, 1.0, 0.6];
  p.add(roundedBox(w - 0.04, h - 0.06, d - 0.06, 0.05), C.blush, 0, (h - 0.06) / 2, 0.0);
  p.add(roundedBox(w + 0.06, 0.06, d + 0.08, 0.025), C.cream, 0, h - 0.03, 0.02);                 // worktop
  p.add(roundedBox(w - 0.1, 0.1, 0.04, 0.02), C.mint, 0, 0.05, d / 2 - 0.02);                       // kick plate
  // beadboard front: rounded slats
  for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.16) p.add(roundedBox(0.12, h - 0.3, 0.025, 0.012), C.pink, x, 0.12 + (h - 0.3) / 2, d / 2 - 0.02);
  // big paw print emblem on the front
  for (const [dx, dy, r] of [[0, 0, 0.11], [-0.12, 0.12, 0.045], [-0.045, 0.17, 0.045], [0.045, 0.17, 0.045], [0.12, 0.12, 0.045]]) {
    p.add(new THREE.CylinderGeometry(r, r, 0.02, 24).rotateX(Math.PI / 2).scale(1, dx === 0 ? 0.8 : 1.15, 1), C.cream, (def.pawX ?? 0) + dx, 0.48 + dy, d / 2 + 0.005);
  }
  p.surface({ top: h, hx: w / 2 + 0.03, hz: d / 2 + 0.04, z: 0.02, solidDepth: h });
  p.rect(0, 0, w / 2, d / 2);
  p.box(0, 0.02, w / 2 + 0.03, d / 2 + 0.04, 0, h);
}

function CakeDisplay(p, def) {
  const [w, d] = def.size ?? [0.9, 0.42];
  p.add(roundedBox(w, 0.06, d, 0.02), C.wood, 0, 0.03, 0);
  p.add(roundedBox(w - 0.04, 0.02, d - 0.04, 0.008), C.cream, 0, 0.24, 0);                            // middle shelf
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.44, 8), C.wood, sx * (w / 2 - 0.015), 0.28, sz * (d / 2 - 0.015));
  p.add(roundedBox(w, 0.04, d, 0.02), C.wood, 0, 0.5, 0);
  p.glass(new THREE.BoxGeometry(w - 0.02, 0.43, d - 0.02), '#f4fbff', 0, 0.28, 0);
  const cake = (x, y, z, sponge, frost, topping, r = 0.075) => {
    p.add(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.012, 20), C.white, x, y + 0.006, z);         // plate
    p.add(new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.06, 20), sponge, x, y + 0.042, z);
    p.add(new THREE.CylinderGeometry(r * 0.63, r * 0.63, 0.018, 20), frost, x, y + 0.08, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.add(new THREE.SphereGeometry(0.011, 8, 6), C.white, x + Math.cos(a) * r * 0.45, y + 0.094, z + Math.sin(a) * r * 0.45);
    }
    p.add(new THREE.SphereGeometry(0.016, 10, 8), topping, x, y + 0.1, z);
  };
  cake(-w / 3, 0.06, 0, C.butter, C.pink, C.berry);
  cake(0, 0.06, 0, C.choco, '#f3e1d0', C.berry);
  cake(w / 3, 0.06, 0, C.cream, C.mint, '#ffffff');
  // cupcakes and a slice on the upper shelf
  for (const [x, frost] of [[-w / 3, C.lavender], [-w / 6, C.pink], [w / 6, C.mint]]) {
    p.add(new THREE.CylinderGeometry(0.028, 0.02, 0.035, 14), C.peach, x, 0.27, 0);
    p.add(new THREE.SphereGeometry(0.032, 14, 10).scale(1, 0.8, 1), frost, x, 0.3, 0);
    p.add(new THREE.SphereGeometry(0.008, 8, 6), C.berry, x, 0.33, 0);
  }
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16, 1, false, 0, Math.PI / 3), C.butter, w / 3, 0.275, -0.03);
  p.add(new THREE.CylinderGeometry(0.072, 0.072, 0.012, 16, 1, false, 0, Math.PI / 3), C.pink, w / 3, 0.305, -0.03);
}

function EspressoMachine(p) {
  p.add(roundedBox(0.36, 0.34, 0.3, 0.06), C.mint, 0, 0.17, 0);
  p.add(roundedBox(0.3, 0.05, 0.26, 0.02), C.cream, 0, 0.36, 0);
  for (const x of [-0.08, 0.08]) {
    p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 14), '#d9d6dc', x, 0.21, 0.17);
    p.add(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 16, 1, true), C.white, x, 0.035, 0.18);          // cups under the spouts
  }
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 14), '#d9d6dc', 0.0, 0.34, 0.17);
  // a stack of cups and a milk jug
  for (let k = 0; k < 3; k++) p.add(new THREE.CylinderGeometry(0.04, 0.03, 0.05, 16), [C.pink, C.lavender, C.butter][k], 0.3, 0.025 + k * 0.035, 0.02);
  p.add(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 16), '#e6e3ea', -0.28, 0.06, 0.03);
}

function LowTable(p, def) {
  const r = def.radius ?? 0.45, h = def.height ?? 0.36;
  p.add(new THREE.CylinderGeometry(r, r, 0.045, 40), def.color ?? C.wood, 0, h - 0.022, 0);
  p.add(new THREE.TorusGeometry(r, 0.022, 8, 40).rotateX(Math.PI / 2), C.woodDark, 0, h - 0.022, 0);
  p.add(new THREE.CylinderGeometry(0.06, 0.09, h - 0.05, 16), C.woodDark, 0, (h - 0.05) / 2 + 0.02, 0);
  p.add(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 24), C.woodDark, 0, 0.015, 0);
  // a little vase of flowers
  p.add(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 14), C.lavender, r * 0.45, h + 0.045, -r * 0.3);
  for (const [dx, dz, col] of [[0, 0, C.pink], [0.03, 0.02, C.butter], [-0.025, 0.025, C.white]]) {
    p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 5), C.leafDark, r * 0.45 + dx, h + 0.13, -r * 0.3 + dz);
    p.add(new THREE.SphereGeometry(0.02, 10, 8), col, r * 0.45 + dx, h + 0.18, -r * 0.3 + dz);
  }
  p.surface({ top: h, r, solidDepth: 0.05 });
  p.circle(0, 0, r * 0.85);
  p.box(0, 0, r * 0.75, r * 0.75, h - 0.05, h);
  // floor cushions around the table — cats love to claim them
  const n = def.cushions ?? 3, cols = [C.pink, C.mint, C.lavender, C.butter];
  for (let i = 0; i < n; i++) {
    const a = (def.cushionStart ?? 0) * Math.PI / 180 + (i / n) * Math.PI * 2, cx = Math.sin(a) * (r + 0.32), cz = Math.cos(a) * (r + 0.32);
    p.add(cushion(0.42, 0.11, 0.42, false), cols[i % cols.length], cx, 0.055, cz, { ry: a });
    p.add(new THREE.SphereGeometry(0.018, 8, 6), C.cream, cx, 0.112, cz);                                // tufting button
    p.perch({ x: cx, z: cz, y: 0.11, r: 0.17, kind: 'cushion', nap: 0.5, yaw: a, approach: [Math.sin(a) * (r + 0.66), Math.cos(a) * (r + 0.66)] });
  }
}

function CatTree(p, def) {
  const plats = def.platforms ?? [{ x: 0, z: 0.15, y: 0.42, r: 0.22 }, { x: 0.1, z: -0.1, y: 0.82, r: 0.2 }, { x: -0.05, z: 0, y: 1.2, r: 0.22, bed: true }];
  const carpet = def.color ?? C.lavender;
  p.add(roundedBox(0.62, 0.05, 0.62, 0.02), carpet, 0, 0.025, 0);
  let prevPerch = null, prev = { x: 0, z: 0, y: 0.05 };
  plats.forEach((pl, i) => {
    // a sisal post from the platform below up to this one
    const px = (prev.x + pl.x) / 2, pz = (prev.z + pl.z) / 2, len = pl.y - prev.y;
    p.add(new THREE.CylinderGeometry(0.05, 0.05, len, 16, Math.max(1, Math.round(len * 40))), sisal(), px * 0.6, prev.y + len / 2, pz * 0.6);
    p.add(new THREE.CylinderGeometry(pl.r, pl.r, 0.04, 28), carpet, pl.x, pl.y - 0.02, pl.z);
    p.add(new THREE.TorusGeometry(pl.r, 0.02, 8, 28).rotateX(Math.PI / 2), C.cream, pl.x, pl.y - 0.02, pl.z);
    if (pl.bed) {                                                                                    // cosy cup bed on top
      p.add(new THREE.TorusGeometry(pl.r - 0.05, 0.05, 10, 28).rotateX(Math.PI / 2), C.pink, pl.x, pl.y + 0.04, pl.z);
      p.add(new THREE.CylinderGeometry(pl.r - 0.04, pl.r - 0.04, 0.03, 24), C.blush, pl.x, pl.y + 0.015, pl.z);
    }
    if (i === 0) {                                                                                   // dangling pompom toy
      p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 4), C.grey, pl.x + pl.r * 0.8, pl.y - 0.11, pl.z);
      p.add(new THREE.SphereGeometry(0.03, 10, 8), C.butter, pl.x + pl.r * 0.8, pl.y - 0.22, pl.z);
    }
    p.surface({ x: pl.x, z: pl.z, top: pl.y + (pl.bed ? 0.03 : 0), r: pl.r });
    p.box(pl.x, pl.z, pl.r * 0.8, pl.r * 0.8, pl.y - 0.04, pl.y);
    const dir = Math.atan2(-(p.w(pl.x, pl.z).x), -(p.w(pl.x, pl.z).z));
    prevPerch = p.perch({
      id: `${def.id}-${i}`, x: pl.x, z: pl.z, y: pl.y + (pl.bed ? 0.03 : 0), r: pl.r * 0.8, kind: pl.bed ? 'bed' : 'tree', nap: pl.bed ? 1 : 0.55,
      via: prevPerch, approach: i === 0 ? null : undefined,
    });
    if (i === 0) {
      const w = p.w(pl.x, pl.z);
      prevPerch.approach = { x: w.x + Math.sin(dir) * (pl.r + 0.25), z: w.z + Math.cos(dir) * (pl.r + 0.25) };
    }
    prev = { ...pl };
  });
  p.circle(0, 0, 0.3);
}

function WallShelf(p, def) {
  const [len, depth] = def.size ?? [0.6, 0.32];
  p.add(roundedBox(len, 0.045, depth, 0.018), C.wood, 0, -0.0225, 0);
  p.add(roundedBox(len * 0.96, 0.06, 0.02, 0.008), C.pink, 0, -0.02, depth / 2 + 0.005);
  for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.14, depth * 0.8), C.woodDark, sx * len * 0.35, -0.1, -depth * 0.05);
  p.add(cushion(len * 0.7, 0.04, depth * 0.75, false), def.cushionColor ?? C.mint, 0, 0.02, 0);
  p.surface({ top: 0.04, hx: len / 2, hz: depth / 2 });
  p.box(0, 0, len / 2, depth / 2, -0.045, 0.04);
  p.perch({ id: def.id, y: 0.04, r: 0.15, kind: 'shelf', nap: 0.7, via: def.via, yaw: 0 });
}

function WindowSeat(p, def) {
  const [len, h, depth] = def.size ?? [2.0, 0.45, 0.5];
  p.add(roundedBox(len, h - 0.08, depth, 0.03), C.cream, 0, (h - 0.08) / 2, 0);
  for (let x = -len / 2 + 0.25; x < len / 2; x += 0.5) p.add(roundedBox(0.4, h - 0.2, 0.02, 0.01), C.mint, x, (h - 0.08) / 2, depth / 2 + 0.005);
  p.add(cushion(len - 0.04, 0.09, depth - 0.02, false), C.pink, 0, h - 0.045, 0);
  const spots = def.spots ?? 2;
  for (let i = 0; i < spots; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / spots;
    p.add(cushion(0.3, 0.18, 0.12, false), [C.lavender, C.butter, C.mint][i % 3], x + 0.12, h + 0.09, -depth / 2 + 0.08, { rx: -0.25 });   // back pillows
    p.perch({ x, z: 0.04, y: h, r: 0.18, kind: 'seat', nap: 0.9, yaw: 0, approach: [x, depth / 2 + 0.3] });
  }
  p.surface({ top: h, hx: len / 2, hz: depth / 2, solidDepth: h });
  p.rect(0, 0, len / 2, depth / 2);
  p.box(0, 0, len / 2, depth / 2, 0, h);
}

function Cabinet(p, def) {
  const [w, h, d] = def.size ?? [0.7, 0.75, 0.4];
  p.add(roundedBox(w, h, d, 0.035), def.color ?? C.mint, 0, h / 2, 0);
  for (const sx of [-1, 1]) {
    p.add(roundedBox(w / 2 - 0.05, h - 0.12, 0.02, 0.012), C.cream, sx * w / 4, h / 2, d / 2 + 0.005);
    p.add(new THREE.SphereGeometry(0.015, 10, 8), C.woodDark, sx * 0.05, h * 0.55, d / 2 + 0.02);
  }
  p.surface({ top: h, hx: w / 2, hz: d / 2, solidDepth: h });
  p.rect(0, 0, w / 2, d / 2);
  p.box(0, 0, w / 2, d / 2, 0, h);
}

function Plant(p, def) {
  const s = def.scale ?? 1;
  p.add(new THREE.CylinderGeometry(0.17 * s, 0.13 * s, 0.32 * s, 20), def.pot ?? C.peach, 0, 0.16 * s, 0);
  p.add(new THREE.TorusGeometry(0.17 * s, 0.02 * s, 8, 20).rotateX(Math.PI / 2), C.cream, 0, 0.32 * s, 0);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.4, tilt = 0.5 + (i % 3) * 0.2, len = (0.35 + (i % 4) * 0.08) * s;
    const geo = new THREE.SphereGeometry(1, 12, 8).scale(0.09 * s, len / 2, 0.03 * s).translate(0, len / 2, 0);
    p.add(geo, i % 2 ? C.leaf : C.leafDark, 0, 0.3 * s, 0, { ry: a, rz: tilt });
  }
  p.circle(0, 0, 0.22 * s);
}

function CatBed(p, def) {
  const r = def.radius ?? 0.26;
  p.add(new THREE.TorusGeometry(r - 0.06, 0.07, 12, 32).rotateX(Math.PI / 2), def.color ?? C.lavender, 0, 0.07, 0);
  p.add(new THREE.CylinderGeometry(r - 0.06, r - 0.04, 0.05, 28), C.cream, 0, 0.03, 0);
  p.perch({ y: 0.05, r: r - 0.08, kind: 'bed', nap: 1 });
}

function Rug(p, def) {
  if (def.radius) {
    p.add(new THREE.CylinderGeometry(def.radius, def.radius, 0.01, 48), def.color ?? C.blush, 0, 0.005, 0);
    p.add(new THREE.TorusGeometry(def.radius * 0.8, 0.02, 4, 48).rotateX(Math.PI / 2).scale(1, 0.2, 1), def.trim ?? C.cream, 0, 0.011, 0);
  } else {
    const [w, d] = def.size;
    p.add(roundedBox(w, 0.012, d, 0.005), def.color ?? C.blush, 0, 0.006, 0);
  }
}

function FeedingMat(p, def) {
  const [w, d] = def.size ?? [0.9, 0.45];
  p.add(roundedBox(w, 0.012, d, 0.005), C.mint, 0, 0.006, 0);
  for (let k = 0; k < 5; k++) {                                                    // paw prints on the mat
    const x = -w / 2 + 0.1 + k * (w - 0.2) / 4, z = (k % 2 ? 0.1 : -0.1) * (d / 0.45);
    p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 14), C.cream, x, 0.013, z);
    for (const [dx, dz] of [[-0.025, -0.03], [0, -0.04], [0.025, -0.03]]) p.add(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8), C.cream, x + dx, 0.013, z + dz);
  }
}

/** Decorative wall shelf with jars and mugs behind/above the counter. */
function DecoShelf(p, def) {
  const len = def.length ?? 1.2;
  p.add(roundedBox(len, 0.035, 0.22, 0.012), C.wood, 0, 0, 0);
  const cols = [C.pink, C.mint, C.lavender, C.butter, C.peach];
  for (let x = -len / 2 + 0.1, k = 0; x < len / 2 - 0.05; x += 0.14, k++) {
    if (k % 3 === 2) {
      p.add(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 14), cols[k % 5], x, 0.057, 0);
      p.add(new THREE.TorusGeometry(0.02, 0.006, 6, 12), cols[k % 5], x + 0.04, 0.06, 0);
    } else {
      p.glass(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 16), '#f4fbff', x, 0.088, 0);
      p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 14), [C.choco, C.butter, C.peach][k % 3], x, 0.063, 0);
      p.add(new THREE.CylinderGeometry(0.047, 0.047, 0.025, 16), cols[(k + 2) % 5], x, 0.17, 0);
    }
  }
}

export const furnitureRegistry = new Registry('furniture type')
  .register('Counter', Counter).register('CakeDisplay', CakeDisplay).register('EspressoMachine', EspressoMachine)
  .register('LowTable', LowTable).register('CatTree', CatTree).register('WallShelf', WallShelf).register('WindowSeat', WindowSeat)
  .register('Cabinet', Cabinet).register('Plant', Plant).register('CatBed', CatBed).register('Rug', Rug).register('FeedingMat', FeedingMat)
  .register('DecoShelf', DecoShelf);

/**
 * All the café furniture as one entity: every solid piece in a single vertex-coloured mesh, glass
 * in another — two draw calls for the lot. Registers the surfaces (items rest on them), and fills
 * the CafeNav with obstacles, perches and laser boxes.
 */
export class CafeInterior extends Entity {
  constructor(world, defs) {
    super(world);
    this.surfaces = [];
    const ctx = { owner: this, solid: new ColorBatch(), glass: new ColorBatch(), glow: new ColorBatch(), surfaces: this.surfaces, nav: world.nav };
    for (const def of defs) furnitureRegistry.get(def.type)(new Placer(ctx, def), def);
    this.solidMesh = ctx.solid.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.object3D.add(this.solidMesh);
    if (!ctx.glass.empty) {
      const g = ctx.glass.build(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false }));
      g.renderOrder = 2;
      g.raycast = () => {};
      this.object3D.add(g);
    }
    if (!ctx.glow.empty) this.object3D.add(ctx.glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }

  onAdded() { for (const s of this.surfaces) this.world.physics.addSurface(s); }
  onRemoved() { for (const s of this.surfaces) this.world.physics.removeSurface(s); }
}
