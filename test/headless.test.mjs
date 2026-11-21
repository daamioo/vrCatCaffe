import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, run, drawCalls } from './harness.mjs';

test('world builds and runs for a few seconds without throwing', async () => {
  const { world, scene } = await buildWorld();
  run(world, 3);
  assert.ok(world.time > 2.9);
  assert.ok(drawCalls(scene) > 0);
});

test('café room: furniture, surfaces, perches and a modest draw-call count', async () => {
  const { world, scene } = await buildWorld();
  const nav = world.nav;
  assert.ok(nav.perches.length >= 14, `perches: ${nav.perches.length}`);
  assert.ok(nav.perches.some((p) => p.kind === 'shelf' && p.via), 'shelves reached through the cat tree');
  for (const p of nav.perches) {
    const chain = nav.chain(p);
    assert.ok(chain[0].approach, `perch ${p.id ?? p.kind} has a floor approach`);
    assert.ok(nav.isFree(chain[0].approach.x, chain[0].approach.z, 0.05, false), `approach of ${p.id ?? p.kind} at ${JSON.stringify(chain[0].approach)} is walkable`);
  }
  assert.ok(world.physics.surfaces.size > 10);
  // counter top is solid
  assert.ok(world.physics.surfaceAt(-1.2, -2.6).top > 0.95);
  // laser ray: straight down onto a table hits its top, onto the floor hits y=0
  const THREE = await import('three');
  const hitTable = nav.raycast(new THREE.Vector3(-1.5, 1.5, 0.6), new THREE.Vector3(0, -1, 0), world.settings.room);
  assert.ok(Math.abs(hitTable.point.y - 0.36) < 0.02, `table hit y=${hitTable.point.y}`);
  const hitFloor = nav.raycast(new THREE.Vector3(0, 1.5, 1.5), new THREE.Vector3(0, -1, 0), world.settings.room);
  assert.ok(Math.abs(hitFloor.point.y) < 1e-6);
  const calls = drawCalls(scene);
  assert.ok(calls < 120, `draw calls: ${calls}`);
  console.log(`  room draw calls: ${calls}`);
});

test('cats: six distinct cats wander, hop onto perches and switch between behaviours', async () => {
  const { world, factory, scene } = await buildWorld();
  const cats = factory.colony.cats;
  assert.equal(cats.length, 6);
  assert.equal(new Set(cats.map((c) => c.name)).size, 6);
  const seen = new Map(cats.map((c) => [c, new Set([c.state])]));
  const perched = new Set(), maxY = new Map();
  const start = new Map(cats.map((c) => [c, c.pos.clone()]));
  let travelled = new Map(cats.map((c) => [c, 0])), prev = new Map(cats.map((c) => [c, c.pos.clone()]));
  run(world, 240, () => {
    for (const c of cats) {
      seen.get(c).add(c.state);
      if (c.onPerch) perched.add(`${c.name}:${c.onPerch.kind}`);
      maxY.set(c, Math.max(maxY.get(c) ?? 0, c.pos.y));
      travelled.set(c, travelled.get(c) + c.pos.distanceTo(prev.get(c)));
      prev.get(c).copy(c.pos);
      assert.ok(Number.isFinite(c.pos.x) && Number.isFinite(c.pos.y) && Number.isFinite(c.pos.z), `${c.name} position finite`);
      const r = world.settings.room;
      assert.ok(Math.abs(c.pos.x) < r.width / 2 - 0.1 && Math.abs(c.pos.z) < r.depth / 2 - 0.1, `${c.name} inside the room`);
    }
  });
  const allStates = new Set([...seen.values()].flatMap((s) => [...s]));
  console.log('  states seen:', [...allStates].join(', '));
  console.log('  perched:', [...perched].join(', '));
  console.log('  travelled:', cats.map((c) => `${c.name} ${travelled.get(c).toFixed(1)}m`).join(', '));
  for (const st of ['wander', 'sit', 'nap']) assert.ok(allStates.has(st), `some cat ${st}s`);
  assert.ok(allStates.has('groom') || allStates.has('loaf'), 'grooming or loafing happens');
  assert.ok(perched.size >= 3, 'cats hop onto several perches');
  assert.ok([...maxY.values()].some((y) => y > 0.7), 'a cat climbs high (cat tree / shelf)');
  assert.ok(cats.filter((c) => travelled.get(c) > 1).length >= 4, 'most cats move around');
  for (const c of cats) assert.ok(seen.get(c).size >= 2, `${c.name} changes state (${[...seen.get(c)]})`);
  const calls = drawCalls(scene);
  console.log(`  draw calls with cats: ${calls}`);
  assert.ok(calls < 120);
  void start;
});

