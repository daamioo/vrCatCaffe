import * as THREE from 'three';

/**
 * Merges every static mesh below `root` into one mesh per material (fewer draw calls — the Quest
 * is happiest at ~100–150 per frame). Meshes in `skip` (and everything under them) are left alone.
 * Attributes kept: position, normal, uv, color — whichever all merged geometries share.
 */
export function bake(root, skip = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const byMat = new Map(), victims = [];
  const visit = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o !== root) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
      victims.push(o);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const o of victims) { o.parent.remove(o); o.geometry.dispose(); }
  const out = [];
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    geos.forEach((g) => g.dispose());
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}

/** Concatenates non-indexed geometries (shared attributes only). */
export function mergeGeometries(geos) {
  const names = ['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].filter((n) => geos.every((g) => g.attributes[n]));
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const first = geos[0].attributes[n], size = first.itemSize, total = geos.reduce((s, g) => s + g.attributes[n].count, 0);
    const arr = new first.array.constructor(total * size);
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * Collects coloured geometries and builds them into a single vertex-coloured mesh: a whole room of
 * furniture in one draw call. `add(geo, color, x, y, z, {rx, ry, rz, sx, sy, sz})`.
 */
export class ColorBatch {
  constructor() { this.geos = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._c = new THREE.Color(); }

  add(geo, color, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, matrix = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    const m = matrix ?? this._m.compose(new THREE.Vector3(x, y, z), this._q.setFromEuler(this._e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    const cols = new Float32Array(g.attributes.position.count * 3);
    const c = typeof color === 'function' ? null : this._c.set(color);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (!c) { const cc = color(pos.getX(i), pos.getY(i), pos.getZ(i), this._c); cols.set([cc.r, cc.g, cc.b], i * 3); }
      else cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.geos.push(g);
    return g;
  }

  /** Adds an already transformed group of geometries (e.g. from a helper) with one colour. */
  get empty() { return this.geos.length === 0; }

  build(material) {
    const mesh = new THREE.Mesh(mergeGeometries(this.geos), material);
    this.geos.forEach((g) => g.dispose());
    this.geos = [];
    return mesh;
  }
}
