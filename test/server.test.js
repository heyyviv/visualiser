import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'forge3d-'));
mkdirSync(join(home, 'models', 'x'), { recursive: true });
writeFileSync(join(home, 'models', 'x', 'model.js'), 'return box(10)');
writeFileSync(join(home, 'models', 'x', 'report.json'), '{"volume_cm3":1}');
mkdirSync(join(home, 'parts'));
writeFileSync(join(home, 'parts', 'peg.js'), "return part({ name: 'peg', build: () => cylinder(2, 5) })");
process.env.FORGE3D_HOME = home; // must be set before paths.js is imported
const { startServer } = await import('../src/server.js');

test('server: api, static files, traversal', async (t) => {
  const { url, close } = await startServer({ port: 0 });
  t.after(close);
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const get = (p) => fetch(new URL(p, url), { redirect: 'manual' });

  assert.deepEqual(await (await get('/api/models')).json(), ['x']);
  assert.deepEqual(await (await get('/api/model/x')).json(), { name: 'x', script: 'return box(10)', report: { volume_cm3: 1 } });
  assert.equal((await get('/api/model/nope')).status, 404);
  assert.equal((await get('/api/model/..%2F..%2Fetc')).status, 400);
  assert.deepEqual(await (await get('/api/userparts')).json(), [{ name: 'peg', script: "return part({ name: 'peg', build: () => cylinder(2, 5) })" }]);

  for (const p of ['/src/..%2Fpackage.json', '/viewer/..%2F..%2Fpackage.json', '/vendor/three/..%2F..%2Fpackage.json'])
    assert.ok([400, 404].includes((await get(p)).status), p);
  assert.equal((await get('/src/paths.json')).status, 404);

  assert.equal((await get('/')).headers.get('location'), '/viewer/');
  const wasm = await get('/vendor/manifold/manifold.wasm');
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.equal((await get('/src/run.js')).headers.get('content-type'), 'text/javascript');
  assert.match(await (await get('/viewer/')).text(), /importmap/);
});

test('server: downloaded glb model', async (t) => {
  mkdirSync(join(home, 'models', 'bike'));
  writeFileSync(join(home, 'models', 'bike', 'model.glb'), 'glTF-bytes');
  writeFileSync(join(home, 'models', 'bike', 'source.json'), '{"name":"Bike","license":"CC Attribution"}');
  const { url, close } = await startServer({ port: 0 });
  t.after(close);
  const get = (p) => fetch(new URL(p, url));
  assert.deepEqual(await (await get('/api/model/bike')).json(), { name: 'bike', glb: '/api/model/bike/model.glb', source: { name: 'Bike', license: 'CC Attribution' } });
  const glb = await get('/api/model/bike/model.glb');
  assert.equal(glb.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(await glb.text(), 'glTF-bytes');
  assert.equal((await get('/api/model/..%2Fx/model.glb')).status, 400);
});
