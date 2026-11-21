import { CafeNav } from './CafeNav.js';
import { CafeRoom } from './CafeRoom.js';
import { CafeInterior } from './Furniture.js';
import { boardRegistry } from './Boards.js';
import * as THREE from 'three';
import { Registry } from '../core/Registry.js';
import { CatColony } from '../cats/CatColony.js';
import { YarnBall, CrinkleBall } from '../items/Ball.js';
import { FeatherWand } from '../items/FeatherWand.js';
import { LaserPointer } from '../items/LaserPointer.js';
import { FoodBowl, KibbleBag, Treat, TreatJar } from '../items/Food.js';
import { Radio } from './Radio.js';
import { ResetButton } from './ResetButton.js';

/** Maps the `"class"` strings of cafe.json items to implementations. Add new item types here. */
export const itemRegistry = new Registry('item class')
  .register('YarnBall', YarnBall).register('CrinkleBall', CrinkleBall).register('FeatherWand', FeatherWand).register('LaserPointer', LaserPointer)
  .register('FoodBowl', FoodBowl).register('KibbleBag', KibbleBag).register('Treat', Treat);

/** Fixed fittings from cafe.json `decor` (they take (world, def)). */
export const decorRegistry = new Registry('decor class').register('TreatJar', TreatJar).register('Radio', Radio).register('ResetButton', ResetButton);

/** Builds the café from config/cafe.json + config/cats.json. */
export class CafeFactory {
  constructor(world) {
    this.world = world;
    this.cafe = world.config.cafe;
    world.factory = this;
  }

  buildAll() {
    const w = this.world;
    w.nav = new CafeNav(w.settings.room);
    w.add(new CafeRoom(w, this.cafe.room));
    w.add(new CafeInterior(w, this.cafe.furniture ?? []));
    for (const b of this.cafe.boards ?? []) w.add(boardRegistry.get(b.type)(w, b));
    this.colony = w.add(new CatColony(w));
    this.decor = (this.cafe.decor ?? []).map((d) => w.add(decorRegistry.create(d.class, w, d)));
    for (const item of this.cafe.items ?? []) this.spawn(item);
  }

  /**
   * Puts the café back the way it started: every toy, bowl and the kibble bag back at its spot
   * (bowls empty), treats tidied away, every cat back on its start spot, rested and a bit peckish.
   * Kept: the room, furniture, boards, the treat jar, the radio (keeps playing) and the button.
   */
  resetRoom() {
    const w = this.world;
    for (const h of w.input?.hands ?? []) {
      if (h.heldControl) { h.heldControl.endGrab?.(); h.heldControl = null; }
      if (h.held) w.input.release(h, false);
      h.airGrab = false;
    }
    w._timers = [];
    for (const e of [...w.entities]) if (e.tags.has('item')) w.remove(e);
    this.colony.reset();
    for (const item of this.cafe.items ?? []) this.spawn(item);
    w.bus.emit('cafe:reset', {});
  }

  /** Creates one item from its cafe.json entry, resting in its starting orientation. */
  spawn(item) {
    const entity = itemRegistry.create(item.class, this.world, item, item.id ?? item.class);
    entity.object3D.position.set(...item.position);
    const yaw = THREE.MathUtils.degToRad(item.rotationY ?? 0);
    entity.object3D.quaternion.copy(entity.restQuaternion(yaw));
    entity.spawnItem = item;
    this.world.add(entity);
    return entity;
  }
}
