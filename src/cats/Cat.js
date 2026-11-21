import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { CatModel, POSES } from './CatModel.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const POSE_KEYS = Object.keys(POSES.stand).filter((k) => k !== 'front' && k !== 'hind');
const WALK = 0.32, TROT = 0.6, RUN = 1.0;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const pick = (weights) => {
  const total = Object.values(weights).reduce((s, w) => s + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) { r -= Math.max(0, w); if (r <= 0) return k; }
  return Object.keys(weights)[0];
};

/** Floating name label that fades in (slowly — no popping) when the player comes close. */
class NameTag {
  constructor(name, trait) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,246,240,0.92)';
    g.beginPath(); if (g.roundRect) g.roundRect(4, 4, 248, 88, 40); else g.rect(4, 4, 248, 88); g.fill();
    g.strokeStyle = '#f6a9bb'; g.lineWidth = 5; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#c4637f'; g.font = 'bold 40px "Comic Sans MS", cursive, sans-serif'; g.fillText(`${name} ♥`, 128, 38);
    g.fillStyle = '#7a6a70'; g.font = '24px "Comic Sans MS", cursive, sans-serif'; g.fillText(trait, 128, 72);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    this.sprite.scale.set(0.24, 0.09, 1);
    this.sprite.raycast = () => {};
    this.sprite.visible = false;
    this.opacity = 0;
  }
  update(dt, show) {
    this.opacity += ((show ? 1 : 0) - this.opacity) * (1 - Math.exp(-2.5 * dt));
    this.sprite.material.opacity = this.opacity;
    this.sprite.visible = this.opacity > 0.02;
  }
}

/**
 * One café cat: a procedural skinned model plus a little brain. States:
 *   idle · wander · sit · loaf · groom · nap (curled up, prefers beds / high perches) · perch
 *   chase (follow a toy: stalk, pounce, swat, rear up) · eat (bowl) · treat (from a hand) · petted · leave
 * Cats walk on the floor around furniture and hop onto cushions, beds, cat-tree platforms, shelves
 * and the window seat (CafeNav perches). Personality numbers (cats.json) shape every choice.
 * def: { name, trait, coat, personality: { energy, play, shy, greed, lazy, tolerance, affection, voice }, start }
 */
export class Cat extends Entity {
  constructor(world, def, index = 0) {
    super(world);
    this.def = def;
    this.name = def.name;
    this.index = index;
    this.p = { energy: 0.5, play: 0.5, shy: 0.1, greed: 0.4, lazy: 0.4, tolerance: 40, affection: 1, voice: 1, ...(def.personality ?? {}) };
    this.model = new CatModel(def.coat ?? { pattern: 'solid', fur: '#ccc' }, index * 7.3 + 1.1);
    this.object3D.add(this.model.group);
    this.tag = new NameTag(def.name, def.trait ?? '');
    this.tag.sprite.position.set(0, 0.5, 0.05);
    this.object3D.add(this.tag.sprite);
    this.tags.add('cat');

    this.pose = { ...POSES.stand, front: null, hind: null };
    this._poseName = 'stand';
    this.look = null;                 // world point to look at
    this.reset();
  }

  /** Back to the start spot, rested, a bit peckish. */
  reset() {
    const p = this.p;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0; this.gait = 0; this.phase = 0;
    this.energy = 0.6 + Math.random() * 0.3;
    this.hunger = this.def.hunger ?? (0.25 + p.greed * 0.4);
    this.contentment = 0;
    this.trust = 1 - p.shy * 0.8;
    this.boredom = new Map();
    this.path = []; this.hop = null;
    this.state = 'idle'; this.stateT = 0; this.stateDur = 1 + Math.random() * 2; this.sub = null; this.subT = 0;
    this.target = null;               // toy / food being pursued
    this.leaveCooldown = 0;
    this._thinkT = Math.random() * 0.5;
    this._blinkAt = 2 + Math.random() * 4; this._blinkT = 1;
    this._twitchAt = 3 + Math.random() * 5; this._twitchT = 1; this._twitchEar = 0;
    this._lastVoice = -Infinity;
    this._stuck = { t: 0, d: Infinity };
    this.releasePerch();
    const nav = this.world.nav, start = this.def.start;
    const perch = start?.perch ? nav?.perches.find((q) => q.id === start.perch) : null;
    if (perch && !perch.occupant) {
      this.object3D.position.set(perch.x, perch.y, perch.z);
      this.onPerch = perch; perch.occupant = this; this.heading = perch.yaw; this.perchTarget = perch;
    } else {
      const s = start?.floor ? { x: start.floor[0], z: start.floor[1] } : nav?.randomPoint() ?? { x: 0, z: 0 };
      this.object3D.position.set(s.x, 0, s.z);
    }
    if (start?.state) this.setState(start.state, { dur: 20 + Math.random() * 20 });
    this._applyPose(1, start?.state === 'nap' ? 'nap' : 'stand');
  }