/** Moves `hand` back and forth along a cat's back (head -> tail strokes), in the cat's own frame. */
async function strokeBack(world, cat, hand, seconds, { speed = 1 } = {}) {
  const THREE = await import('three');
  const { BODY_C, BODY_R } = await import('../src/cats/CatModel.js');
  run(world, seconds, (t) => {
    const k = (Math.sin(t * Math.PI * speed) + 1) / 2;                       // 0..1..0
    const lp = new THREE.Vector3(0, BODY_C.y + BODY_R.y + 0.005, THREE.MathUtils.lerp(0.17, -0.04, k));
    cat.object3D.updateMatrixWorld(true);
    hand.position.copy(cat.model.b.spine.localToWorld(lp));
  });
}

test('petting: open-hand strokes make a cat stop, purr, rumble and get content; it leaves after its tolerance', async () => {
  const { world, factory, hands: [hand] } = await buildWorld();
  const latka = factory.colony.byName('Łatka');
  latka.releasePerch(); latka.pos.set(-0.3, 0, 1.2); latka.setState('wander', { dur: 10 }); latka.goTo({ x: 0.5, z: 1.4 });
  run(world, 0.5);
  await strokeBack(world, latka, hand, 6);
  assert.equal(latka.state, 'petted', `state ${latka.state}`);
  assert.ok(latka.contentment > 0.5, `contentment ${latka.contentment.toFixed(2)}`);
  assert.ok(latka.petting.purring, 'purring');
  assert.ok(hand.pulses > 20, `controller rumble pulses: ${hand.pulses}`);
  assert.ok(latka.model.b.eyes.scale.y < 0.6, 'squints when content');
  // grabbing (grip) does not pet
  const before = latka.contentment;
  hand.heldControl = { endGrab() {} };          // e.g. holding a toy / control
  await strokeBack(world, latka, hand, 1);
  assert.ok(latka.contentment <= before + 1e-6, 'no petting with a full hand');
  hand.heldControl = null;
  // stop petting -> goes back to its own business
  hand.position.set(0, -5, 0);
  run(world, 6);
  assert.notEqual(latka.state, 'petted');

  // Frak has little patience: pet him past his tolerance and he walks off
  const frak = factory.colony.byName('Frak');
  frak.releasePerch(); frak.pos.set(1.0, 0, 1.9); frak.energy = 0.05; frak.setState('sit', { dur: 100 });
  await strokeBack(world, frak, hand, frak.p.tolerance + 3);
  assert.ok(['leave', 'idle', 'wander', 'sit'].includes(frak.state) && frak.leaveCooldown > 0, `Frak walked off (state ${frak.state}, cooldown ${frak.leaveCooldown.toFixed(1)})`);
});

test('petting: a shy cat flinches from a fast hand but accepts gentle strokes', async () => {
  const { world, factory, hands: [hand] } = await buildWorld();
  const mg = factory.colony.byName('Mgiełka');
  mg.releasePerch(); mg.pos.set(-0.5, 0, -0.8); mg.setState('sit', { dur: 100 }); mg.trust = 0.1;
  world.rig.position.set(-0.5, 0, -2.0);         // player out of her comfort zone check range
  run(world, 0.3);
  await strokeBack(world, mg, hand, 1.5, { speed: 6 });   // fast swipes
  assert.equal(mg.state, 'leave', `shy cat leaves (state ${mg.state})`);
  mg.trust = 0.6; mg.leaveCooldown = 0; mg.setState('sit', { dur: 100 }); mg.path = [];
  await strokeBack(world, mg, hand, 4, { speed: 0.6 });
  assert.equal(mg.state, 'petted');
  assert.ok(mg.contentment > 0.3);
});

function grab(world, hand, item) {
  item.object3D.updateMatrixWorld(true);
  hand.position.copy(item.worldPointAt ? item.worldPointAt(item.height / 2) : item.object3D.position);
  hand.gripPressed = true;
  run(world, 1 / 72);
  return hand.held === item;
}

/** Keeps the other cats busy elsewhere so a test can watch one cat. */
function sideline(factory, keep) {
  for (const c of factory.colony.cats) if (c !== keep) { c.p.play = 0; c.p.greed = 0; c.hunger = 0; }
}

