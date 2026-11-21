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
