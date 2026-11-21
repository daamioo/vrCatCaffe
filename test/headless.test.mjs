import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, run, drawCalls } from './harness.mjs';

test('world builds and runs for a few seconds without throwing', async () => {
  const { world, scene } = await buildWorld();
  run(world, 3);
  assert.ok(world.time > 2.9);
  assert.ok(drawCalls(scene) > 0);
});