test('toys: the feather wand can be grabbed and waved; a playful cat chases and swats the feather', async () => {
  const THREE = await import('three');
  const { world, factory, hands: [hand] } = await buildWorld();
  const wand = [...world.toys].find((t) => t.constructor.name === 'FeatherWand');
  const tyg = factory.colony.byName('Tygrysek');
  sideline(factory, tyg);
  tyg.releasePerch(); tyg.pos.set(0.2, 0, 0.2); tyg.energy = 1; tyg.setState('sit', { dur: 100 });
  run(world, 1);
  assert.ok(grab(world, hand, wand), 'wand grabbed');
  hand.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.2);     // stick pointing forward-down
  let minD = Infinity, chased = false;
  run(world, 20, (t) => {
    // wave the feather around low over the floor in front of the player
    hand.position.set(0.3 + Math.sin(t * 2.2) * 0.35, 0.55, 0.9 + Math.cos(t * 1.7) * 0.2);
    if (tyg.state === 'chase' && tyg.target === wand) chased = true;
    minD = Math.min(minD, tyg.distanceTo(wand.lure().point));
  });
  console.log(`  Tygrysek: closest ${minD.toFixed(2)} m, swats ${wand.swats ?? 0}, feather y ${wand.lure().point.y.toFixed(2)}`);
  assert.ok(chased, 'cat chases the feather');
  assert.ok(minD < 0.45, 'cat gets close to the feather');
  assert.ok((wand.swats ?? 0) >= 1, 'cat swats / pounces on the feather');
  assert.ok(hand.pulses > 0);
  // put it down: it lies flat on the floor and the feather rests on the floor
  hand.gripPressed = false;
  run(world, 3);
  assert.ok(wand.body.support, 'wand landed');
  assert.ok(Math.abs(wand.axisUp.y) < 0.2, 'lies flat');
  assert.ok(wand.lure().point.y < 0.05, 'feather rests on the floor');
});

test('toys: laser pointer — trigger switches the dot on, a cat chases the moving dot', async () => {
  const THREE = await import('three');
  const { world, factory, hands: [hand] } = await buildWorld();
  const laser = [...world.toys].find((t) => t.constructor.name === 'LaserPointer');
  const frak = factory.colony.byName('Frak');
  sideline(factory, frak);
  frak.releasePerch(); frak.pos.set(-1.0, 0, -1.2); frak.energy = 1; frak.setState('sit', { dur: 100 });
  assert.ok(grab(world, hand, laser), 'laser grabbed');
  assert.equal(laser.lure(), null, 'off until the trigger is pressed');
  hand.position.set(0, 1.2, 1.4);
  const aim = new THREE.Vector3();
  let chased = false, minD = Infinity, dotColorSame = true;
  const col0 = laser.dot.children[1].material.color.getHex(), op0 = laser.dot.children[0].material.opacity;
  run(world, 15, (t) => {
    hand.triggerPressed = true;
    aim.set(Math.sin(t * 0.8) * 1.2, 0, -0.6 + Math.cos(t * 0.6) * 0.6);   // sweep the dot over the floor
    const dir = aim.clone().sub(hand.position).normalize();
    hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);   // controller -Z points at it
    if (frak.state === 'chase' && frak.target === laser) chased = true;
    const l = laser.lure();
    if (l) minD = Math.min(minD, frak.distanceTo(l.point));
    if (laser.dot.children[1].material.color.getHex() !== col0 || laser.dot.children[0].material.opacity !== op0) dotColorSame = false;
  });
  const l = laser.lure();
  assert.ok(l && Math.abs(l.point.y) < 0.01, 'dot on the floor');
  assert.ok(laser.dot.visible);
  assert.ok(dotColorSame, 'dot colour and halo opacity never change (no flashing)');
  assert.ok(chased, 'Frak chases the dot');
  console.log(`  Frak closest to dot: ${minD.toFixed(2)} m`);
  assert.ok(minD < 0.4);
  hand.triggerPressed = false;
  run(world, 0.1);
  assert.equal(laser.lure(), null, 'released trigger: dot off');
  assert.equal(laser.dot.visible, false);
});

