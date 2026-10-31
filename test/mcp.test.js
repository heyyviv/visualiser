import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const home = mkdtempSync(join(tmpdir(), 'forge3d-'));
const client = new Client({ name: 'test', version: '0' });
const call = (name, args = {}) => client.callTool({ name, arguments: args });
const txt = (r) => r.content[0].text;

before(async () => {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [new URL('../src/mcp.js', import.meta.url).pathname],
    env: { ...process.env, FORGE3D_HOME: home, FORGE3D_PORT: '0', FORGE3D_TIMEOUT_MS: '3000' },
    stderr: 'ignore',
  }));
});
after(async () => { await client.close(); rmSync(home, { recursive: true, force: true }); });

test('lists the tools and the catalog', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['build', 'catalog', 'find_model', 'get_model', 'keep_model', 'part_doc', 'save_part', 'view']);
  assert.match(txt(await call('catalog')), /subtract\(a, \.\.\.b\)[\s\S]*flow\(/);
  assert.match(txt(await call('catalog', { filter: 'gyroid' })), /sGyroid/);
});

test('build writes an STL and returns a viewer URL', async () => {
  const r = await call('build', { name: 'cube', script: 'return subtract(box(20), sphere(12).translate([0, 0, 10]))' });
  assert.ok(!r.isError, txt(r));
  assert.match(txt(r), /viewer: http:\/\/127\.0\.0\.1:\d+\/viewer\/\?model=cube/);
  assert.match(txt(r), /size 20 x 20 x 20 mm/);
  assert.ok(existsSync(join(home, 'models/cube/model.stl')));
  assert.match(txt(await call('view')), /cube: http/);
});

test('script errors come back as tool errors with a line number', async () => {
  const syntax = await call('build', { name: 'bad', script: 'return box(' });
  assert.equal(syntax.isError, true);
  assert.match(txt(syntax), /SyntaxError/);
  const runtime = await call('build', { name: 'bad', script: 'const a = 1;\nreturn nope(a)' });
  assert.equal(runtime.isError, true);
  assert.match(txt(runtime), /nope is not defined \(script line 2/);
});

test('an infinite loop times out and the server keeps working', async () => {
  const r = await call('build', { name: 'loop', script: 'while (true) {}' });
  assert.equal(r.isError, true);
  assert.match(txt(r), /timed out/);
  assert.ok(!(await call('catalog', { filter: 'box' })).isError);
});

test('save_part adds a [user] part that builds can use', async () => {
  const script = `return part({ name: 'testWidget', doc: 'flat ring', params: { od: 10, id: 5, h: 2 },
    build: (p) => subtract(cylinder(p.od / 2, p.h), cylinder(p.id / 2, p.h)) })`;
  assert.equal((await call('save_part', { name: 'testWidget', script: script.replace("'testWidget'", "'other'") })).isError, true);
  assert.equal((await call('save_part', { name: 'box', script })).isError, true);
  const saved = await call('save_part', { name: 'testWidget', script });
  assert.ok(!saved.isError, txt(saved));
  assert.match(txt(await call('catalog', { filter: 'testWidget' })), /testWidget\(od=10.*\[user\]/);
  assert.match(txt(await call('part_doc', { name: 'testWidget' })), /source:/);
  const r = await call('build', { name: 'widgets', script: 'return union(testWidget(), testWidget({ od: 20 }).translate([20, 0, 0]))' });
  assert.ok(!r.isError, txt(r));
});
