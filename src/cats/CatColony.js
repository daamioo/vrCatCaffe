import { Entity } from '../core/Entity.js';
import { Cat } from './Cat.js';

/**
 * Owns the café's cats (from config/cats.json). Each frame it tells the navigation where the
 * player stands (cats step around your feet). reset() puts every cat back on its start spot.
 */
export class CatColony extends Entity {
  constructor(world) {
    super(world);
    this.persistent = true;
    this.cats = (world.config.cats.cats ?? []).map((def, i) => new Cat(world, def, i));
    this._extra = [];
  }

  onAdded() { for (const c of this.cats) this.world.add(c); }
  onRemoved() { for (const c of this.cats) this.world.remove(c); }

  update() {
    const cam = this.world.camera.getWorldPosition(this._p ??= this.world.camera.position.clone());
    this.world.nav.player = { x: cam.x, z: cam.z, r: 0.17 };
  }

  reset() {
    for (const c of this.cats) c.releasePerch();
    for (const c of this.cats) c.reset();
  }

  byName(name) { return this.cats.find((c) => c.name === name); }
}
