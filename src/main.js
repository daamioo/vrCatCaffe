import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ConfigLoader } from './core/ConfigLoader.js';
import { World } from './core/World.js';
import { AudioService } from './audio/AudioService.js';
import { ParticleHub } from './effects/ParticleSystem.js';
import { InteractionSystem } from './input/InteractionSystem.js';
import { XRHand } from './input/XRHand.js';
import { DesktopHand } from './input/DesktopHand.js';
import { DesktopRig } from './input/DesktopRig.js';
import { XRLocomotion } from './input/XRLocomotion.js';
import { CafeFactory } from './cafe/CafeFactory.js';

const status = document.getElementById('status');
const say = (msg, isError = false) => { status.textContent = msg; status.classList.toggle('error', isError); status.hidden = !msg; };

async function main() {
  say('Ładowanie kawiarni…');
  const config = await ConfigLoader.fromUrl('./config/').loadAll();

  // --- renderer / scene / camera rig
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation?.(0.5);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6e7ea);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 60);
  const rig = new THREE.Group();
  const start = config.settings.player.start;
  rig.position.set(start[0], start[1], start[2]);
  rig.rotation.y = THREE.MathUtils.degToRad(config.settings.player.startYaw ?? 0);
  camera.position.y = 1.6;                         // desktop eye height; XR overrides with the real head pose
  rig.add(camera);
  scene.add(rig);

  const world = new World({ scene, camera, renderer, config });
  world.rig = rig;
  world.audio = new AudioService();
  world.particles = new ParticleHub(scene);
  world.input = new InteractionSystem(world);

  // --- input: desktop mouse hand by default, Touch controllers / hands while in VR
  const desktopHand = new DesktopHand(world, renderer.domElement);
  const desktopRig = new DesktopRig(world, rig, renderer.domElement);
  const xrHands = [0, 1].map((i) => {
    const ctrl = renderer.xr.getController(i);
    const handGroup = renderer.xr.getHand(i);
    rig.add(ctrl, handGroup);
    return new XRHand(i === 0 ? 'left' : 'right', ctrl, handGroup);
  });
  const locomotion = new XRLocomotion(world, rig, xrHands);
  world.input.hands = [desktopHand];

  renderer.xr.addEventListener('sessionstart', () => {
    world.audio.unlock();
    desktopHand.marker.visible = false;
    world.input.hands = xrHands;
    camera.position.y = 0;
    camera.rotation.x = 0;
  });
  renderer.xr.addEventListener('sessionend', () => {
    desktopHand.marker.visible = true;
    world.input.hands = [desktopHand];
    camera.position.y = 1.6;
  });
  window.addEventListener('pointerdown', () => world.audio.unlock(), { once: true });
  window.addEventListener('keydown', () => world.audio.unlock(), { once: true });

  // --- the café
  const factory = new CafeFactory(world);
  factory.buildAll();

  const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
  vrButton.addEventListener('click', () => world.audio.unlock());
  document.body.appendChild(vrButton);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- main loop
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    desktopRig.update(dt);
    if (renderer.xr.isPresenting) { locomotion.update(dt); world.particles.setScale(900); }
    else world.particles.setScale((renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    rig.updateMatrixWorld(true);                   // hands read their pose through the rig this frame
    world.update(dt);
    world.audio.updateListener(renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
    renderer.render(scene, camera);
  });

  say('');
  window.catcafe = { world, factory, THREE, renderer };   // handy for console debugging (renderer.info.render.calls)
}

main().catch((e) => { console.error(e); say(`Nie udało się uruchomić: ${e.message}`, true); });
