import * as THREE from 'three';
import { BODY_C, BODY_R, HEAD_R } from './CatModel.js';

const _lp = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _mv = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * Petting, as in the lab's cat: stroke a cat with an OPEN hand (no grip; on desktop just move the
 * cursor over it). Strokes along the fur build contentment — head scratches best, head-to-tail
 * along the back next, tail-to-head ruffles the fur and flicks the ears. A content cat purrs (the
 * controller rumbles with it), squints, leans its head into your hand and pushes its back up, and
 * soft pink motes drift up. A wandering cat stops and sits / loafs for you; after a while (its
 * `tolerance`, in seconds) it has had enough and walks off. Napping lazy cats just purr in their
 * sleep. Shy cats flinch from a fast hand until they trust you (gentle strokes and treats help).
 */
export class CatPetting {
  constructor(cat) {
    this.cat = cat;
    this._prev = new Map();          // hand -> previous world position
    this.lastStroke = -Infinity;
    this.petTime = 0;                // seconds of petting in this session
    this.headTouch = false; this.leanSide = 0; this.backTouch = 0;
    this.hand = null;
    this._lastHello = -Infinity; this._handWasNear = false; this._heartT = 0;
  }

  get stroking() { return this.cat.world.time - this.lastStroke < 0.6; }
  get purring() { const c = this.cat; return c.contentment > 0.12 && (c.world.time - this.lastStroke < 2.5 || (c.state === 'nap' && c.contentment > 0.3)); }

  /** Distance from a world point to the fur (body ellipsoid or head sphere) and which part. */
  surface(point) {
    const m = this.cat.model.b;
    m.spine.updateWorldMatrix(true, false);
    _lp.copy(point); m.spine.worldToLocal(_lp);
    _d.copy(_lp).sub(BODY_C).divide(BODY_R);
    const body = (_d.length() - 1) * BODY_R.y;
    m.head.getWorldPosition(_h);
    const head = point.distanceTo(_h) - HEAD_R;
    return head < body ? { d: head, part: 'head' } : { d: body, part: 'body' };
  }