test('toys: balls can be grabbed and thrown, roll to a stop, and cats bat a rolling yarn ball', async () => {
  const { world, factory, hands: [hand] } = await buildWorld();
  const yarn = [...world.toys].find((t) => t.constructor.name === 'YarnBall');
  const crinkle = [...world.toys].find((t) => t.constructor.name === 'CrinkleBall');
  assert.ok(grab(world, hand, crinkle), 'crinkle ball grabbed');
  // throw: swing the hand forward and let go
  run(world, 0.25, (t) => hand.position.set(1.6, 1.0, 1.0 - (t % 1) * 0));
  const p0 = hand.position.clone();
  for (let i = 0; i < 10; i++) { hand.position.z -= 0.04; hand.position.y += 0.01; run(world, 1 / 72); }
  hand.gripPressed = false;
  run(world, 1 / 72);
  assert.ok(crinkle.body.velocity.length() > 1.5, `thrown at ${crinkle.body.velocity.length().toFixed(2)} m/s`);
  run(world, 6);
  assert.ok(crinkle.object3D.position.distanceTo(p0) > 0.8, 'it flew');
  assert.ok(crinkle.body.support, 'it came to rest on something');

  const tyg = factory.colony.byName('Tygrysek');
  sideline(factory, tyg);
  tyg.releasePerch(); tyg.pos.set(0, 0, -1.0); tyg.energy = 1; tyg.setState('sit', { dur: 100 });
  let swats = 0;
  const orig = yarn.onSwat.bind(yarn);
  yarn.onSwat = (...a) => { swats++; orig(...a); };
  run(world, 25, (t) => {
    // keep the yarn rolling around in front of the cat (a player tossing it back now and then)
    if (yarn.body.velocity.length() < 0.2 && Math.floor(t) % 4 === 0) {
      yarn.body.support = null; yarn.object3D.position.set(-0.6 + Math.random() * 1.2, 0.3, -0.2);
      yarn.body.velocity.set((Math.random() - 0.5) * 1.5, 0.5, -0.6 - Math.random() * 0.6);
    }
  });
  console.log(`  yarn swats by Tygrysek: ${swats}`);
  assert.ok(swats >= 1, 'cat bats the yarn ball');
});

test('food: tilting the kibble bag over a bowl fills it; a hungry cat comes and eats it empty', async () => {
  const THREE = await import('three');
  const { world, factory, hands: [hand] } = await buildWorld();
  const bag = [...world.grabbables].find((g) => g.constructor.name === 'KibbleBag');
  const bowl = [...world.foods].find((f) => f.constructor.name === 'FoodBowl');
  const kluska = factory.colony.byName('Kluska');
  for (const c of factory.colony.cats) if (c !== kluska) { c.p.greed = 0; c.hunger = 0; c.p.play = 0; }
  kluska.hunger = 0.1;                                   // not hungry yet: watch the pouring first
  assert.ok(grab(world, hand, bag), 'bag grabbed');
  // upright bag pours nothing
  hand.position.set(bowl.object3D.position.x, 0.5, bowl.object3D.position.z);
  run(world, 1);
  assert.equal(bowl.amount, 0, 'no pouring while upright');
  // tilt the hand (and bag) ~120° and keep the spout over the bowl
  hand.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -2.1);
  run(world, 4, () => {
    bag.object3D.updateMatrixWorld(true);
    const s = bag.spoutWorld(), target = bowl.object3D.position.clone().add(new THREE.Vector3(0, 0.2, 0));
    hand.position.add(target.sub(s));
  });
  console.log(`  bowl filled to ${(bowl.amount * 100).toFixed(0)}%`);
  assert.ok(bowl.amount > 0.6, 'bowl fills up');
  assert.ok(bowl.mound.visible && bowl.mound.scale.y > 0.02, 'kibble mound visible');
  hand.gripPressed = false; hand.position.set(0, -5, 0);
  run(world, 0.5);
  const full = bowl.amount;
  kluska.hunger = 0.95;
  let ate = false, minD = Infinity;
  run(world, 60, () => { if (kluska.state === 'eat' && kluska.sub === 'eating') ate = true; minD = Math.min(minD, kluska.distanceTo(bowl.object3D.position)); });
  console.log(`  Kluska: closest ${minD.toFixed(2)} m, bowl now ${(bowl.amount * 100).toFixed(0)}%, hunger ${kluska.hunger.toFixed(2)}`);
  assert.ok(ate, 'Kluska eats from the bowl');
  assert.ok(bowl.amount < full - 0.3, 'the bowl empties over time');
  assert.ok(kluska.hunger < 0.6, 'and she is less hungry');
});

