import * as THREE from 'three';

/** Small geometry helpers for the soft, rounded café look. All return BufferGeometries centred on the origin. */

/** A box with rounded edges (extruded rounded rectangle with a bevel). */
export function roundedBox(w, h, d, r = 0.03, seg = 3) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const x = w / 2 - r, z = d / 2 - r, s = new THREE.Shape();
  s.moveTo(-x, -z - r * 0);
  s.absarc(x, -z, r, -Math.PI / 2, 0, false);
  s.absarc(x, z, r, 0, Math.PI / 2, false);
  s.absarc(-x, z, r, Math.PI / 2, Math.PI, false);
  s.absarc(-x, -z, r, Math.PI, Math.PI * 1.5, false);
  const depth = Math.max(1e-3, h - 2 * r);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.999, bevelOffset: -r * 0.999, bevelSegments: seg, curveSegments: seg * 2 });
  g.rotateX(-Math.PI / 2);          // extrude along +Y
  g.translate(0, -depth / 2, 0);
  return g;
}

/** A puffy cushion: a squashed sphere (round) or a rounded box with bulging faces (square). */
export function cushion(w, h, d, round = true) {
  if (round) return new THREE.SphereGeometry(0.5, 20, 12).scale(w, h, d);
  return roundedBox(w, h, d, h * 0.45, 3);
}

/** A tube along a list of Vector3 points. */
export function tube(points, radius, segments = 32, radial = 5) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, radial, false);
}

/** Points along a hanging garland between a and b, sagging by `sag` metres. */
export function catenary(a, b, sag, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

/** Vertical sisal-rope stripes for scratching posts (colour function for ColorBatch). */
export function sisal(light = '#e2c79a', dark = '#c9a874') {
  const a = new THREE.Color(light), b = new THREE.Color(dark);
  return (x, y, z, c) => c.copy(Math.sin(y * 260) > 0 ? a : b);
}