  onAdded() { this.world.cats.add(this); }
  onRemoved() { this.world.cats.delete(this); this.releasePerch(); }

  // ------------------------------------------------------------------ geometry helpers

  get pos() { return this.object3D.position; }
  get groundY() { return this.onPerch ? this.onPerch.y : 0; }
  forward(target = _v) { return target.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  /** Head (skull centre) in world space. */
  headWorld(target = new THREE.Vector3()) { return this.model.b.head.getWorldPosition(target); }
  /** Mouth in world space: front-bottom of the head. */
  mouthWorld(target = new THREE.Vector3()) {
    const head = this.model.b.head;
    head.updateWorldMatrix(true, false);
    return target.set(0, -0.03, 0.075).applyMatrix4(head.matrixWorld);
  }
  distanceTo(point) { return Math.hypot(point.x - this.pos.x, point.z - this.pos.z); }

  releasePerch() {
    if (this.onPerch?.occupant === this) this.onPerch.occupant = null;
    if (this._reserved?.occupant === this) this._reserved.occupant = null;
    this.onPerch = null; this._reserved = null;
  }

  voice(name, vol = 0.8, minGap = 4) {
    if (this.world.time - this._lastVoice < minGap) return;
    this._lastVoice = this.world.time;
    this.world.audio?.play(name, vol, { pos: this.headWorld(_w), pitch: this.p.voice, key: this.name });
  }

  // ------------------------------------------------------------------ navigation

  /**
   * Plans a route: hop down from the current perch chain, walk across the floor, hop up the
   * destination's chain. dest = { x, z } (floor) or { perch }.
   */
  goTo(dest, speed = WALK) {
    const nav = this.world.nav;
    this.path = [];
    const cur = this.onPerch ? nav.chain(this.onPerch) : [];
    const to = dest.perch ? nav.chain(dest.perch) : [];
    let k = 0;
    while (k < cur.length && k < to.length && cur[k] === to[k]) k++;
    // down to the shared level (or the floor)
    for (let i = cur.length - 1; i >= k; i--) {
      if (i > 0) { const q = cur[i - 1]; this.path.push({ type: 'hop', x: q.x, y: q.y, z: q.z, perch: q }); }
      else { const a = cur[0].approach; this.path.push({ type: 'hop', x: a.x, y: 0, z: a.z, perch: null }); }
    }
    if (dest.perch) {
      if (k === 0) { const a = to[0].approach; this.path.push({ type: 'walk', x: a.x, z: a.z, speed, tol: 0.08 }); }
      for (let i = k; i < to.length; i++) this.path.push({ type: 'hop', x: to[i].x, y: to[i].y, z: to[i].z, perch: to[i] });
      if (this._reserved && this._reserved !== dest.perch && this._reserved.occupant === this) this._reserved.occupant = null;
      dest.perch.occupant = this; this._reserved = dest.perch;
    } else {
      const f = nav.nearestFree(dest.x, dest.z, 0.13);
      this.path.push({ type: 'walk', x: f.x, z: f.z, speed, tol: dest.tol ?? 0.08 });
    }
    this._stuck = { t: 0, d: Infinity };
  }

  /** Re-aims the final floor walk of the current path (cheap: for chasing a moving toy). */
  retarget(x, z, speed) {
    const last = this.path[this.path.length - 1];
    if (last?.type === 'walk' && !this.path.some((s) => s.type === 'hop')) {
      const f = this.world.nav.nearestFree(x, z, 0.13);
      last.x = f.x; last.z = f.z; last.speed = speed;
    } else if (!this.path.length || this.onPerch) this.goTo({ x, z }, speed);
  }

  get moving() { return this.path.length > 0 || !!this.hop; }

  _followPath(dt) {
    if (this.hop) return this._updateHop(dt);
    const step = this.path[0];
    if (!step) { this._slow(dt); return; }
    if (step.type === 'hop') { this._startHop(step); this.path.shift(); return; }

    const nav = this.world.nav, p = this.pos;
    const dx = step.x - p.x, dz = step.z - p.z, d = Math.hypot(dx, dz);
    if (d < (step.tol ?? 0.08)) { this.path.shift(); if (!this.path.length) this._slow(dt); return; }
    // stuck detection: no progress for 2.5 s -> give up this route
    this._stuck.t += dt;
    if (d < this._stuck.d - 0.1) this._stuck = { t: 0, d };
    else if (this._stuck.t > 2.5) { this.path = []; this._onStuck(); return; }

    // steer: aim at the target, try fanned-out headings if the way ahead is blocked
    const want = Math.atan2(dx, dz);
    let best = want;
    const probe = Math.min(0.4, d);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3]) {
      const a = want + off;
      if (nav.isFree(p.x + Math.sin(a) * probe, p.z + Math.cos(a) * probe, 0.12)) { best = a; break; }
    }
    const turn = angDiff(best, this.heading);
    this.heading += THREE.MathUtils.clamp(turn, -7 * dt, 7 * dt);
    const target = Math.min(step.speed ?? WALK, d * 2.5 + 0.08) * Math.max(0.15, Math.cos(Math.min(Math.abs(turn), Math.PI / 2)));
    this.speed += (target - this.speed) * (1 - Math.exp(-6 * dt));
    p.x += Math.sin(this.heading) * this.speed * dt;
    p.z += Math.cos(this.heading) * this.speed * dt;
    nav.resolve(p, 0.12);
    // personal space between cats
    for (const o of this.world.cats) {
      if (o === this || o.onPerch || o.hop) continue;
      const ox = p.x - o.pos.x, oz = p.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < 0.26 && od > 1e-4) { p.x += (ox / od) * (0.26 - od) * 0.5; p.z += (oz / od) * (0.26 - od) * 0.5; }
    }
    p.y = 0;
  }

  _slow(dt) { this.speed *= Math.exp(-8 * dt); if (this.speed < 0.01) this.speed = 0; }

  _onStuck() { if (this.target && this.state === 'chase') this.boredom.set(this.target, (this.boredom.get(this.target) ?? 0) + 0.3); this.setState('idle', { dur: 0.5 + Math.random() }); }

  _startHop(step) {
    const from = this.pos.clone(), to = new THREE.Vector3(step.x, step.y, step.z);
    const flat = Math.hypot(to.x - from.x, to.z - from.z);
    if (this.onPerch && this.onPerch !== step.perch && this.onPerch.occupant === this) this.onPerch.occupant = null;
    this.onPerch = null;
    this.hop = { from, to, perch: step.perch, t: 0, prep: step.pounce ? 0.05 : 0.28, dur: THREE.MathUtils.clamp(0.3 + flat * 0.35 + Math.abs(to.y - from.y) * 0.3, 0.32, 0.75),
      apex: Math.max(from.y, to.y) + 0.06 + flat * 0.12, yaw: flat > 0.04 ? Math.atan2(to.x - from.x, to.z - from.z) : this.heading, pounce: !!step.pounce, onLand: step.onLand };
    this.speed = 0;
  }

  _updateHop(dt) {
    const h = this.hop;
    h.t += dt;
    this.heading += angDiff(h.yaw, this.heading) * (1 - Math.exp(-12 * dt));
    if (h.t < h.prep) return;                                   // crouch and aim
    const k = Math.min(1, (h.t - h.prep) / h.dur);
    const p = this.pos;
    p.x = THREE.MathUtils.lerp(h.from.x, h.to.x, k);
    p.z = THREE.MathUtils.lerp(h.from.z, h.to.z, k);
    // parabola through from.y -> apex -> to.y
    const y0 = h.from.y, y1 = h.to.y, a = h.apex;
    p.y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * (2 * a - (y0 + y1) / 2) + k * k * y1;
    if (k >= 1) {
      p.copy(h.to);
      this.onPerch = h.perch;
      if (h.perch) { h.perch.occupant = this; if (this._reserved === h.perch) this._reserved = null; }
      this.hop = null;
      this.world.audio?.play('thud', 0.35, { pos: p, key: this.name });
      h.onLand?.();
    }
  }

  // ------------------------------------------------------------------ brain

  setState(state, { dur = null, target = null } = {}) {
    if (this.state === 'nap' && state !== 'nap') this.model.blink = 1;
    this.state = state; this.stateT = 0; this.sub = null; this.subT = 0;
    this.stateDur = dur ?? 3;
    this.target = target;
    this.path = [];
    if (this._reserved && this._reserved !== this.hop?.perch && this._reserved.occupant === this) { this._reserved.occupant = null; this._reserved = null; }
  }

  /** Best toy to chase right now, with its interest score. */
  _bestToy() {
    let best = null, bestI = 0, bestLure = null;
    for (const toy of this.world.toys) {
      const lure = toy.lure?.();
      if (!lure) continue;
      const I = this.toyInterest(toy, lure);
      if (I > bestI) { best = toy; bestI = I; bestLure = lure; }
    }
    return { toy: best, interest: bestI, lure: bestLure };
  }

  toyInterest(toy, lure) {
    const kindW = { feather: 1.0, laser: 1.15, ball: 0.85 }[lure.kind] ?? 0.7;
    const still = { feather: 0.12, laser: 0.4, ball: 0.15 }[lure.kind] ?? 0.1;
    const motion = Math.max(THREE.MathUtils.clamp(lure.speed / 0.45, 0, 1), still);
    const h = lure.point.y - this.groundY;
    const heightF = h < 0.6 ? 1 : h < 1.2 ? 0.45 : 0.15;
    const distF = 1 / (1 + this.distanceTo(lure.point) / 2.5);
    const bored = this.boredom.get(toy) ?? 0;
    const energy = 0.35 + 0.65 * this.energy;
    return this.p.play * kindW * motion * heightF * distF * energy * Math.max(0, 1 - bored);
  }

  _bestFood(kind) {
    let best = null, bestD = Infinity, bestInfo = null;
    for (const f of this.world.foods) {
      const info = f.food?.();
      if (!info || info.kind !== kind || info.amount <= 0.01) continue;
      if (kind === 'bowl' && (f.eaters?.size ?? 0) >= 2 && !f.eaters.has(this)) continue;
      if (kind === 'treat' && f.claimedBy && f.claimedBy !== this) continue;
      const d = this.distanceTo(info.point);
      if (d < bestD) { best = f; bestD = d; bestInfo = info; }
    }
    return best ? { food: best, info: bestInfo, d: bestD } : null;
  }

  /** Decides what to do next; called a few times per second and whenever a state finishes. */
  think() {
    if (this.hop) return;
    const p = this.p, s = this.state;
    if (s === 'petted' || s === 'treat' && this.target && this.world.foods.has(this.target)) return;

    // a treat held out (or dropped) nearby
    const treat = this._bestFood('treat');
    if (treat && treat.d < 5 && (this.hunger > 0.1 || p.greed > 0.6) && (s !== 'nap' || p.greed > 0.6 || this.hunger > 0.5) && this.trust > 0.15) {
      treat.food.claimedBy = this;
      this.setState('treat', { target: treat.food, dur: 30 });
      this.voice('mrrp', 0.7, 2);
      return;
    }
    if (s === 'eat' && this.target) return;
    // kibble in a bowl
    const hungry = this.hunger > 0.55 - p.greed * 0.3;
    const bowl = hungry ? this._bestFood('bowl') : null;
    if (bowl && (s !== 'nap' || this.hunger > 0.75)) {
      this.setState('eat', { target: bowl.food, dur: 40 });
      return;
    }
    // toys
    const { toy, interest } = this._bestToy();
    if (s === 'chase') {
      const cur = this.target, curLure = cur?.lure?.();
      const curI = curLure && this.world.toys.has(cur) ? this.toyInterest(cur, curLure) : 0;
      if (toy && toy !== cur && interest > 0.2 && interest > curI * 1.5) { this.setState('chase', { target: toy, dur: 60 }); return; }
      if (curI > 0.07 && this.energy > 0.08) return;                   // keep at it
      this.setState('idle', { dur: 1 + Math.random() * 2 });
      return;
    }
    const threshold = s === 'nap' ? (p.lazy > 0.6 ? 0.75 : 0.45) : 0.2;
    if (toy && interest > threshold && this.energy > 0.15) { this.setState('chase', { target: toy, dur: 60 }); return; }

    // shy cats keep their distance from a player they don't trust yet
    if (p.shy > 0.5 && this.trust < 0.45 && s !== 'leave' && s !== 'nap' && this.leaveCooldown <= 0 && this.groundY < 0.8) {
      const cam = this.world.camera.getWorldPosition(_w);
      if (this.distanceTo(cam) < 0.85) { this.leave(); return; }
    }

    if (this.stateT < this.stateDur && !(this._needsDecision)) return;
    this._needsDecision = false;
    this.chooseIdle();
  }

  leave() {
    const cam = this.world.camera.getWorldPosition(_w);
    const away = new THREE.Vector3(this.pos.x - cam.x, 0, this.pos.z - cam.z).normalize();
    const dest = this.world.nav.randomPoint({ x: this.pos.x + away.x * 1.8, z: this.pos.z + away.z * 1.8 }, 0.8);
    this.setState('leave', { dur: 6 });
    this.goTo(dest, TROT);
    this.leaveCooldown = 15;
  }

  chooseIdle() {
    const p = this.p, tired = 1 - this.energy;
    const w = {
      wander: 0.8 + p.energy * 1.6,
      sit: 1.0, groom: 0.7, loaf: 0.5 + p.lazy * 0.8,
      nap: p.lazy * 1.6 + tired * 2.2 - 0.3,
      perch: 0.9 + p.energy * 0.6 + p.shy * 1.2,
      idle: 0.6,
    };
    if (this.state === 'nap') w.nap *= 0.3;
    if (this.state === 'wander') w.wander *= 0.5;
    const choice = pick(w);
    this.enterIdle(choice);
  }

  enterIdle(choice) {
    const nav = this.world.nav, p = this.p;
    switch (choice) {
      case 'wander': {
        this.setState('wander', { dur: 15 });
        this.goTo(nav.randomPoint(Math.random() < 0.6 ? this.pos : null, 1.8), WALK + p.energy * 0.12);
        break;
      }
      case 'nap': case 'perch': {
        const free = nav.perches.filter((q) => !q.occupant || q.occupant === this);
        if (!free.length) { this.enterIdle('loaf'); return; }
        const score = (q) => (choice === 'nap' ? q.nap * 2 : 1) + (q.y > 0.3 ? 0.4 + p.shy : 0) - this.distanceTo(q) * 0.15 + Math.random() * 0.8;
        const q = free.sort((a, b) => score(b) - score(a))[0];
        this.setState(choice, { dur: choice === 'nap' ? 25 + p.lazy * 50 + Math.random() * 20 : 10 + Math.random() * 15 });
        this.perchTarget = q;
        if (this.onPerch !== q) this.goTo({ perch: q }, WALK);
        break;
      }
      default:
        this.setState(choice, { dur: { sit: 5 + Math.random() * 8, groom: 4 + Math.random() * 4, loaf: 8 + Math.random() * 12, idle: 1.5 + Math.random() * 3 }[choice] ?? 3 });
    }
  }

  // ------------------------------------------------------------------ per-state behaviour

  _tickState(dt) {
    const s = this.state;
    this.stateT += dt;
    let pose = 'stand';
    switch (s) {
      case 'idle': pose = 'stand'; this._lookAround(); break;
      case 'wander': pose = 'stand'; if (!this.moving) this._needsDecision = true; break;
      case 'leave': pose = 'stand'; if (!this.moving) this._needsDecision = true; break;
      case 'sit': pose = 'sit'; this._lookAround(); break;
      case 'loaf': pose = 'loaf'; this._lookAround(); break;
      case 'groom': pose = 'groom'; this.look = null; break;
      case 'nap': case 'perch': pose = this._tickRest(dt, s); break;
      case 'chase': pose = this._tickChase(dt); break;
      case 'eat': pose = this._tickEat(dt); break;
      case 'treat': pose = this._tickTreat(dt); break;
      case 'petted': pose = this._tickPetted?.(dt) ?? 'sit'; break;
      default: break;
    }
    if (this.stateT > this.stateDur && ['idle', 'sit', 'loaf', 'groom', 'nap', 'perch', 'wander', 'leave'].includes(s)) this._needsDecision = true;
    return pose;
  }

  _lookAround() {
    if (!this.look || Math.random() < 0.004) {
      const cam = this.world.camera.getWorldPosition(new THREE.Vector3());
      this.look = Math.random() < 0.5 && this.distanceTo(cam) < 3 ? cam : this.pos.clone().add(new THREE.Vector3(Math.random() * 2 - 1, 0.2 + Math.random() * 0.5, Math.random() * 2 - 1));
    }
  }

  _tickRest(dt, s) {
    if (this.moving) return 'stand';
    const q = this.perchTarget;
    if (q && this.onPerch !== q) { this._needsDecision = true; return 'stand'; }
    if (this.onPerch) this.heading += angDiff(this.onPerch.yaw, this.heading) * (1 - Math.exp(-2 * dt));
    if (s === 'nap') {
      this.energy = Math.min(1, this.energy + dt * 0.03);
      this.look = null;
      return 'nap';
    }
    this._lookAround();
    return this.stateT % 20 < 10 ? 'sit' : 'loaf';
  }

  _tickChase(dt) {
    const toy = this.target, lure = toy?.lure?.();
    if (!toy || !lure || !this.world.toys.has(toy)) { this._needsDecision = true; this.setState('idle', { dur: 1 }); return 'stand'; }
    this.energy = Math.max(0, this.energy - dt * 0.012);
    const bored = this.boredom.get(toy) ?? 0;
    this.boredom.set(toy, Math.min(1, bored + dt * (lure.speed < 0.15 ? 0.05 : 0.006)));
    const pt = lure.point;
    this.look = pt.clone();
    const h = pt.y - this.groundY;
    const fwd = this.forward(_v);
    const mx = this.pos.x + fwd.x * 0.15, mz = this.pos.z + fwd.z * 0.15;
    const d = Math.hypot(pt.x - mx, pt.z - mz), dCat = this.distanceTo(pt);
    this.subT += dt;
    if (this.hop) return this.hop.pounce ? 'leap' : 'stand';

    if (h > 0.62) {                                      // out of reach: sit underneath and watch
      if (dCat > 0.6) { this.retarget(pt.x, pt.z, TROT); return 'stand'; }
      this.path = [];
      this._faceTo(pt, dt);
      if (Math.random() < dt * 0.15) this.voice('mrrp', 0.5, 6);
      return 'sit';
    }
    if (d > 0.36 || this.onPerch) {                       // run after it
      this.sub = null;
      this.retarget(pt.x, pt.z, dCat > 1.2 ? RUN : TROT);
      return 'stand';
    }
    this.path = [];
    this._faceTo(pt, dt);
    if (h < 0.16) {
      // floor level: stalk (crouch, wiggle) then pounce onto it
      if (this.sub !== 'stalk' && this.sub !== 'recover') { this.sub = 'stalk'; this.subT = 0; this._stalkFor = 0.5 + Math.random() * 0.6 * (1.2 - this.p.energy); }
      if (this.sub === 'stalk' && this.subT > this._stalkFor) {
        const land = this.world.nav.nearestFree(pt.x - fwd.x * 0.12, pt.z - fwd.z * 0.12, 0.1);
        this.path = [{ type: 'hop', x: land.x, y: 0, z: land.z, perch: null, pounce: true, onLand: () => {
          const l2 = toy.lure?.();
          if (l2 && this.mouthWorld(_w).distanceTo(l2.point) < 0.3) toy.onSwat?.(this, this.forward(new THREE.Vector3()), 1);
        } }];
        this.sub = 'recover'; this.subT = 0;
        return 'crouch';
      }
      if (this.sub === 'recover' && this.subT > 0.8 + Math.random() * 0.4) this.sub = null;
      return this.sub === 'stalk' ? 'crouch' : 'stand';
    }
    // mid height: rear up and bat at it with alternating paws
    this.sub = 'swat';
    const cycle = Math.floor(this.subT / 0.38);
    if (cycle !== this._swatCycle) {
      this._swatCycle = cycle;
      if (this.headWorld(_w).distanceTo(pt) < 0.3) toy.onSwat?.(this, this.forward(new THREE.Vector3()), 0.7);
    }
    return 'rear';
  }

  _faceTo(pt, dt, rate = 8) {
    const want = Math.atan2(pt.x - this.pos.x, pt.z - this.pos.z);
    this.heading += angDiff(want, this.heading) * (1 - Math.exp(-rate * dt));
  }

  _tickEat(dt) {
    const bowl = this.target, info = bowl?.food?.();
    const done = () => { bowl?.eaters?.delete(this); this.setState('groom', { dur: 4 + Math.random() * 3 }); if (this.hunger < 0.2) this.voice('happyMeow', 0.6, 3); return 'stand'; };
    if (!info || info.amount <= 0.01 || this.hunger < 0.03) return done();
    const pt = info.point;
    // stand with the mouth over the bowl, approaching from whichever side we're on
    if (!this.sub) {
      const ax = this.pos.x - pt.x, az = this.pos.z - pt.z, ad = Math.hypot(ax, az) || 1;
      let spot = { x: pt.x + (ax / ad) * 0.2, z: pt.z + (az / ad) * 0.2 };
      if (!this.world.nav.isFree(spot.x, spot.z, 0.08, false)) spot = { x: pt.x, z: pt.z + 0.22 };
      this.goTo({ x: spot.x, z: spot.z, tol: 0.05 }, TROT);
      this.sub = 'approach';
      bowl.eaters?.add(this);
    }
    if (this.moving) return 'stand';
    if (this.distanceTo(pt) > 0.4) { this.sub = null; return 'stand'; }
    this.sub = 'eating';
    this._faceTo(pt, dt, 5);
    this.look = null;
    const eaten = bowl.eat(this, dt);
    this.hunger = Math.max(0, this.hunger - eaten * 1.6);
    if (Math.random() < dt * 1.3) {
      this.world.audio?.play('crunch', 0.6, { pos: pt, key: this.name });
      this.world.particles?.crumbs.emitBurst(this.mouthWorld(_w), 2, { color: [0.62, 0.42, 0.25, 0.9], speed: 0.25, size: 0.006, life: 0.5, up: 0.25 });
    }
    return 'eat';
  }

  _tickTreat(dt) {
    const treat = this.target, info = treat?.food?.();
    if (!info || !this.world.foods.has(treat)) { this.setState('sit', { dur: 3 }); this._needsDecision = false; return 'sit'; }
    const pt = info.point, mouth = this.mouthWorld(_w);
    this.look = pt.clone();
    const h = pt.y - this.groundY;
    if (mouth.distanceTo(pt) < 0.13 && !this.hop) {
      // nibble it from the hand
      this.path = [];
      this.sub = 'nibble';
      this.subT += dt;
      if (this.subT > 1.1) {
        treat.eatTreat?.(this);
        this.hunger = Math.max(0, this.hunger - 0.25);
        this.contentment = Math.min(1, this.contentment + 0.3);
        this.trust = Math.min(1, this.trust + 0.25);
        this.world.audio?.play('crunch', 0.8, { pos: pt, key: this.name });
        this.world.particles?.crumbs.emitBurst(pt, 5, { color: [0.75, 0.5, 0.3, 0.9], speed: 0.3, size: 0.006, life: 0.6, up: 0.2 });
        this.world.after(0.6, () => this.voice('happyMeow', 0.8, 1));
        this.setState('sit', { dur: 3 + Math.random() * 3 });
        return 'sit';
      }
      return h < 0.3 ? 'eat' : h < 0.55 ? 'rear' : 'sit';
    }
    this.subT = Math.max(0, this.subT - dt);
    const dCat = this.distanceTo(pt);
    if (this.onPerch && dCat < 0.45 && Math.abs(h) < 0.4) { this._faceTo(pt, dt); return 'sit'; }   // bring it to me
    // walk to a spot just behind the treat, facing it
    const ax = this.pos.x - pt.x, az = this.pos.z - pt.z, ad = Math.hypot(ax, az) || 1;
    const sx = pt.x + (ax / ad) * 0.19, sz = pt.z + (az / ad) * 0.19;
    if (Math.hypot(sx - this.pos.x, sz - this.pos.z) > 0.1 || this.onPerch) { this.retarget(sx, sz, dCat > 1.5 ? TROT : WALK); return 'stand'; }
    this.path = [];
    this._faceTo(pt, dt);
    if (h > 0.55) { if (Math.random() < dt * 0.3) this.voice('meow', 0.6, 5); return 'sit'; }      // begging
    return h < 0.3 ? 'eat' : 'rear';
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    const w = this.world;
    this.hunger = Math.min(1, this.hunger + dt * (0.002 + this.p.greed * 0.004));
    if (this.state !== 'nap') this.energy = Math.min(1, this.energy + dt * 0.002);
    for (const [toy, b] of this.boredom) { const nb = b - dt * 0.02; if (nb <= 0 || !w.toys.has(toy)) this.boredom.delete(toy); else this.boredom.set(toy, nb); }
    this.leaveCooldown = Math.max(0, this.leaveCooldown - dt);
    this.petting?.sense(dt);

    this._thinkT -= dt;
    if (this._thinkT <= 0 || this._needsDecision) { this._thinkT = 0.35 + Math.random() * 0.2; this.think(); }

    const poseName = this._tickState(dt);
    this._followPath(dt);
    this._applyPose(dt, poseName);
    this.object3D.rotation.y = this.heading;

    const cam = w.camera.getWorldPosition(_w);
    this.tag.update(dt, cam.distanceTo(this.pos) < 1.6);
  }

  _applyPose(dt, poseName) {
    const w = this.world, t = w.time;
    if (this.hop && poseName !== 'leap') poseName = this.hop.t < this.hop.prep ? 'crouch' : 'leap';
    this._poseName = poseName;
    const target = POSES[poseName] ?? POSES.stand, P = this.pose;
    const k = dt >= 1 ? 1 : 1 - Math.exp(-(this.hop ? 14 : 6) * dt);
    for (const key of POSE_KEYS) P[key] += (target[key] - P[key]) * k;
    // legs: planted (null) or fixed angles, blended through a planted-equivalent
    for (const key of ['front', 'hind']) {
      const tgt = target[key], cur = P[`_${key}`] ?? null;
      const tv = tgt ?? (key === 'front' ? -CatModel.plant(CatModel.jointHeight(P.spineY, P.spinePitch, { y: -0.03, z: 0.16 }))
        : CatModel.plant(CatModel.jointHeight(P.spineY, P.spinePitch, { y: -0.03, z: 0 })));
      P[`_${key}`] = cur == null ? tv : cur + (tv - cur) * k;
      P[key] = tgt == null && Math.abs(P[`_${key}`] - tv) < 0.02 ? null : P[`_${key}`];
    }
    // little extras: grooming lick, stalking wiggle, swatting paws, content squint
    if (poseName === 'groom') { P.neckPitch = 0.4 + Math.sin(t * 7) * 0.12; P.frontL = -1.9 + Math.sin(t * 7) * 0.15; }
    if (poseName === 'crouch' && this.sub === 'stalk') P.spineRoll = Math.sin(t * 16) * 0.06;
    if (poseName === 'rear') { const s = Math.sin(this.subT * Math.PI / 0.38); P.frontL = Math.max(0, s) * -0.9; P.frontR = Math.max(0, -s) * -0.9; }
    if (this.contentment > 0.2) P.eyeOpen = Math.min(P.eyeOpen, 1 - this.contentment * 0.85);

    // head: look at a point (blended over the pose's own neck angles)
    let yaw = P.neckYaw, pitch = P.neckPitch;
    if (this.look && poseName !== 'nap' && poseName !== 'eat' && poseName !== 'groom') {
      this.object3D.updateMatrixWorld(true);
      const lp = this.object3D.worldToLocal(_w.copy(this.look));
      const nb = this.model.b.neck; nb.updateWorldMatrix(true, false);
      const n = this.object3D.worldToLocal(nb.getWorldPosition(new THREE.Vector3()));
      lp.sub(n);
      yaw = THREE.MathUtils.clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1);
      pitch = THREE.MathUtils.clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.7, 0.6);
    }
    this._yaw = (this._yaw ?? 0) + (yaw - (this._yaw ?? 0)) * (1 - Math.exp(-5 * dt));
    this._pitch = (this._pitch ?? 0) + (pitch - (this._pitch ?? 0)) * (1 - Math.exp(-5 * dt));
    const neck = { ...P, neckYaw: this._yaw, neckPitch: this._pitch };

    // blinking and ear twitches
    this._blinkT += dt / 0.16;
    if (t > this._blinkAt) { this._blinkT = 0; this._blinkAt = t + 2.5 + Math.random() * 5; }
    this.model.blink = this._blinkT < 1 ? Math.abs(this._blinkT * 2 - 1) : 1;
    this._twitchT += dt / 0.3;
    if (t > this._twitchAt) { this._twitchT = 0; this._twitchEar = Math.random() < 0.5 ? 0 : 1; this._twitchAt = t + 3 + Math.random() * 7; }
    const tw = this._twitchT < 1 ? Math.sin(this._twitchT * Math.PI) : 0;

    this.gait += ((this.speed > 0.03 ? Math.min(1, this.speed / 0.35) : 0) - this.gait) * (1 - Math.exp(-8 * dt));
    this.phase += dt * (this.speed / 0.11) * Math.PI;
    const calm = this.contentment;
    this.model.apply(neck, {
      gait: this.gait, phase: this.phase, t,
      sway: poseName === 'nap' ? 0.05 : poseName === 'crouch' ? 0.45 : THREE.MathUtils.lerp(0.25, 0.08, calm),
      swayFreq: poseName === 'crouch' ? 3 : THREE.MathUtils.lerp(1.3, 0.6, calm),
      twitch: [this._twitchEar === 0 ? tw : 0, this._twitchEar === 1 ? tw : 0],
    });
    // breathing (slow, always)
    const breath = Math.sin(t * (poseName === 'nap' ? 1.6 : 2.4)) * 0.012;
    this.model.b.spine.scale.set(1 + breath * 0.6, 1 + breath, 1);
  }
}
