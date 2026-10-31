// Token-cheap text listing of everything a script can use: core API + one line per registered part.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { api, userScope } from './run.js';
import { registry, signature } from './core/part.js';
import { PARTS_DIR } from './paths.js';

// names a user part may not take
export const BUILTINS = new Set([...Object.keys(api), ...registry.keys(), 'param', 'scene']);

// [{ name, script }] from PARTS_DIR, oldest first so a part can use parts saved before it (same order as server.js)
export function loadUserParts() {
  let files = [];
  try {
    files = readdirSync(PARTS_DIR).filter((f) => f.endsWith('.js'))
      .sort((a, b) => statSync(join(PARTS_DIR, a)).mtimeMs - statSync(join(PARTS_DIR, b)).mtimeMs);
  } catch { return []; }
  return files.map((f) => ({ name: f.slice(0, -3), script: readFileSync(join(PARTS_DIR, f), 'utf8') }));
}

const CORE = `# forge3d script = JS function body ending in \`return <solid | scene({...})>\`. Units mm, bed is z=0, Z up.
primitives (sit on bed, centred XY unless noted): box(size|[x,y,z], {center}) roundedBox([x,y,z], r) cylinder(r, h, r2?) cone(r1, r2, h) sphere(r) [centred at origin] torus(R, r) [centred] extrude([[x,y]...], h, {twist, scale}) revolve([[r,z]...], deg=360) tube([[x,y,z]...], r) polygon(pts)/circle(r) -> 2D CrossSection (.offset(d), .add/.subtract, then .extrude(h) or .revolve() to get a solid)
ops: union(...m) subtract(a, ...b) intersect(...m) hull(...m) mirror(m, normal=[1,0,0], keep=true) array(m, n, [dx,dy,dz]) polar(m, n, deg=360) twist(m, deg) bend(m, deg) onBed(m)
solid methods: m.translate([x,y,z]) m.rotate([rx,ry,rz] deg) m.scale(s|[x,y,z]) m.mirror([nx,ny,nz]) m.boundingBox() m.volume()
sdf (p)=>dist, negative inside: sSphere(r) sBox([x,y,z], r) sCylinder(r, h) sTorus(R, r) sGyroid(cell, t) sUnion sIntersect sSubtract(a, ...b) sSmoothUnion(k, ...f) sSmoothSubtract(k, a, b) sShell(f, t) sRound(f, r) sMove(f, [x,y,z]) sScale(f, s) sTwist(f, degPerMm) sWarp(f, p=>p) -> mesh(f, {min:[x,y,z], max:[x,y,z]}, res=1) gives a solid
tunables: param(name, default, min?, max?, step?) -> number, becomes a viewer slider and a build override
scene({ title, objects: { id: solid | { solid, color, anim, explode: [x,y,z], label } }, visuals: { id: visual }, steps: [{ title, text, show: [visualIds], highlight: [ids], camera: id }] })
anim(t sec): spin(degPerSec, about=[0,0,0], axis='z') slide([dx,dy,dz], sec=2) swing(deg, about, axis, sec) chain(...anims)
reusable parts: part({ name, doc, params: { k: default }, build: (p) => solid, kind: 'solid'|'visual' }) -> callable name(p)
# parts: name(param=default) - doc. Call with an object: gear({ teeth: 20 }). Visual positions: [x,y,z] or an object id.`;

export function catalog(filter) {
  const users = loadUserParts();
  userScope(users); // registers user parts
  const userNames = new Set(users.map((u) => u.name));
  const fns = [...registry.values()];
  const lines = [
    ...fns.filter((f) => !userNames.has(f.partName) && f.kind !== 'visual').map(signature),
    ...fns.filter((f) => !userNames.has(f.partName) && f.kind === 'visual').map(signature),
    ...fns.filter((f) => userNames.has(f.partName)).map((f) => `${signature(f)} [user]`),
  ];
  if (!filter) return `${CORE}\n${lines.join('\n')}`;
  const q = filter.toLowerCase();
  const hits = [...CORE.split('\n'), ...lines].filter((l) => l.toLowerCase().includes(q));
  return hits.length ? hits.join('\n') : `nothing matches "${filter}"; call catalog() with no filter`;
}

export function partDoc(name) {
  const user = loadUserParts();
  userScope(user);
  const fn = registry.get(name);
  if (!fn) return null;
  const src = user.find((u) => u.name === name)?.script ?? (fn.kind === 'visual' ? '' : `build: ${fn.build}`);
  return [signature(fn), `params: ${JSON.stringify(fn.params)}`, fn.anim ? 'has default anim' : '', src ? `source:\n${src}` : '']
    .filter(Boolean).join('\n');
}
