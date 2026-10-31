// One convention for every reusable thing (part, assembly, visual): a callable with metadata.
export const registry = new Map();

export function part({ name, doc = '', params = {}, build, anim, kind = 'solid' }) {
  if (!name || typeof build !== 'function') throw new Error('part needs a name and a build(params) function');
  const fn = (p = {}) => {
    const merged = { ...params, ...p };
    const out = build(merged);
    if (out && typeof out === 'object') out.__part = { name, params: merged, anim };
    return out;
  };
  Object.assign(fn, { partName: name, doc, params, anim, kind, build });
  registry.set(name, fn);
  return fn;
}

// one line per part: cheap for an LLM to read
export const signature = (fn) =>
  `${fn.partName}(${Object.entries(fn.params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})${fn.kind === 'visual' ? ' [visual]' : ''}${fn.doc ? ' - ' + fn.doc : ''}`;
