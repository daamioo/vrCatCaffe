// Builds the café world headlessly (no renderer) with scriptable test hands.
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { ConfigLoader } from '../src/core/ConfigLoader.js';
import { World } from '../src/core/World.js';
import { ParticleHub } from '../src/effects/ParticleSystem.js';
import { InteractionSystem } from '../src/input/InteractionSystem.js';
import { Hand } from '../src/input/Hand.js';
import { CafeFactory } from '../src/cafe/CafeFactory.js';

/** A hand the test moves around by hand. Set `.position`, `.gripPressed`, `.triggerPressed`. */
export class TestHand extends Hand {
  constructor(name = 'test') { super(name); this.pulses = 0; this._s = new THREE.Vector3(1, 1, 1); }
  update() {
    this.matrixWorld.compose(this.position, this.quaternion, this._s);
    this.touchPoint.copy(this.position);
    this.squeeze = this.triggerPressed ? 1 : 0;
  }
  pulse() { this.pulses++; }
}

export async function loadConfig() {
  const dir = new URL('../config/', import.meta.url);
  return new ConfigLoader(async (n) => JSON.parse(await readFile(new URL(`${n}.json`, dir), 'utf8'))).loadAll();
}

export async function buildWorld({ hands = 1 } = {}) {
  const config = await loadConfig();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.02, 60);
  const rig = new THREE.Group();
  rig.position.set(...config.settings.player.start);
  camera.position.y = 1.6;
  rig.add(camera); scene.add(rig);
  const renderer = { xr: { isPresenting: false } };
  const world = new World({ scene, camera, renderer, config });
  world.rig = rig;
  world.audio = null;
  world.particles = new ParticleHub(scene);
  world.input = new InteractionSystem(world);
  const testHands = Array.from({ length: hands }, (_, i) => new TestHand(`test${i}`));
  for (const h of testHands) h.position.set(0, -5, 0);       // parked out of the way
  world.input.hands = testHands;
  const factory = new CafeFactory(world);
  factory.buildAll();
  return { world, factory, hands: testHands, scene, THREE };
}

/** Runs the world for `seconds` at 72 Hz, calling `each(t)` before every step. */
export function run(world, seconds, each) {
  const dt = 1 / 72, n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { each?.(world.time); world.update(dt); }
}

/** Counts how many draw calls the scene would issue (visible meshes / points / lines / sprites). */
export function drawCalls(scene) {
  let n = 0;
  scene.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n += Array.isArray(o.material) ? o.material.length : 1; });
  return n;
}
