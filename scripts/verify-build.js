import { access, readFile } from 'node:fs/promises';

const routes = ['demo', 'team-demo'];
const poses = [
  'lumi-stand.png',
  'lumi-wave.png',
  'lumi-run.png',
  'lumi-book.png',
  'lumi-peek.png',
];
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
  './character/',
  './models/pose_landmarker_lite.task',
  './vendor/mediapipe/',
  './vendor/libsamplerate.worklet.js',
];

for (const route of routes) {
  const htmlPath = `dist/${route}/index.html`;
  const html = await readFile(htmlPath, 'utf8');

  for (const asset of [...runtimeAssets, ...poses.map((pose) => `character/${pose}`)]) {
    await access(`dist/${route}/${asset}`);
  }

  for (const reference of requiredReferences) {
    if (!html.includes(reference)) {
      throw new Error(`${htmlPath} is missing required relative reference: ${reference}`);
    }
  }

  for (const pose of poses) {
    if (!html.includes(pose)) {
      throw new Error(`${htmlPath} is missing pose reference: ${pose}`);
    }
  }

  if (!html.includes('<style>') || !html.includes('<script type="module">')) {
    throw new Error(`${htmlPath} is missing the inlined CSS or JavaScript runtime`);
  }
}

console.log('Verified demo and team-demo build outputs, poses, and relative runtime assets.');
