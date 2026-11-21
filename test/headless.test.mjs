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
  assert.ok(calls < 45, `room draw calls: ${calls}`);
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
  assert.ok(calls < 60);
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
