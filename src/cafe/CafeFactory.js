import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { Surface } from '../physics/Surface.js';

/** Placeholder room: a floor surface and soft light (replaced by the café room). */
class Floor extends Entity {
  constructor(world) {
    super(world);
    const { width: w, depth: d } = world.settings.room;
    this.object3D.add(new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe8cfa8 })));
    this.object3D.add(new THREE.HemisphereLight(0xfff4e6, 0xc9a7b0, 2));
  }
  onAdded() { this.surface = this.world.physics.addSurface(new Surface({ owner: this, x: 0, z: 0, top: 0, halfX: 50, halfZ: 50 })); }
  onRemoved() { this.world.physics.removeSurface(this.surface); }
}

/** Builds the café from config/cafe.json + config/cats.json. */
export class CafeFactory {
  constructor(world) {
    this.world = world;
    this.cafe = world.config.cafe;
    world.factory = this;
  }

  buildAll() {
    this.world.add(new Floor(this.world));
  }
}
