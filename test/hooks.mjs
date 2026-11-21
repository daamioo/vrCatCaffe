// Module resolve hook: maps the browser import-map names to the vendored Three.js for Node tests.
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const root = resolvePath(new URL('..', import.meta.url).pathname);
const three = pathToFileURL(resolvePath(root, 'vendor/three/three.module.js')).href;
const addons = pathToFileURL(resolvePath(root, 'vendor/three/addons')).href + '/';

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: three, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: addons + specifier.slice('three/addons/'.length), shortCircuit: true };
  return next(specifier, context);
}
