import { CafeNav } from './CafeNav.js';
import { CafeRoom } from './CafeRoom.js';
import { CafeInterior } from './Furniture.js';
import { boardRegistry } from './Boards.js';

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
  }
}
