// Local test copy of the site for the Mac test shell. Parker's laptop never sees it.
// Serves this folder at http://localhost:4790 and answers /api/v1/manifest with the
// live manifest.json switched to the redesign (new Home, typed pit stop, Fact Sprint
// tile retired into the Run, Hoot off as on Parker's laptop unless HOOT=1).
// Run: node scripts/test-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '4790', 10);
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };

function testManifest() {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  m.urls.hub = ORIGIN;
  m.ui.hub = '/home/';
  m.ui.overlay = '/pit/index.html';
  m.questions.mix = { facts: 1 };
  m.games = m.games.filter((g) => g.key !== 'fact-sprint');
  if (process.env.HOOT !== '1' && m.features.companion) m.features.companion.enabledKeys = [];
  m.version = m.version + '-redesign-test';
  return m;
}

http.createServer((req, res) => {
  const u = new URL(req.url, ORIGIN);
  if (u.pathname === '/api/v1/manifest') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(testManifest()));
  }
  if (u.pathname === '/env.js') {
    // Tag every test event with the test key, never Parker's.
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    return res.end("window.__ARCADE_ENV = {};\nwindow.__ARCADE_FORCE_KEY = 'mac-test';\n");
  }
  let p = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html'); } catch (e) {}
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`redesign test site on ${ORIGIN}`));
