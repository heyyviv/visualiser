// Evaluate a composition script with the whole library in scope. Runs in Node and in the browser.
// A script is a function body that returns a solid or a scene().
// `param(name, default, min, max, step)` declares a tunable value (a slider in the viewer).
import * as geom from './core/geom.js';
import * as sdf from './core/sdf.js';
import * as sceneApi from './core/scene.js';
import * as visuals from './core/visuals.js';
import * as parts from './parts/index.js';
import { part } from './core/part.js';

export const api = { ...geom, ...sdf, ...sceneApi, ...visuals, ...parts, part, Math };
delete api.wasm;
delete api.asScene;

const exec = (script, scope) =>
  new Function(...Object.keys(scope), `'use strict';\n${script}`)(...Object.values(scope));

// userParts: [{ name, script }] where each script does `return part({...})`; later ones may use earlier ones
export function userScope(userParts = []) {
  const extra = {};
  for (const { name, script } of userParts) {
    try { extra[name] = exec(script, { ...api, ...extra, param: (n, d) => d }); }
    catch (e) { console.error(`forge3d: user part ${name} failed: ${e.message}`); }
  }
  return extra;
}

// -> { result: scene, params: [{ name, value, min, max, step }] }
export function evaluate(script, { overrides = {}, extra = {} } = {}) {
  const params = [];
  const param = (name, def, min = 0, max = def * 2 || 10, step = Number.isInteger(def) ? 1 : 0.1) => {
    const value = overrides[name] ?? def;
    params.push({ name, value, def, min, max, step });
    return value;
  };
  const out = exec(script, { ...api, ...extra, param });
  if (!out) throw new Error('script returned nothing: end it with `return <solid or scene(...)>`');
  return { result: sceneApi.asScene(out), params };
}
