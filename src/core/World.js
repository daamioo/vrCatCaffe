import { EventBus } from './EventBus.js';
import { PhysicsSystem } from '../physics/PhysicsSystem.js';

/**
 * The service locator + entity manager. Everything gets a reference to the World and reaches
 * shared services (config, physics, audio, particles, input) through it.
 */
export class World {
  constructor({ scene, camera, renderer, config }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.config = config;
    this.settings = config.settings;
    this.bus = new EventBus();
    this.physics = new PhysicsSystem(this);

    this.entities = new Set();
    this.grabbables = new Set();   // Items hands can pick up
    this.controls = new Set();     // grabbable controls: Dial, TreatJar (distanceToPoint/beginGrab/endGrab/update)
    this.cats = new Set();         // Cat entities
    this.toys = new Set();         // things cats chase: lure() -> {point, speed, kind} | null, onSwat(cat, dir)
    this.foods = new Set();        // things cats eat: food() -> {point, amount, kind} | null, eat(cat, dt)
    this.laserTargets = [];        // static meshes the laser dot can land on
    this.nav = null;               // CafeNav: floor obstacles, perches
    this.factory = null;           // CafeFactory, for spawning / resetting

    // Services attached by the App (audio, particles, input, ...)
    this.audio = null; this.particles = null; this.input = null; this.rig = null;
    this.time = 0;
    this._timers = [];
  }

  /** Runs `fn` once after `seconds` of world time. */
  after(seconds, fn) { this._timers.push({ at: this.time + seconds, fn }); }

  add(entity) {
    this.entities.add(entity);
    this.scene.add(entity.object3D);
    entity.onAdded();
    return entity;
  }

  remove(entity) {
    if (!this.entities.delete(entity)) return;
    entity.onRemoved();
    this.scene.remove(entity.object3D);
    entity.disposeMeshes();
  }

  entitiesWithTag(tag) { return [...this.entities].filter((e) => e.tags.has(tag)); }

  update(dt) {
    this.time += dt;
    if (this._timers.length) {
      const due = this._timers.filter((t) => t.at <= this.time);
      this._timers = this._timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    this.input?.update(dt);
    this.physics.update(dt);
    for (const e of [...this.entities]) if (this.entities.has(e)) e.update(dt);
    this.particles?.update(dt);
  }
}
