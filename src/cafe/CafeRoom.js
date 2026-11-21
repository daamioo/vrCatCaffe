import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { Surface } from '../physics/Surface.js';
import { ColorBatch, bake } from '../util/bake.js';
import { wallTexture, floorTexture, ceilingTexture, windowView } from './textures.js';
import { roundedBox, tube, catenary } from './shapes.js';

const BULB_COLORS = ['#fff1c9', '#ffd9b0', '#ffc8d6', '#d8f5e4', '#e6dcff'];

/**
 * The café shell: wooden floor (a Surface), wallpapered walls with window openings and a door,
 * a beamed cream ceiling, pendant lamps over the counter, garlands of warm string lights and the
 * lighting. Lights are static — nothing here blinks or pulses.
 * def (cafe.json → room): { windows: [{ wall, u: [a, b], v: [a, b] }], door: { wall, u }, garlands: [[x0,z0,x1,z1,sag]], pendants: [[x, z]] }
 */
export class CafeRoom extends Entity {
  constructor(world, def = {}) {
    super(world);
    const { width: w, depth: d, height: h } = world.settings.room;
    this.dims = { w, d, h };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: floorTexture(w / 1.2, d / 1.2) }));
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: ceilingTexture(w / 2, d / 2) }));
    ceiling.position.y = h;
    this.object3D.add(floor, ceiling);
    this.floorMesh = floor;

    const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture(h) });
    const trim = new ColorBatch(), glass = new ColorBatch();
    const walls = {
      back: { length: w, pos: [0, 0, -d / 2], rot: 0 },
      front: { length: w, pos: [0, 0, d / 2], rot: Math.PI },
      left: { length: d, pos: [-w / 2, 0, 0], rot: Math.PI / 2 },
      right: { length: d, pos: [w / 2, 0, 0], rot: -Math.PI / 2 },
    };
    const holes = {};
    for (const win of def.windows ?? []) (holes[win.wall] ??= []).push({ ...win, kind: 'window' });
    if (def.door) (holes[def.door.wall] ??= []).push({ u: [def.door.u - 0.5, def.door.u + 0.5], v: [0, 2.15], kind: 'door' });
    this.viewMat = null;
    for (const [name, wl] of Object.entries(walls)) {
      const L = wl.length / 2;
      const outline = [new THREE.Vector2(-L, 0)];
      for (const hole of holes[name] ?? []) {
        if (hole.kind !== 'door') continue;                       // a door notches the outline
        const [u0, u1] = hole.u, v1 = hole.v[1];
        outline.push(new THREE.Vector2(u0, 0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, 0));
      }
      outline.push(new THREE.Vector2(L, 0), new THREE.Vector2(L, h), new THREE.Vector2(-L, h));
      const shape = new THREE.Shape(outline);
      for (const hole of holes[name] ?? []) {
        if (hole.kind === 'door') continue;
        const [u0, u1] = hole.u, [v0, v1] = hole.v;
        shape.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, v0)]));
      }
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), wallMat);
      const group = new THREE.Group();
      group.position.set(...wl.pos); group.rotation.y = wl.rot;
      group.add(mesh);
      this.object3D.add(group);
      group.updateMatrixWorld(true);
      const M = group.matrixWorld;
      const add = (geo, color, x, y, z) => trim.add(geo, color, 0, 0, 0, { matrix: M.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)) });
      // crown moulding
      add(new THREE.BoxGeometry(wl.length, 0.08, 0.05), '#fff6e6', 0, h - 0.04, 0.025);
      for (const hole of holes[name] ?? []) {
        const [u0, u1] = hole.u, [v0, v1] = hole.v, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ww = u1 - u0, hh = v1 - v0, t = 0.07;
        const frame = hole.kind === 'door' ? '#f3b8c6' : '#fffaf2';
        add(roundedBox(ww + 2 * t, t, 0.16, 0.025), frame, cu, v1 + t / 2, 0);
        add(roundedBox(t, hh + (v0 > 0 ? 2 * t : t), 0.16, 0.025), frame, u0 - t / 2, cv + (v0 > 0 ? 0 : t / 2), 0);
        add(roundedBox(t, hh + (v0 > 0 ? 2 * t : t), 0.16, 0.025), frame, u1 + t / 2, cv + (v0 > 0 ? 0 : t / 2), 0);
        if (hole.kind === 'window') {
          add(roundedBox(ww + 0.2, 0.04, 0.2, 0.015), '#fffaf2', cu, v0 - t, 0.06);                 // sill
          add(new THREE.BoxGeometry(0.035, hh, 0.04), '#fffaf2', cu, cv, -0.05);                 // mullion
          add(new THREE.BoxGeometry(ww, 0.035, 0.04), '#fffaf2', cu, v0 + hh * 0.62, -0.05);      // transom
          const g = new THREE.PlaneGeometry(ww, hh);
          glass.add(g, '#e8f4ff', 0, 0, 0, { matrix: M.clone().multiply(new THREE.Matrix4().makeTranslation(cu, cv, -0.06)) });
          // the painted street outside, a little way beyond the glass
          this.viewMat ??= new THREE.MeshBasicMaterial({ map: windowView(), toneMapped: false });
          const view = new THREE.Mesh(new THREE.PlaneGeometry(ww * 1.9, hh * 1.6), this.viewMat);
          view.position.set(cu, cv, -0.9);
          group.add(view);
          // pastel scalloped awning-style valance over the window
          for (let k = 0; k < Math.round(ww / 0.18); k++) {
            const x = u0 + 0.09 + k * 0.18;
            add(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.7, 0.4), k % 2 ? '#ffffff' : '#f6a9bb', x, v1 + 0.02, 0.09);
          }
          add(new THREE.BoxGeometry(ww + 0.1, 0.1, 0.16), '#f6a9bb', cu, v1 + 0.08, 0.08);
        } else {
          // door: mint panel with a round porthole window, brass knob
          add(roundedBox(ww - 0.02, hh - 0.02, 0.05, 0.03), '#bfe6d6', cu, cv, -0.03);
          add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 28).rotateX(Math.PI / 2), '#fffaf2', cu, 1.5, -0.02);
          glass.add(new THREE.CircleGeometry(0.14, 28), '#cfe9ff', 0, 0, 0, { matrix: M.clone().multiply(new THREE.Matrix4().makeTranslation(cu, 1.5, 0.012)) });
          add(new THREE.SphereGeometry(0.03, 12, 8), '#e2b65a', u0 + 0.12, 1.0, 0.02);
          add(roundedBox(0.6, 0.015, 0.4, 0.006), '#e9a3b4', cu, 0.008, 0.25);                  // doormat
        }
      }
    }

    // ceiling beams
    for (const x of [-2.4, -0.8, 0.8, 2.4]) trim.add(new THREE.BoxGeometry(0.14, 0.12, d), '#e8cfae', x, h - 0.06, 0);

    // pendant lamps over the counter: cord, pastel dome shade, glowing bulb
    const glow = new ColorBatch();
    (def.pendants ?? []).forEach(([x, z], i) => {
      const y = h - 0.75;
      trim.add(new THREE.CylinderGeometry(0.005, 0.005, 0.7, 6), '#8a7a70', x, h - 0.35, z);
      trim.add(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ['#f6a9bb', '#bfe6d6', '#d9cff2'][i % 3], x, y, z);
      glow.add(new THREE.SphereGeometry(0.05, 14, 10), '#fff1c9', x, y - 0.02, z);
    });

    // garlands of string lights: a dark wire with pastel bulbs hanging off it
    for (const [x0, z0, x1, z1, sag = 0.35] of def.garlands ?? []) {
      const pts = catenary(new THREE.Vector3(x0, h - 0.12, z0), new THREE.Vector3(x1, h - 0.12, z1), sag);
      trim.add(tube(pts, 0.004, 40, 4), '#6b5a55');
      const n = Math.round(pts[0].distanceTo(pts[pts.length - 1]) / 0.32);
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let k = 1; k < n; k++) {
        const p = curve.getPoint(k / n);
        trim.add(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), '#6b5a55', p.x, p.y - 0.012, p.z);
        glow.add(new THREE.SphereGeometry(0.022, 10, 8).scale(1, 1.3, 1), BULB_COLORS[k % BULB_COLORS.length], p.x, p.y - 0.04, p.z);
      }
    }

    this.trimMesh = trim.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.glowMesh = glow.empty ? null : glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    const glassMesh = glass.build(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false }));
    glassMesh.renderOrder = 2;
    this.object3D.add(this.trimMesh, glassMesh);
    if (this.glowMesh) this.object3D.add(this.glowMesh);
    bake(this.object3D, new Set([this.trimMesh, glassMesh, this.glowMesh].filter(Boolean)));   // the four walls -> one mesh

    this._addLights(h, def);
  }

  _addLights(h, def) {
    this.object3D.add(new THREE.HemisphereLight(0xfff3e6, 0xd9b3bf, 1.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.3);       // warm daylight through the window
    sun.position.set(-4, 3.5, 1);
    this.object3D.add(sun);
    for (const [x, z] of def.warmLights ?? [[-1.2, -1.8], [1.2, 1.0]]) {
      const lamp = new THREE.PointLight(0xffd9a8, 2.2, 6, 1.2);
      lamp.position.set(x, h - 0.6, z);
      this.object3D.add(lamp);
    }
  }

  onAdded() {
    const { w, d } = this.dims;
    this.floor = this.world.physics.addSurface(new Surface({ owner: this, shape: 'rect', x: 0, z: 0, top: 0, halfX: w / 2, halfZ: d / 2 }));
  }
  onRemoved() { this.world.physics.removeSurface(this.floor); }
}
