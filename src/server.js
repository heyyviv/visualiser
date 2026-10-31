// Local HTTP server for the viewer: static files + a tiny read-only JSON API. node:http only, 127.0.0.1 only.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, MODELS_DIR, PARTS_DIR } from './paths.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png' };
const STATIC = [
  ['/viewer/', join(ROOT, 'src/viewer')],
  ['/src/', join(ROOT, 'src'), '.js'],
  ['/vendor/manifold/', join(ROOT, 'node_modules/manifold-3d')],
  ['/vendor/three/', join(ROOT, 'node_modules/three')],
];
const NAME = /^[\w-]+$/;

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const tryRead = (f) => readFile(f, 'utf8').catch(() => null);

async function byMtime(dir, filter) {
  const names = (await readdir(dir).catch(() => [])).filter(filter);
  const withT = await Promise.all(names.map(async (n) => ({ n, t: (await stat(join(dir, n))).mtimeMs })));
  return withT.sort((a, b) => a.t - b.t).map((x) => x.n);
}

async function api(path, res) {
  if (path === '/api/models') {
    const dirs = [];
    for (const d of await readdir(MODELS_DIR, { withFileTypes: true }).catch(() => [])) if (d.isDirectory() && NAME.test(d.name)) dirs.push(d.name);
    const withT = await Promise.all(dirs.map(async (n) => ({ n, t: (await stat(join(MODELS_DIR, n))).mtimeMs })));
    return send(res, 200, withT.sort((a, b) => b.t - a.t).map((x) => x.n));
  }
  if (path.startsWith('/api/model/')) {
    const name = path.slice(11);
    if (name.endsWith('/model.glb') && NAME.test(name.slice(0, -10))) {
      const glb = await readFile(join(MODELS_DIR, name)).catch(() => null);
      return glb ? send(res, 200, glb, 'model/gltf-binary') : send(res, 404, { error: 'no glb' });
    }
    if (!NAME.test(name)) return send(res, 400, { error: 'bad model name' });
    const script = await tryRead(join(MODELS_DIR, name, 'model.js'));
    const source = await tryRead(join(MODELS_DIR, name, 'source.json'));
    if (script == null && source != null) return send(res, 200, { name, glb: `/api/model/${name}/model.glb`, source: JSON.parse(source) });
    if (script == null) return send(res, 404, { error: `no model "${name}"` });
    const rep = await tryRead(join(MODELS_DIR, name, 'report.json'));
    let report = null;
    try { report = rep && JSON.parse(rep); } catch {}
    return send(res, 200, { name, script, report });
  }
  if (path === '/api/userparts') {
    const files = await byMtime(PARTS_DIR, (n) => n.endsWith('.js') && NAME.test(n.slice(0, -3)));
    return send(res, 200, await Promise.all(files.map(async (f) => ({ name: f.slice(0, -3), script: await tryRead(join(PARTS_DIR, f)) }))));
  }
  send(res, 404, { error: 'unknown api' });
}

async function handle(req, res) {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad url', 'text/plain'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
  if (path === '/' || path === '/viewer') { res.writeHead(302, { location: '/viewer/' }); return res.end(); }
  if (path.startsWith('/api/')) return api(path, res);
  for (const [prefix, dir, only] of STATIC) {
    if (!path.startsWith(prefix)) continue;
    let file = resolve(dir, '.' + path.slice(prefix.length - 1));
    if (file !== dir && !file.startsWith(dir + sep)) return send(res, 400, 'bad path', 'text/plain');
    if (path.endsWith('/')) file = join(file, 'index.html');
    if (only && extname(file) !== only) return send(res, 404, 'not found', 'text/plain');
    const body = await readFile(file).catch(() => null);
    if (!body) return send(res, 404, 'not found', 'text/plain');
    return send(res, 200, body, MIME[extname(file)] || 'application/octet-stream');
  }
  send(res, 404, 'not found', 'text/plain');
}

export function startServer({ port = Number(process.env.FORGE3D_PORT) || 4317 } = {}) {
  return new Promise((ok, fail) => {
    const server = createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: e.message })));
    server.once('error', (e) => {
      // another forge3d session already serves this port: reuse it
      if (e.code === 'EADDRINUSE') ok({ url: `http://127.0.0.1:${port}/`, close: async () => {}, reused: true });
      else fail(e);
    });
    server.listen(port, '127.0.0.1', () => {
      ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { url } = await startServer();
  console.log(`forge3d viewer: ${url}viewer/`);
}
