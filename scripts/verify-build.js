import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const routes = ['demo', 'team-demo'];
const poses = [
  'lumi-stand.png',
  'lumi-wave.png',
  'lumi-run.png',
  'lumi-book.png',
  'lumi-peek.png',
];
const unityPoses = ['lumi-idle.png', 'lumi-wave.png', 'lumi-listen.png', 'lumi-speak.png', 'lumi-move.png'];
const runtimeAssets = [
  'art/logo.png',
  'art/letters.png',
  'art/winter-scene.jpg',
  'models/pose_landmarker_lite.task',
  'vendor/libsamplerate.worklet.js',
  'vendor/mediapipe/vision_wasm_internal.js',
  'vendor/mediapipe/vision_wasm_internal.wasm',
  'vendor/mediapipe/vision_wasm_module_internal.js',
  'vendor/mediapipe/vision_wasm_module_internal.wasm',
];
const requiredReferences = [
  './character/unity/',
  './models/pose_landmarker_lite.task',
  './vendor/mediapipe/',
  './vendor/libsamplerate.worklet.js',
];

for (const route of routes) {
  const htmlPath = `dist/${route}/index.html`;
  const html = await readFile(htmlPath, 'utf8');

  for (const asset of [...runtimeAssets, ...poses.map((pose) => `character/${pose}`), ...unityPoses.map((pose) => `character/unity/${pose}`)]) {
    await access(`dist/${route}/${asset}`);
  }
  for (const pose of poses) {
    const original = await readFile(`assets/${pose}`);
    const published = await readFile(`dist/${route}/character/${pose}`);
    const digest = (data) => createHash('sha256').update(data).digest('hex');
    if (digest(original) !== digest(published)) {
      throw new Error(`dist/${route}/character/${pose} differs from the approved original`);
    }
  }
  for (const pose of unityPoses) {
    const original = await readFile(`apps/lumi/public/character/unity/${pose}`);
    const published = await readFile(`dist/${route}/character/unity/${pose}`);
    const digest = (data) => createHash('sha256').update(data).digest('hex');
    if (digest(original) !== digest(published)) throw new Error(`dist/${route}/character/unity/${pose} differs from the Unity render`);
  }

  for (const reference of requiredReferences) {
    if (!html.includes(reference)) {
      throw new Error(`${htmlPath} is missing required relative reference: ${reference}`);
    }
  }

  for (const pose of unityPoses) {
    if (!html.includes(pose)) {
      throw new Error(`${htmlPath} is missing pose reference: ${pose}`);
    }
  }

  if (html.includes('internalGate') || html.includes('internalLoginForm')) {
    throw new Error(`${htmlPath} still contains the Team demo login gate`);
  }

  if (!html.includes('<style>') || !html.includes('<script type="module">')) {
    throw new Error(`${htmlPath} is missing the inlined CSS or JavaScript runtime`);
  }
}

console.log('Verified demo and team-demo build outputs, poses, and relative runtime assets.');