  sense(dt) {
    const cat = this.cat, w = cat.world, t = w.time;
    let stroke = 0, touching = false, anyNear = false, ruffled = false, nearest = null, nearD = 0.5;
    this.headTouch = false;
    cat.object3D.updateMatrixWorld(true);
    const spineQ = cat.model.b.spine.getWorldQuaternion(_q).invert();
    for (const hand of w.input?.hands ?? []) {
      if (hand.held || hand.heldControl || hand.airGrab) { this._prev.delete(hand); continue; }
      const { d, part } = this.surface(hand.position);
      if (d < 0.35) anyNear = true;
      if (d < nearD) { nearD = d; nearest = hand; }
      const prev = this._prev.get(hand);
      const onFur = d < 0.05 && d > -0.15;
      if (onFur && prev && dt > 0) {
        touching = true;
        _mv.copy(hand.position).sub(prev);
        const speed = _mv.length() / dt;
        _mv.applyQuaternion(spineQ);                              // movement in the cat's own frame (+Z = towards the head)
        if (speed > 1.3 && cat.trust < 0.35 && cat.p.shy > 0.5 && cat.state !== 'nap') { this._flinch(); return; }
        if (speed > 0.05 && speed < 4) {
          let k = 1;
          if (part === 'body') {
            if (_mv.z < -0.5 * _mv.length()) k = 1.25;                       // head -> tail, with the grain
            else if (_mv.z > 0.6 * _mv.length() && speed > 0.15) { k = 0.4; ruffled = true; }
          } else { this.headTouch = true; k = 1.4; }                          // chin / cheek scritches
          stroke += Math.min(speed, 0.6) * k;
        }
        if (part === 'head') {
          this.headTouch = true;
          _lp.copy(hand.position); cat.model.b.head.worldToLocal(_lp);
          this.leanSide = Math.sign(_lp.x) || 1;
        }
      }
      if (onFur || d < 0.15) this._prev.set(hand, (prev ?? new THREE.Vector3()).copy(hand.position));
      else this._prev.delete(hand);
      if (onFur && cat.contentment > 0.12) hand.pulse?.(0.06 + cat.contentment * 0.22, 30);   // feel the purr
    }
    this.hand = nearest;

    const p = cat.p;
    if (stroke > 0) {
      this.lastStroke = t;
      this.petTime += dt;
      cat.contentment = Math.min(1, cat.contentment + stroke * dt * 1.6 * p.affection * (0.4 + 0.6 * cat.trust));
      cat.trust = Math.min(1, cat.trust + stroke * dt * 0.12);
      if (cat.state !== 'petted' && cat.leaveCooldown <= 0 && !cat.hop && ['idle', 'wander', 'sit', 'loaf', 'groom', 'perch'].includes(cat.state)) {
        cat.setState('petted', { dur: 999 });
        this.pose = cat.onPerch && cat.onPerch.y > 0.3 ? (cat.pose.spineY < 0.09 ? 'loaf' : 'sit') : (p.affection > 1.2 || p.lazy > 0.6 ? 'loaf' : 'sit');
      }
      if (cat.state === 'nap' && p.lazy < 0.5 && this.petTime > 4) { cat.setState('petted', { dur: 999 }); this.pose = 'loaf'; }
    } else if (!touching) cat.contentment = Math.max(0, cat.contentment - dt * 0.04);
    if (!this.stroking) this.petTime = Math.max(0, this.petTime - dt * 0.25);
    this.backTouch += ((touching && !this.headTouch ? 1 : 0) - this.backTouch) * (1 - Math.exp(-4 * dt));
    if (ruffled && cat._twitchT >= 1) { cat._twitchT = 0; cat._twitchEar = Math.random() < 0.5 ? 0 : 1; }

    // hello when someone comes over after a while
    if (anyNear && !this._handWasNear && cat.contentment < 0.1 && t - this._lastHello > 25 && cat.state !== 'nap') {
      this._lastHello = t;
      cat.voice('meow', 0.7, 3);
    }
    this._handWasNear = anyNear;

    if (this.purring) w.audio?.play('purr', 0.4 + cat.contentment * 0.8, { pos: cat.headWorld(_h), pitch: p.voice, key: cat.name });
    if (cat.contentment > 0.55 && this.stroking) {
      this._heartT -= dt;
      if (this._heartT <= 0) {
        this._heartT = 0.6 + Math.random() * 0.5;
        const hp = cat.headWorld(_h); hp.y += 0.1;
        w.particles?.hearts.emit(hp, { x: (Math.random() - 0.5) * 0.05, y: 0.08, z: (Math.random() - 0.5) * 0.05 }, [1, 0.62, 0.75, 0.85], 0.022, 2.2, 0.4);
      }
    }
  }

  _flinch() {
    const cat = this.cat;
    this._prev.clear();
    cat.voice('mrrp', 0.6, 1);
    cat.leave();
  }

  /** The 'petted' state: stay put, enjoy it, and get up when it's been enough. */
  tick(dt) {
    const cat = this.cat, t = cat.world.time;
    cat.path = [];
    if (this.hand) cat.look = this.hand.position.clone();
    if (t - this.lastStroke > 3.5) { cat.setState(cat.onPerch ? 'perch' : 'sit', { dur: 3 + Math.random() * 4 }); cat.perchTarget = cat.onPerch; return 'sit'; }
    if (this.petTime > cat.p.tolerance) {
      this.petTime = 0;
      cat.voice('mrrp', 0.6, 1);
      cat.leave();
      cat.leaveCooldown = 20;
      return 'stand';
    }
    return this.pose ?? 'sit';
  }

  /** Lean into the hand: head tilts toward a scratching hand, back pushes up under a stroke. */
  adjustPose(P) {
    if (this.headTouch) { P.headTilt += this.leanSide * 0.35 * Math.min(1, this.cat.contentment * 2); P.neckPitch -= 0.15; }
    P.spineY += this.backTouch * 0.008;
  }
}
