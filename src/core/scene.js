// Scenes: several named solids (animated, explodable) + visual-only helpers + an optional step-by-step story.
// Runs unchanged in Node (build/export) and in the browser viewer.
//
// scene({
//   title: 'Planetary gearbox',
//   objects: { sun: gear({...}), ring: { solid: ringGear({...}), color: '#888', anim: spin(-20), explode: [0,0,20], label: 'Ring' } },
//   visuals: { flux: fieldLoop({ path: [[..],[..]] }), note: label({ text: 'Core', at: 'core' }) },
//   steps:   [{ title, text, show: ['flux'], highlight: ['sun'], camera: 'sun', explode: 0..1 }],
// })
//
// anim(t) -> list of ops applied in order: { rotate: [x,y,z] degrees, about: [x,y,z] } | { translate: [x,y,z] }
// t is seconds. A visual whose id appears in some step's `show` is visible only in those steps; others always.

const isSolid = (v) => v && typeof v.getMesh === 'function';
const PALETTE = ['#4f8ef7', '#f7a24f', '#5cc98a', '#e05d6f', '#a77bf3', '#3fc1c9', '#e8c547', '#9aa5b1'];

export function scene({ title = '', objects = {}, visuals = {}, steps = [] } = {}) {
  const objs = {};
  Object.entries(objects).forEach(([id, v], i) => {
    const o = isSolid(v) ? { solid: v } : { ...v };
    if (!isSolid(o.solid)) throw new Error(`scene object "${id}" has no solid`);
    o.color ??= PALETTE[i % PALETTE.length];
    objs[id] = o;
  });
  for (const [id, v] of Object.entries(visuals)) if (!v?.type) throw new Error(`visual "${id}" is not a visual (use arrow(), label(), flow()...)`);
  for (const s of steps) for (const id of [...(s.show || []), ...(s.highlight || [])])
    if (!objs[id] && !visuals[id]) throw new Error(`step "${s.title}" refers to unknown id "${id}"`);
  return { __scene: true, title, objects: objs, visuals, steps };
}

// a bare solid becomes a one-object scene
export const asScene = (out) => (out?.__scene ? out : scene({ objects: { model: out } }));

// ---- animation helpers ----
// rotate at `degPerSec` around an axis through `about`
export const spin = (degPerSec, about = [0, 0, 0], axis = 'z') => (t) => {
  const r = [0, 0, 0];
  r['xyz'.indexOf(axis)] = degPerSec * t;
  return [{ rotate: r, about }];
};
// slide back and forth along `dir` (mm) with period `sec`
export const slide = (dir, sec = 2) => (t) => {
  const k = Math.sin((2 * Math.PI * t) / sec);
  return [{ translate: dir.map((d) => d * k) }];
};
// swing between 0 and `deg` around an axis through `about` with period `sec`
export const swing = (deg, about = [0, 0, 0], axis = 'z', sec = 2) => (t) => {
  const r = [0, 0, 0];
  r['xyz'.indexOf(axis)] = (deg * (1 - Math.cos((2 * Math.PI * t) / sec))) / 2;
  return [{ rotate: r, about }];
};
// apply several animations in order, e.g. chain(spin(30, planetCentre), spin(10)) = spin on own axis then orbit
export const chain = (...fns) => (t) => fns.flatMap((f) => f(t));
