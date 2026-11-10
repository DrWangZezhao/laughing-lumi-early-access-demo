// Post-build: inline JS + CSS into ../../demo/index.html so the page also renders when
// opened straight from disk (file://), where browsers refuse external module scripts.
import fs from 'fs';
const p = '../../demo/index.html';
let html = fs.readFileSync(p, 'utf8');
const js = fs.readFileSync('../../demo/assets/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('../../demo/assets/index.css', 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/app\.js"><\/script>/, '');
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/index\.css">/, () => `<style>${css}</style>`);
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
if (html.includes('assets/app.js') || html.includes('assets/index.css')) throw new Error('inline failed');
fs.writeFileSync(p, html);
fs.rmSync('../../demo/assets', { recursive: true });
console.log('inlined', html.length, 'bytes');
