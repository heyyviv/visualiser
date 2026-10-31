#!/usr/bin/env node
// forge3d MCP server (stdio). stdout belongs to the protocol: log only to stderr.
import { Worker } from 'node:worker_threads';
import { mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { catalog, partDoc, loadUserParts, BUILTINS } from './catalog.js';
import { MODELS_DIR, PARTS_DIR } from './paths.js';
import * as sketchfab from './sketchfab.js';

console.log = console.error; // a stray log from a library must never corrupt the protocol
const TIMEOUT = Number(process.env.FORGE3D_TIMEOUT_MS) || 60_000;
const PORT = Number(process.env.FORGE3D_PORT ?? 4317); // 0 = any free port (tests)

// downloads not kept with keep_model are deleted when the session ends (client closes stdin or kills us)
const unsaved = new Set();
process.on('exit', () => { for (const n of unsaved) rmSync(join(MODELS_DIR, n), { recursive: true, force: true }); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit());
process.stdin.on('close', () => process.exit());

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ ...text(t), isError: true });

// fresh worker per run: a crash, OOM or infinite loop only kills the worker
function runWorker(data) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
      stdout: true, // keep script console.log off our stdout
    });
    w.stdout.on('data', (d) => process.stderr.write(d));
    const done = (r) => { clearTimeout(timer); w.terminate(); resolve(r); };
    const timer = setTimeout(() => done({ error: `timed out after ${TIMEOUT / 1000}s (infinite loop or too much detail? lower resolution/segments)` }), TIMEOUT);
    w.on('message', done);
    w.on('error', (e) => done({ error: `worker crashed: ${e.message}` }));
    w.on('exit', (code) => done({ error: `worker exited (code ${code}) without a result` }));
  });
}

let viewer; // Promise<{ url } | null>, started once
function viewerUrl() {
  viewer ??= (async () => {
    try {
      const { startServer } = await import('./server.js');
      return await startServer({ port: PORT }); // reuses the port if another session serves it
    } catch (e) {
      console.error(`forge3d: viewer unavailable: ${e.message}`);
      return null;
    }
  })();
  return viewer.then((s) => s?.url.replace(/\/$/, '') ?? null);
}
const modelLink = (base, name) => (base ? `${base}/viewer/?model=${encodeURIComponent(name)}` : 'viewer unavailable');

const server = new McpServer({ name: 'forge3d', version: '0.1.0' });

server.registerTool('catalog', {
  description: 'START HERE. Returns the forge3d script API (primitives, ops, SDF, scene/animation, param) and one line per available part with its params. Read it once, then write a SHORT build script that composes existing parts instead of raw geometry. filter = substring to narrow the list (e.g. "gear").',
  inputSchema: { filter: z.string().optional() },
}, async ({ filter }) => text(catalog(filter)));

server.registerTool('part_doc', {
  description: 'Full doc for one part from the catalog: params with defaults, notes, and source for user parts. Use only when the one-line catalog entry is not enough.',
  inputSchema: { name: z.string() },
}, async ({ name }) => {
  const d = partDoc(name);
  return d ? text(d) : fail(`no part "${name}"; call catalog to see names`);
});

server.registerTool('build', {
  description: 'Build a model from a script (a JS function body ending in `return <solid>` or `return scene({...})`, all catalog names in scope, units mm, bed z=0). Writes an STL and returns a live 3D viewer URL to give the user, plus size and print warnings. Use param(name, default, min, max) for tunable dimensions; pass overrides {param: value} to rebuild variants without rewriting the script. For a how-it-works explainer return scene({ objects, visuals, steps }) with anim and steps. Rebuilding the same name replaces the model.',
  inputSchema: {
    name: z.string().regex(/^[a-z0-9-]+$/).describe('model id, lowercase-dashes'),
    script: z.string(),
    overrides: z.record(z.string(), z.number()).optional(),
  },
}, async ({ name, script, overrides }) => {
  const outDir = join(MODELS_DIR, name);
  const r = await runWorker({ script, overrides, userParts: loadUserParts(), outDir });
  if (r.error) return fail(`${r.error}\nFix the script and call build again.`);
  const { size_mm, volume_cm3, triangles, warnings } = r.report;
  return text([
    `built "${name}"${r.title ? ` (${r.title})` : ''}: objects [${r.objects}]${r.visuals.length ? `, visuals [${r.visuals}]` : ''}${r.steps ? `, ${r.steps} steps` : ''}`,
    `viewer: ${modelLink(await viewerUrl(), name)}`,
    `stl: ${join(outDir, 'model.stl')}`,
    `size ${size_mm.join(' x ')} mm, ${volume_cm3} cm3, ${triangles} tris`,
    r.params.length ? `params: ${r.params.map((p) => `${p.name}=${p.value} [${p.min}..${p.max}]`).join(', ')}` : '',
    warnings.length ? `warnings: ${warnings.join('; ')}` : 'no print warnings',
  ].filter(Boolean).join('\n'));
});

