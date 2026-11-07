// After `expo export -p web` (npm run build:web): makes the web app open faster.
//
// - The page asks for everything the first screen needs as soon as it starts (the drawing engine,
//   the fonts, the icon font, the first screen's code), all at once, instead of each only once the
//   code before it has run; the other pages' code comes next, quietly, so going to one is instant.
// - The drawing engine gets a name with a hash of its contents, like the rest of the app's files,
//   so the service worker can keep it (and they all change name whenever they change).
// - The service worker's store of those files is named for this build, so a new version clears out
//   the old one's.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const base = require('../app.json').expo.experiments.baseUrl;
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 20);
const url = (file) => `${base}/${path.relative(dist, file).split(path.sep).join('/')}`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// The drawing engine, named for its contents.
const wasmPath = path.join(dist, 'canvaskit.wasm');
const wasm = `canvaskit.${hash(fs.readFileSync(wasmPath))}.wasm`;
fs.renameSync(wasmPath, path.join(dist, wasm));

// The fonts the app loads at the start (src/app/_layout.tsx), and the icons'.
const FONTS = /\/(Baloo2_700Bold|Baloo2_800ExtraBold|Nunito_400Regular|Nunito_600SemiBold|Nunito_700Bold|Nunito_800ExtraBold|MaterialCommunityIcons)\.[0-9a-f]+\.ttf$/;
const fonts = walk(path.join(dist, 'assets')).filter((f) => FONTS.test(f.split(path.sep).join('/')));

// The pages' code: the first screen's (the layouts and Home) right away, the others next.
const jsDir = path.join(dist, '_expo', 'static', 'js', 'web');
const chunks = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js') && !html.includes(f));
const first = chunks.filter((f) => /^(_layout|index)-/.test(f));
const later = chunks.filter((f) => !first.includes(f));

const links = [
  `<script>window.__CANVASKIT_WASM__=${JSON.stringify(wasm)}</script>`,
  `<link rel="preload" href="${base}/${wasm}" as="fetch" type="application/wasm" crossorigin>`,
  ...fonts.map((f) => `<link rel="preload" href="${url(f)}" as="font" type="font/ttf" crossorigin>`),
  ...first.map((f) => `<link rel="preload" href="${base}/_expo/static/js/web/${f}" as="script">`),
  ...later.map((f) => `<link rel="prefetch" href="${base}/_expo/static/js/web/${f}" as="script">`),
];
html = html.replace('</title>', `</title>\n    ${links.join('\n    ')}`);
fs.writeFileSync(indexPath, html);

// The service worker's store, named for this build.
const swPath = path.join(dist, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("'bloom-files-dev'")) throw new Error("sw.js has no 'bloom-files-dev' store name to stamp");
fs.writeFileSync(swPath, sw.replace("'bloom-files-dev'", `'bloom-files-${hash(html)}'`));

console.log(`web-finish: ${wasm}, ${fonts.length} fonts, ${first.length} first and ${later.length} later chunks`);
