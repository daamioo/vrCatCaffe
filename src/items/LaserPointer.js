import * as THREE from 'three';
import { Item } from './Item.js';

const _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A pen-sized laser pointer. Grab it (it sits in your hand pointing forward) and hold the trigger
 * (Space on desktop) to switch it on: a small red dot appears wherever it points — floor,
 * furniture, walls. Cats go wild for the dot on the floor and low furniture: they chase it,
 * stalk and pounce. The dot has a constant colour and brightness: it never blinks or flickers.
 * def: { color }
 */
export class LaserPointer extends Item {
  build() {
    this.height = 0.13;
    this.grabRadius = 0.02;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.11, 4, 12).translate(0, 0.065, 0), new THREE.MeshLambertMaterial({ color: this.def.color ?? '#bfaee8' }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.02, 12).translate(0, 0.12, 0), new THREE.MeshLambertMaterial({ color: '#fff6e6' }));
    this.button = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshLambertMaterial({ color: '#e5536f' }));
    this.button.position.set(0, 0.085, 0.011);
    const paw = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    paw.position.set(0, 0.05, 0.0115);
    this.object3D.add(body, cap, this.button, paw);

    // the dot (world space): a small solid core with a faint, steady halo
    this.dot = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 16), new THREE.MeshBasicMaterial({ color: 0xff3355, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), new THREE.MeshBasicMaterial({ color: 0xff6680, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    halo.renderOrder = 3; core.renderOrder = 4;
    this.dot.add(halo, core);
    this.dot.visible = false;
    this.dot.traverse((o) => { o.raycast = () => {}; });
    this.on = false;
    this.hit = null;
    this._dotPos = new THREE.Vector3();
    this._speed = 0;
  }

  onAdded() { super.onAdded(); this.body.restHeight = 0.012; this.world.scene.add(this.dot); this.world.toys.add(this); }
  onRemoved() { super.onRemoved(); this.world.toys.delete(this); this.world.scene.remove(this.dot); this.dot.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }

  restQuaternion(yaw) { return this._rest.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiply(this._lay); }

  /** Held like a pen, pointing where the controller points (−Z), whichever way it was picked up. */
  onGrab(hand) {
    if (hand.name === 'mouse') return;
    hand.grabOffset.makeRotationX(-Math.PI / 2).setPosition(0, -0.01, 0.04);
  }
  onRelease() { this._setOn(false); }

  lure() {
    if (!this.on || !this.hit) return null;
    return { point: this._dotPos, speed: this._speed, kind: 'laser' };
  }

  _setOn(on) {
    if (on === this.on) return;
    this.on = on;
    this.world.audio?.play('click', 0.6, { pos: this.object3D.position });
    this.button.position.z = on ? 0.009 : 0.011;
    if (!on) { this.dot.visible = false; this.hit = null; this._speed = 0; }
  }

  update(dt) {
    const hand = this.body.held;
    if (hand?.name === 'mouse') {
      // desktop: aim along the mouse ray
      const cam = this.world.camera.getWorldPosition(_c);
      _dir.copy(hand.position).sub(cam).normalize();
      this.object3D.quaternion.setFromUnitVectors(UP, _dir);
      this.object3D.updateMatrixWorld(true);
    }
    this._setOn(!!hand && hand.triggerPressed);
    if (!this.on) return;
    this.object3D.updateMatrixWorld(true);
    const o = this.worldPointAt(this.height + 0.002, _o);
    _dir.copy(UP).applyQuaternion(this.object3D.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const hit = this.world.nav.raycast(o, _dir, this.world.settings.room, 15);
    this.hit = hit;
    if (!hit) { this.dot.visible = false; return; }
    const target = hit.point.addScaledVector(hit.normal, 0.002);
    const first = !this.dot.visible;
    const before = _c.copy(this._dotPos);
    if (first) this._dotPos.copy(target); else this._dotPos.lerp(target, 1 - Math.exp(-30 * dt));    // steadies hand tremor a touch
    const v = first ? 0 : before.distanceTo(this._dotPos) / Math.max(dt, 1e-4);
    this._speed += (v - this._speed) * (1 - Math.exp(-8 * dt));
    this.dot.position.copy(this._dotPos);
    this.dot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    this.dot.visible = true;
  }
}