server.registerTool('save_part', {
  description: 'Save a reusable part so later builds (and future sessions) can call it by name, keeping scripts short. script must `return part({ name, doc, params: { k: default }, build: (p) => solid })` with name equal to `name`. It is test-built with default params before saving; then it shows in catalog marked [user]. Saving an existing user part name replaces it; built-in names are refused.',
  inputSchema: {
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/).describe('camelCase identifier'),
    script: z.string(),
  },
}, async ({ name, script }) => {
  if (BUILTINS.has(name)) return fail(`"${name}" is a built-in name; pick another`);
  const check = `const __p = (() => {\n${script}\n})();
if (typeof __p !== 'function' || __p.partName !== ${JSON.stringify(name)}) throw new Error('script must return part({ name: ${JSON.stringify(name)}, ... })');
const __o = __p();
return __o && __o.type ? scene({ objects: { ref: box(1) }, visuals: { v: __o } }) : __o;`;
  const r = await runWorker({ script: check, userParts: loadUserParts().filter((u) => u.name !== name) });
  if (r.error) return fail(`not saved: ${r.error}`);
  mkdirSync(PARTS_DIR, { recursive: true });
  writeFileSync(join(PARTS_DIR, `${name}.js`), script);
  return text(`saved ${name} (default build ${r.report.size_mm.join(' x ')} mm); use it in scripts as ${name}({...})`);
});

server.registerTool('find_model', {
  description: 'Search Sketchfab for a ready-made, downloadable 3D model (e.g. "bicycle drivetrain") before building one from scratch. Returns uid, name, author, license, face count and GLB size per result. Then call get_model with the best uid.',
  inputSchema: { query: z.string() },
}, async ({ query }) => {
  try {
    const rs = await sketchfab.search(query);
    return text(rs.length ? rs.map((m) => `${m.uid}  ${m.name} by ${m.author} | ${m.license} | ${m.faces} faces | ${m.size}`).join('\n') : 'no downloadable models found; try other words or build one');
  } catch (e) { return fail(e.message); }
});

server.registerTool('get_model', {
  description: 'Download a Sketchfab model (uid from find_model) as GLB and open it in the viewer, where the explode slider pulls its meshes apart. Needs a free Sketchfab API token in ~/.forge3d/sketchfab_token or SKETCHFAB_TOKEN. Tell the user the author and license (CC licenses require credit).',
  inputSchema: {
    uid: z.string().regex(sketchfab.UID),
    name: z.string().regex(/^[a-z0-9-]+$/).describe('model id, lowercase-dashes'),
  },
}, async ({ uid, name }) => {
  const tok = sketchfab.token();
  if (!tok) return fail('no Sketchfab token. The user gets one free at https://sketchfab.com/settings/password (API Token) and saves it with: ! echo <token> > ~/.forge3d/sketchfab_token');
  if (!unsaved.has(name) && existsSync(join(MODELS_DIR, name))) return fail(`model "${name}" already exists; pick another name`); // never overwrite a kept model
  try {
    const s = await sketchfab.download(uid, join(MODELS_DIR, name), tok);
    unsaved.add(name);
    return text(`downloaded "${s.name}" by ${s.author} (${s.license}), ${s.size}\nviewer: ${modelLink(await viewerUrl(), name)}\nglb: ${join(MODELS_DIR, name, 'model.glb')}\nsource: ${s.url}\ntemporary: deleted when this session ends unless the user asks to keep it (keep_model)`);
  } catch (e) { return fail(e.message); }
});

server.registerTool('keep_model', {
  description: 'Keep a model downloaded this session. Downloads are deleted when the session ends unless the user asked to save or keep them; call this only when they did.',
  inputSchema: { name: z.string().regex(/^[a-z0-9-]+$/) },
}, async ({ name }) => (unsaved.delete(name) ? text(`kept ${join(MODELS_DIR, name)}`) : fail(`"${name}" is not a temporary download from this session`)));

const isModel = (n) => existsSync(join(MODELS_DIR, n, 'model.js')) || existsSync(join(MODELS_DIR, n, 'model.glb'));
server.registerTool('view', {
  description: 'Get the 3D viewer URL for a built model (name), or list all built models with URLs (no name).',
  inputSchema: { name: z.string().optional() },
}, async ({ name }) => {
  const base = await viewerUrl();
  if (name) return isModel(name) ? text(modelLink(base, name)) : fail(`no model "${name}"; call view() to list`);
  let names = [];
  try { names = readdirSync(MODELS_DIR).filter(isModel); } catch {}
  return text(names.length ? names.map((n) => `${n}: ${modelLink(base, n)}`).join('\n') : 'no models yet; use build');
});

await server.connect(new StdioServerTransport());
