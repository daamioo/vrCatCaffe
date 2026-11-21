import * as THREE from 'three';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * Procedural sound effects (no asset files). The AudioContext is created lazily on the first
 * user gesture / XR session so browsers allow it. Each sound has a minimum retrigger interval
 * (per `key`, so two cats can purr at once).
 *   play(name, volume, { pos, pitch, key })
 * `pos` (world Vector3) plays the sound from that point (HRTF panner; the listener follows the
 * head via updateListener()), `pitch` scales the voice (each cat sounds a little different).
 */
export class AudioService {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null;
    this._last = new Map();
    this._dest = null;
    this._pitch = 1;
    this.enabled = true;
    this.recipes = {
      tick:       { gap: 0.15, fn: (v) => this._tone(1500, 0.03, 0.1 * v, 'square') },
      ding:       { gap: 0.2,  fn: (v) => { this._tone(1175, 0.5, 0.25 * v); this._tone(1760, 0.4, 0.12 * v); } },
      chime:      { gap: 0.3,  fn: (v) => { [1047, 1319, 1568].forEach((f, i) => this._tone(f, 0.6, 0.1 * v, 'sine', null, i * 0.09)); } },
      clink:      { gap: 0.08, fn: (v) => { this._tone(2400, 0.2, 0.2 * v); this._tone(3100, 0.15, 0.1 * v); } },
      boing:      { gap: 0.06, fn: (v) => { this._tone(260, 0.18, 0.22 * v, 'sine', 140); this._noise(0.05, 0.08 * v, 'lowpass', 900); } },
      thud:       { gap: 0.08, fn: (v) => { this._noise(0.08, 0.2 * v, 'lowpass', 400); this._tone(110, 0.08, 0.12 * v, 'sine', 70); } },
      rubberSqueak: { gap: 0.07, fn: (v) => { const f = 700 + v * 600 + Math.random() * 120; this._tone(f, 0.09, 0.07 * v, 'square', f * 1.35); } },
      crinkle:    { gap: 0.09, fn: (v) => { for (let i = 0; i < 6; i++) this._noise(0.02 + Math.random() * 0.03, (0.06 + Math.random() * 0.08) * v, 'highpass', 3500 + Math.random() * 3000, Math.random() * 0.16); } },
      swish:      { gap: 0.12, fn: (v) => this._sweep(0.16, 0.08 * v, 900, 2600) },
      kibble:     { gap: 0.07, fn: (v) => { for (let i = 0; i < 4; i++) this._tone(1800 + Math.random() * 1800, 0.018, 0.05 * v, 'triangle', null, Math.random() * 0.08); this._noise(0.08, 0.02 * v, 'highpass', 4000); } },
      kibbleBowl: { gap: 0.06, fn: (v) => { for (let i = 0; i < 3; i++) this._tone(2600 + Math.random() * 1600, 0.03, 0.05 * v, 'sine', null, Math.random() * 0.06); } },
      crunch:     { gap: 0.25, fn: (v) => { for (let i = 0; i < 3; i++) this._noise(0.035, 0.12 * v, 'bandpass', 1400 + Math.random() * 1200, i * 0.08 + Math.random() * 0.02); } },
      lid:        { gap: 0.2,  fn: (v) => { this._tone(1900, 0.12, 0.12 * v, 'triangle'); this._noise(0.05, 0.06 * v, 'bandpass', 2500); } },
      click:      { gap: 0.05, fn: (v) => this._tone(2200, 0.012, 0.08 * v, 'square') },
      purr:       { gap: 0.8,  fn: (v) => { this._purrIn = !this._purrIn; this._purr(0.9, 0.22 * v, (this._purrIn ? 23 : 27) * this._pitch); } },
      meow:       { gap: 1.0,  fn: (v) => this._meow(0.16 * v, this._pitch) },
      happyMeow:  { gap: 1.0,  fn: (v) => this._meow(0.14 * v, this._pitch * 1.18, 0.45) },
      mrrp:       { gap: 0.6,  fn: (v) => this._mrrp(0.12 * v, this._pitch) },
      pop:        { gap: 0.15, fn: (v) => { this._noise(0.05, 0.2 * v, 'highpass', 1500); this._tone(900, 0.1, 0.12 * v, 'triangle', 500); } },
    };
  }

  /** Call from a user-gesture handler (click, XR session start). */
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  play(name, volume = 1, { pos = null, pitch = 1, key = '' } = {}) {
    if (!this.ctx || !this.enabled) return;
    const r = this.recipes[name];
    if (!r) return;
    const now = this.ctx.currentTime, k = key ? `${name}:${key}` : name;
    if (now - (this._last.get(k) ?? -1) < r.gap) return;
    this._last.set(k, now);
    this._dest = this.master;
    if (pos) {
      const p = this.ctx.createPanner();
      Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 0.5, maxDistance: 25, rolloffFactor: 1 });
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      p.connect(this.master);
      this._dest = p;
    }
    this._pitch = pitch;
    r.fn(Math.max(0, Math.min(1.5, volume)));
    this._dest = this.master; this._pitch = 1;
  }

  /** Keeps the listener on the player's head (call once per frame). */
  updateListener(camera) {
    if (!this.ctx) return;
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_p); camera.getWorldQuaternion(_q);
    _f.set(0, 0, -1).applyQuaternion(_q); _u.set(0, 1, 0).applyQuaternion(_q);
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(_p.x, t, 0.02); L.positionY.setTargetAtTime(_p.y, t, 0.02); L.positionZ.setTargetAtTime(_p.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else { L.setPosition(_p.x, _p.y, _p.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
  }

  _env(duration, gain, delay = 0) {
    const g = this.ctx.createGain(), t = this.ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this._dest ?? this.master);
    return g;
  }

  _tone(freq, duration, gain, type = 'sine', endFreq = null, delay = 0) {
    const o = this.ctx.createOscillator(), t = this.ctx.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    o.connect(this._env(duration, gain, delay));
    o.start(t); o.stop(t + duration);
  }

  _noise(duration, gain, filterType, freq, delay = 0) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), t = this.ctx.currentTime + delay;
    s.buffer = this.noise; f.type = filterType; f.frequency.value = freq;
    s.connect(f); f.connect(this._env(duration, gain, delay));
    s.start(t, Math.random() * 0.5, duration);
  }

  /** Band-passed noise whose centre glides from f0 to f1: a whoosh. */
  _sweep(duration, gain, f0, f1) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), t = this.ctx.currentTime;
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this._dest ?? this.master);
    s.connect(f); f.connect(g);
    s.start(t, Math.random() * 0.5, duration);
  }

  /** Cat purr: low-passed noise chopped at ~25 Hz plus a soft buzz at the same rate. */
  _purr(duration, gain, rate) {
    const ctx = this.ctx, t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.2);
    env.gain.setValueAtTime(gain, t + duration - 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    env.connect(this._dest ?? this.master);
    const am = ctx.createGain(); am.gain.value = 0.5; am.connect(env);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.type = 'triangle'; lfo.frequency.value = rate; depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(am.gain);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 650;
    src.connect(f); f.connect(am);
    const buzz = ctx.createOscillator(), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
    buzz.type = 'sawtooth'; buzz.frequency.value = rate; bf.type = 'lowpass'; bf.frequency.value = 320; bg.gain.value = 0.5;
    buzz.connect(bf); bf.connect(bg); bg.connect(env);
    lfo.start(t); buzz.start(t); src.start(t, Math.random() * 0.05, duration);
    lfo.stop(t + duration); buzz.stop(t + duration);
  }

  /** "Mi-a-ow": a sawtooth with a rising-falling pitch through two moving vowel formants. */
  _meow(gain, pitch = 1, d = 0.7) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(430 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(760 * pitch, t + d * 0.3);
    o.frequency.exponentialRampToValueAtTime(470 * pitch, t + d);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    env.gain.setValueAtTime(gain, t + d * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    env.connect(this._dest ?? this.master);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain();
    f1.type = f2.type = 'bandpass'; f1.Q.value = 4; f2.Q.value = 5; g2.gain.value = 0.5;
    f1.frequency.setValueAtTime(650, t); f1.frequency.linearRampToValueAtTime(1300, t + d * 0.35); f1.frequency.linearRampToValueAtTime(750, t + d);
    f2.frequency.setValueAtTime(2000, t); f2.frequency.linearRampToValueAtTime(2600, t + d * 0.35); f2.frequency.linearRampToValueAtTime(1600, t + d);
    o.connect(f1); f1.connect(env); o.connect(f2); f2.connect(g2); g2.connect(env);
    o.start(t); o.stop(t + d);
  }

  /** Short rolling "mrrp?" trill: a rising chirp chopped at ~28 Hz. */
  _mrrp(gain, pitch = 1) {
    const ctx = this.ctx, t = ctx.currentTime, d = 0.28;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(380 * pitch, t); o.frequency.exponentialRampToValueAtTime(620 * pitch, t + d);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    env.gain.setValueAtTime(gain, t + d - 0.08); env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    env.connect(this._dest ?? this.master);
    const am = ctx.createGain(); am.gain.value = 0.6; am.connect(env);
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = 28; depth.gain.value = 0.4;
    lfo.connect(depth); depth.connect(am.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
    o.connect(f); f.connect(am);
    o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
  }
}
