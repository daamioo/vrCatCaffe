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
  assert.ok(calls < 40, `room draw calls: ${calls}`);
  console.log(`  room draw calls: ${calls}`);
});
