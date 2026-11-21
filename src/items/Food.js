import * as THREE from 'three';
import { Item } from './Item.js';
import { Entity } from '../core/Entity.js';
import { CanvasPanel } from '../ui/CanvasPanel.js';
import { roundedBox } from '../cafe/shapes.js';
import { paw, heart } from '../cafe/textures.js';
import { bake } from '../util/bake.js';

const _s = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3();
const KIBBLE = [0.62, 0.4, 0.24, 1];

class Label extends CanvasPanel {
  constructor(w, h, title, sub, bg = '#fff6e6', fg = '#c4637f') { super(w, h, 1600); Object.assign(this, { title, sub, bg, fg }); this.redraw(); }
  draw(g, w, h) {
    g.fillStyle = this.bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = this.fg; g.lineWidth = Math.max(3, h * 0.04); g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    g.fillStyle = this.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${h * 0.28}px "Comic Sans MS", cursive, sans-serif`; g.fillText(this.title, w / 2, h * 0.36);
    g.font = `${h * 0.15}px "Comic Sans MS", cursive, sans-serif`; g.fillText(this.sub, w / 2, h * 0.7);
    g.fillStyle = '#f6a9bb'; paw(g, w * 0.14, h * 0.75, h * 0.12); heart(g, w * 0.86, h * 0.75, h * 0.12);
  }
}

/**
 * A ceramic food bowl. Pour kibble in and a mound fills it up; hungry cats come over and eat
 * (up to two at a time) and the mound shrinks. Grabbable — put it wherever you like.
 * def: { color, capacity = 1 }
 */
export class FoodBowl extends Item {
  build() {
    this.height = 0.05; this.grabRadius = 0.08;
    this.amount = 0;
    this.eaters = new Set();
    const prof = [[0, 0], [0.055, 0], [0.062, 0.006], [0.08, 0.045], [0.088, 0.05], [0.084, 0.054], [0.072, 0.05], [0.055, 0.016], [0, 0.016]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshLambertMaterial({ color: this.def.color ?? '#f6a9bb', side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#fff6e6' }));
    inner.position.y = 0.017;
    // the kibble mound: a bumpy dome scaled by how full the bowl is
    const geo = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + Math.sin(v.x * 40) * Math.cos(v.z * 37) * 0.06 + Math.sin(v.x * 23 + v.z * 19) * 0.05;
      pos.setXYZ(i, v.x * n, v.y * n, v.z * n);
      const k = 0.85 + ((i * 7919) % 13) / 13 * 0.3;
      cols.set([KIBBLE[0] * k, KIBBLE[1] * k, KIBBLE[2] * k], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    this.mound = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mound.position.y = 0.016;
    this.object3D.add(bowl, inner, this.mound);
    this._refresh();
  }

  onAdded() { super.onAdded(); this.world.foods.add(this); }
  onRemoved() { super.onRemoved(); this.world.foods.delete(this); this.eaters.clear(); }
  get collisionRadius() { return 0.08; }
  collisionSegment(a, b) { this.worldPointAt(0.02, a); this.worldPointAt(0.03, b); }

  _refresh() {
    const a = this.amount;
    this.mound.visible = a > 0.005;
    const r = 0.052 + a * 0.025;
    this.mound.scale.set(r, 0.006 + a * 0.034, r);
  }

  /** Where cats find it. */
  food() {
    if (this.body.held || this.amount <= 0.01) return null;
    return { point: this.worldPointAt(0.03, new THREE.Vector3()), amount: this.amount, kind: 'bowl' };
  }

  /** Is a falling kibble at `point` going into this bowl? */
  catches(point) {
    const p = this.object3D.position;
    return Math.hypot(point.x - p.x, point.z - p.z) < 0.075 && point.y > p.y && point.y - p.y < 1.0 && !this.body.held;
  }

  addKibble(x) {
    const before = this.amount;
    this.amount = Math.min(1, this.amount + x);
    this._refresh();
    return this.amount - before;
  }

  /** A cat eats for dt seconds; returns how much it ate. */
  eat(cat, dt) {
    const bite = Math.min(this.amount, dt * 0.035);
    this.amount -= bite;
    this._refresh();
    return bite;
  }
}

/**
 * A soft pouch of kibble. Grab it and tilt it past ~70° (spout down) to pour: kibble rattles out
 * of the spout; whatever lands in a bowl fills it. Only pours while held.
 */
export class KibbleBag extends Item {
  build() {
    this.height = 0.24; this.grabRadius = 0.06;
    const body = new THREE.Mesh(roundedBox(0.15, 0.22, 0.075, 0.03), new THREE.MeshLambertMaterial({ color: this.def.color ?? '#fbd3b5' }));
    body.position.y = 0.11;
    const top = new THREE.Mesh(roundedBox(0.15, 0.035, 0.03, 0.012), new THREE.MeshLambertMaterial({ color: '#f6a9bb' }));
    top.position.y = 0.225;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.025, 12), new THREE.MeshLambertMaterial({ color: '#97d1bb' }));
    spout.position.set(0.05, 0.25, 0);
    for (const z of [-1, 1]) {
      const label = new Label(0.11, 0.09, 'KARMA', 'dla kotków ♥');
      label.mesh.position.set(0, 0.11, z * 0.039);
      if (z < 0) label.mesh.rotation.y = Math.PI;
      this.object3D.add(label.mesh);
    }
    this.object3D.add(body, top, spout);
    this._pourT = 0;
    this.pouring = 0;
  }

  get collisionRadius() { return 0.06; }

  spoutWorld(target = new THREE.Vector3()) { return target.set(0.05, 0.265, 0).applyMatrix4(this.object3D.matrixWorld); }

  update(dt) {
    const hand = this.body.held;
    this.pouring = 0;
    if (!hand) return;
    this.object3D.updateMatrixWorld(true);
    const up = _u.set(0, 1, 0).applyQuaternion(this.object3D.quaternion);
    const flow = THREE.MathUtils.clamp((0.34 - up.y) / 0.6, 0, 1);
    if (flow <= 0) return;
    this.pouring = flow;
    const s = this.spoutWorld(_s);
    // kibble pieces: fall from the spout; life = time to reach whatever is below
    const w = this.world, bowl = [...w.foods].find((f) => f.catches?.(s));
    const below = bowl ? bowl.object3D.position.y + 0.03 : (w.physics.surfaceAt(s.x, s.z, s.y)?.top ?? 0);
    const fall = Math.sqrt(Math.max(0.01, 2 * (s.y - below) / 9));
    w.particles?.kibble.emitRate(flow * 40 * dt, () => w.particles.kibble.emit(s,
      { x: up.x * 0.3 + (Math.random() - 0.5) * 0.08, y: up.y * 0.3, z: up.z * 0.3 + (Math.random() - 0.5) * 0.08 },
      KIBBLE, 0.009, fall));
    this._pourT -= dt;
    if (this._pourT <= 0) { this._pourT = 0.12; w.audio?.play(bowl ? 'kibbleBowl' : 'kibble', 0.5 + flow * 0.5, { pos: bowl ? bowl.object3D.position : s }); }
    if (bowl) {
      const added = bowl.addKibble(flow * 0.25 * dt);
      if (added > 0) hand.pulse?.(0.08 + flow * 0.1, 15);
    }
  }
}

/** A fish-shaped biscuit. Hold it out low and a cat comes to nibble it from your hand. */
export class Treat extends Item {
  build() {
    this.height = 0.02; this.grabRadius = 0.025;
    const mat = new THREE.MeshLambertMaterial({ color: this.def.color ?? '#d9925a' });
    const fish = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
    fish.scale.set(0.012, 0.008, 0.02); fish.position.y = 0.008;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.014, 3).rotateX(-Math.PI / 2), mat);
    tail.position.set(0, 0.008, -0.024); tail.scale.y = 0.5;
    this.object3D.add(fish, tail);
    this.claimedBy = null;
  }
  onAdded() { super.onAdded(); this.body.restHeight = 0; this.world.foods.add(this); }
  onRemoved() { super.onRemoved(); this.world.foods.delete(this); }
  get totalMassG() { return 5; }

  food() { return { point: this.object3D.getWorldPosition(new THREE.Vector3()), amount: 1, kind: 'treat', held: !!this.body.held }; }

  /** A cat ate it. */
  eatTreat(cat) {
    const hand = this.body.held;
    hand?.pulse?.(0.5, 80);
    const p = this.object3D.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 4; i++) this.world.particles?.hearts.emit(p, { x: (Math.random() - 0.5) * 0.1, y: 0.1 + Math.random() * 0.05, z: (Math.random() - 0.5) * 0.1 }, [1, 0.62, 0.75, 0.85], 0.02, 2, 0.4);
    this.eatenBy = cat;
    this.world.remove(this);
  }
}

/**
 * A glass jar of fish treats on the counter (fixed in place). Reach into its open top and grip:
 * you come out holding a treat. At most `maxTreats` treats are out at once (the oldest one that
 * nobody holds disappears).
 * def: { position, maxTreats = 4 }
 */
export class TreatJar extends Entity {
  constructor(world, def) {
    super(world);
    this.def = def;
    this.object3D.position.set(...def.position);
    this.r = 0.065; this.h = 0.16;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(this.r, this.r, this.h, 24, 1, true), new THREE.MeshLambertMaterial({ color: '#eef8ff', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.y = this.h / 2; glass.renderOrder = 2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(this.r, this.r, 0.008, 24), new THREE.MeshLambertMaterial({ color: '#eef8ff' }));
    base.position.y = 0.004;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(this.r, 0.006, 6, 24).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f6a9bb' }));
    rim.position.y = this.h;
    // treats inside (static heap)
    const heap = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d9925a' }));
    heap.scale.set(this.r * 0.92, 0.07, this.r * 0.92); heap.position.y = 0.008;
    // lid with a cat-ear knob, leaning against the jar
    const lid = new THREE.Group();
    lid.add(new THREE.Mesh(new THREE.CylinderGeometry(this.r + 0.006, this.r + 0.006, 0.018, 24), new THREE.MeshLambertMaterial({ color: '#f6a9bb' })));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.025, 8), new THREE.MeshLambertMaterial({ color: '#fff6e6' })); e.position.set(sx * 0.025, 0.02, 0); lid.add(e); }
    lid.position.set(0.11, 0.07, 0.0); lid.rotation.z = 1.25;
    const label = new Label(0.11, 0.06, 'Smakołyki', 'sięgnij do środka', '#fff6e6', '#b0744a');
    label.mesh.position.set(0, 0.075, this.r + 0.002);
    this.object3D.add(glass, base, rim, heap, lid, label.mesh);
    bake(this.object3D, new Set([glass, label.mesh]));
    this.mouth = new THREE.Vector3();
    this.out = [];
    world.controls.add(this);
  }

  onRemoved() { this.world.controls.delete(this); }

  /** Reach: distance from the hand to the inside / opening of the jar. */
  distanceToPoint(p) {
    const o = this.object3D.position;
    const radial = Math.max(0, Math.hypot(p.x - o.x, p.z - o.z) - this.r);
    const vertical = p.y < o.y ? o.y - p.y : p.y > o.y + this.h + 0.03 ? p.y - (o.y + this.h + 0.03) : 0;
    return Math.hypot(radial, vertical);
  }

  beginGrab(hand) {
    hand.heldControl = null;                     // not a control after all: you come out with a treat
    const w = this.world;
    this.out = this.out.filter((t) => w.entities.has(t));
    while (this.out.length >= (this.def.maxTreats ?? 4)) {
      const old = this.out.find((t) => !t.body.held);
      if (!old) break;
      w.remove(old); this.out.splice(this.out.indexOf(old), 1);
    }
    const treat = new Treat(w, { color: ['#d9925a', '#e8a86a', '#c98250'][Math.floor(Math.random() * 3)] }, 'Treat');
    treat.object3D.position.copy(hand.position);
    w.add(treat);
    this.out.push(treat);
    w.input.grab(hand, treat);
    w.audio?.play('lid', 0.6, { pos: this.object3D.position });
  }
  endGrab() {}
  update() {}
}