test('food: take a treat from the jar, hold it out — a cat comes and eats it from the hand', async () => {
  const { world, factory, hands: [hand] } = await buildWorld();
  const jar = factory.decor.find((d) => d.constructor.name === 'TreatJar');
  const kluska = factory.colony.byName('Kluska');
  for (const c of factory.colony.cats) if (c !== kluska) { c.p.greed = 0; c.hunger = 0; c.p.play = 0; }
  kluska.releasePerch(); kluska.pos.set(-1.0, 0, -0.5); kluska.hunger = 0.6; kluska.setState('sit', { dur: 100 });
  // reach into the jar
  hand.position.copy(jar.object3D.position).add({ x: 0, y: 0.1, z: 0 });
  hand.gripPressed = true;
  run(world, 1 / 72);
  const treat = hand.held;
  assert.ok(treat && treat.constructor.name === 'Treat', 'came out holding a treat');
  // hold it out low in front of the player
  const before = kluska.contentment;
  let ate = false, contentAfter = 0;
  run(world, 30, () => { if (!ate) hand.position.set(0.0, 0.22, 0.9); if (!ate && !world.entities.has(treat)) { ate = true; contentAfter = kluska.contentment; } });
  console.log(`  treat eaten: ${ate}, Kluska state ${kluska.state}`);
  assert.ok(ate, 'the treat was eaten from the hand');
  assert.equal(treat.eatenBy, kluska);
  assert.equal(hand.held, null, 'hand is empty again');
  assert.ok(contentAfter > before + 0.2, 'happier');
  // the jar keeps handing out treats, but no more than 4 at a time
  hand.gripPressed = false; run(world, 1 / 72);
  for (let i = 0; i < 6; i++) {
    hand.position.copy(jar.object3D.position).add({ x: 0, y: 0.1, z: 0 }); hand.gripPressed = true; run(world, 1 / 72);
    hand.position.set(-2 + i * 0.3, 1.2, 1.5); hand.gripPressed = false; run(world, 1 / 72);
  }
  assert.ok(world.entitiesWithTag('item').filter((e) => e.constructor.name === 'Treat').length <= 4);
});

test('radio knobs turn; holding the reset button puts the café back (radio keeps its settings)', async () => {
  const THREE = await import('three');
  const { world, factory, hands: [hand] } = await buildWorld();
  const radio = factory.decor.find((d) => d.constructor.name === 'Radio');
  const button = factory.decor.find((d) => d.constructor.name === 'ResetButton');
  // volume knob: grip it and circle the hand clockwise (seen from above)
  const knob = radio.volKnob, c = knob.center.clone();
  hand.position.copy(c).add(new THREE.Vector3(0, 0.012, 0.01)); hand.gripPressed = true;
  run(world, 1 / 72);
  assert.equal(hand.heldControl, knob, 'knob gripped');
  const vol0 = radio.volume;
  run(world, 1, (t) => { const a = t * 2.5; hand.position.set(c.x + Math.sin(a) * 0.05, c.y + 0.01, c.z + Math.cos(a) * 0.05); });
  hand.gripPressed = false; run(world, 1 / 72);
  assert.notEqual(radio.volume, vol0, `volume changed ${vol0} -> ${radio.volume}`);

  // mess things up: move a toy, fill a bowl, take a treat, move a cat
  const yarn = [...world.toys].find((t) => t.constructor.name === 'YarnBall');
  yarn.object3D.position.set(2, 0.05, 2); yarn.body.support = null;
  const bowl = [...world.foods].find((f) => f.constructor.name === 'FoodBowl'); bowl.addKibble(1);
  const puszek = factory.colony.byName('Puszek'); puszek.releasePerch(); puszek.pos.set(0, 0, 0); puszek.setState('sit', { dur: 100 });
  run(world, 1);
  // press and hold the button with a fingertip
  button.object3D.updateMatrixWorld(true);
  hand.touching = true;
  hand.position.copy(button.object3D.localToWorld(new THREE.Vector3(0, 0, 0.04)));
  run(world, 0.6);
  assert.ok(button.progress > 0.3 && button.progress < 1, 'ring filling while held');
  hand.position.set(0, -5, 0); run(world, 0.5);
  assert.equal(button.progress, 0, 'letting go early cancels');
  hand.position.copy(button.object3D.localToWorld(new THREE.Vector3(0, 0, 0.04)));
  run(world, 1.5);
  hand.position.set(0, -5, 0); run(world, 0.2);
  const yarn2 = [...world.toys].filter((t) => t.constructor.name === 'YarnBall').sort((a, b) => a.object3D.position.distanceTo(new THREE.Vector3(0.9, 0.045, 1.55)) - b.object3D.position.distanceTo(new THREE.Vector3(0.9, 0.045, 1.55)))[0];
  assert.ok(!world.entities.has(yarn), 'old toy replaced');
  assert.ok(yarn2.object3D.position.distanceTo(new THREE.Vector3(0.9, 0.045, 1.55)) < 0.05, 'yarn back in its spot');
  assert.ok([...world.foods].filter((f) => f.constructor.name === 'FoodBowl').every((b) => b.amount === 0), 'bowls empty');
  assert.equal(puszek.onPerch?.id, 'treeA-2', 'Puszek back on top of the cat tree');
  assert.equal(puszek.state, 'nap');
  assert.ok(world.entities.has(radio), 'radio kept');
  assert.equal(radio.volume, knob.step, 'radio keeps its volume');
});
