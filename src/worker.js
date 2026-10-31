// One build per worker thread: script errors and runaway loops stay out of the MCP server process.
// in (workerData): { script, overrides, userParts, outDir? }  out (postMessage): summary | { error }
import { workerData, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// new Function puts the body 3 lines down: `function anonymous(args\n) {\n'use strict';\n<script>`
const where = (stack = '') => {
  const m = stack.match(/<anonymous>:(\d+):(\d+)/);
  return m ? ` (script line ${m[1] - 3}, col ${m[2]})` : '';
};

// Loaded lazily, outside module evaluation: terminate() on a worker whose module (with TLA) is still evaluating aborts Node 26.
Promise.all([import('./build.js'), import('./run.js')]).then(([{ build }, { userScope }]) => {
  try {
    const { script, overrides = {}, userParts = [], outDir } = workerData;
    const { scene, params, stl, report } = build(script, { overrides, extra: userScope(userParts) });
    const summary = {
      title: scene.title,
      params,
      objects: Object.keys(scene.objects),
      visuals: Object.keys(scene.visuals),
      steps: scene.steps.length,
      report,
    };
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'model.js'), script);
      writeFileSync(join(outDir, 'model.stl'), stl);
      writeFileSync(join(outDir, 'report.json'), JSON.stringify({ ...summary, overrides }, null, 2));
    }
    parentPort.postMessage(summary);
  } catch (e) {
    parentPort.postMessage({ error: `${e?.name || 'Error'}: ${e?.message ?? e}${where(e?.stack)}` });
  }
});
