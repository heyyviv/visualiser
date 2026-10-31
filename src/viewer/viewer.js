// forge3d viewer: runs the same library code as Node (/src/run.js) and draws the scene with three.js.
// World is Z-up, millimetres.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const V = (a) => new THREE.Vector3(...a);
const modelName = new URLSearchParams(location.search).get('model');

function showError(e) {
  $('err').hidden = !e;
  $('err').textContent = e ? String(e.message || e) : '';
  if (e) console.error(e);
}
$('toggle').onclick = () => document.body.classList.toggle('open');

async function listModels() {
  const names = await fetch('/api/models').then((r) => r.json());
  $('list').hidden = false;
  $('list').innerHTML = names.length ? '' : '<p>No models yet in ~/.forge3d/models.</p>';
  for (const n of names) $('list').insertAdjacentHTML('beforeend', `<a href="?model=${encodeURIComponent(n)}">${n}</a>`);
  document.body.classList.add('open');
}

// ---------- three setup ----------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' });
stage.appendChild(labels.domElement);

const world = new THREE.Scene();
world.background = new THREE.Color('#111318');
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1e5);
camera.up.set(0, 0, 1);
camera.position.set(100, -140, 90);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

world.add(new THREE.HemisphereLight('#dfe8ff', '#202430', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 4;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.3;
world.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#9fb8ff', 0.6);
world.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
ground.receiveShadow = true;
world.add(ground);
let grid = null;

const root = new THREE.Group(); // objects + visuals, rebuilt on every evaluation
world.add(root);

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- state ----------
const S = {
  data: null, params: [], overrides: {}, extra: {}, scene: null,
  objs: {}, vis: {}, updaters: [], box: new THREE.Box3(), centre: new THREE.Vector3(),
  t: 0, playing: true, speed: 1, explode: 0, step: 0, auto: null, fitted: false,
};
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

// ---------- building ----------
function solidGeometry(solid) {
  const { numProp, vertProperties, triVerts } = solid.getMesh();
  const pos = new Float32Array((vertProperties.length / numProp) * 3);
  for (let i = 0, j = 0; i < vertProperties.length; i += numProp, j += 3) pos.set(vertProperties.subarray(i, i + 3), j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(triVerts), 1));
  return toCreasedNormals(g, Math.PI / 6); // sharp edges stay sharp, curves stay smooth
}

const centreOf = (box) => box.getCenter(new THREE.Vector3());
// a position is [x,y,z] or an object id (= centre of that object)
const at = (p) => (typeof p === 'string' ? (S.objs[p] ? S.objs[p].centre.clone() : new THREE.Vector3()) : V(p));
const css = (cls, text, pos) => {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  return o;
};
const basic = (color, opacity = 1, additive = false) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive });

// blockGrid cell (r, c) centre: `at` is the grid centre, first axis letter = columns, second = rows (row 0 on top / first)
function cellPos(v, r, c) {
  const pitch = v.cell + v.gap;
  const [ca, ra] = [...v.axis].map((a) => 'xyz'.indexOf(a));
  const p = [...v.at];
  p[ca] += (c - (v.cols - 1) / 2) * pitch;
  p[ra] -= (r - (v.rows - 1) / 2) * pitch;
  return V(p);
}

const VISUALS = {
  arrow(v, g) {
    const from = at(v.from), to = at(v.to), d = to.clone().sub(from), len = d.length() || 1;
    g.add(new THREE.ArrowHelper(d.normalize(), from, len, v.color, Math.min(len * 0.25, 8), Math.min(len * 0.12, 4)));
    if (v.text) g.add(css('lbl', v.text, from.clone().lerp(to, 0.5)));
  },
  label(v, g) {
    g.add(css('lbl', v.text, at(v.at).add(V(v.offset || [0, 0, 0]))));
  },
  text3d(v, g) {
    const o = css('t3d', v.text, at(v.at));
    o.element.style.fontSize = `${v.size}em`;
    g.add(o);
  },
  flow(v, g) {
    const pts = v.path.map(at);
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, !!v.closed, 'centripetal');
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(64, pts.length * 16), v.radius * 0.35, 8, !!v.closed), basic(v.color, 0.3)));
    const len = curve.getLength(), dot = new THREE.SphereGeometry(v.radius, 12, 8), mat = basic(v.color, 1, true);
    const dots = Array.from({ length: v.count }, () => new THREE.Mesh(dot, mat));
    if (dots.length) g.add(...dots);
    S.updaters.push((t) => dots.forEach((d, i) => d.position.copy(curve.getPointAt((((i / v.count + (t * v.speed) / len) % 1) + 1) % 1))));
  },
  fieldLoop(v, g) { VISUALS.flow({ ...v, closed: true }, g); },
  blockGrid(v, g) {
    const n = v.rows * v.cols, box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true }), n);
    const [ca, ra] = [...v.axis].map((a) => 'xyz'.indexOf(a));
    const size = [v.cell * 0.4, v.cell * 0.4, v.cell * 0.4];
    size[ca] = size[ra] = v.cell;
    const dark = new THREE.Color('#1c2130'), hot = new THREE.Color(v.color), m = new THREE.Matrix4();
    for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) {
      const val = v.values?.[r]?.[c] ?? (Math.sin(r * 12.9898 + c * 78.233) * 43758.5453) % 1 * 0.5 + 0.5; // deterministic noise
      const i = r * v.cols + c;
      mesh.setMatrixAt(i, m.makeScale(...size).setPosition(cellPos(v, r, c)));
      mesh.setColorAt(i, dark.clone().lerp(hot, Math.min(1, Math.max(0, Math.abs(val)))));
    }
    g.add(mesh);
    (v.labels || []).forEach((t, r) => {
      if (t == null || t === '') return;
      const p = cellPos(v, r, 0);
      p.setComponent(ca, p.getComponent(ca) - v.cell * 0.8);
      const o = css('rowlbl', t, p);
      o.center.set(1, 0.5);
      g.add(o);
    });
  },
  connections(v, g) {
    const from = v.from.map(at), to = v.to.map(at), up = new THREE.Vector3(0, 1, 0);
    from.forEach((a, i) => to.forEach((b, j) => {
      const w = v.weights ? (v.weights[i]?.[j] ?? 0) : 1;
      if (w < 0.02) return;
      const d = b.clone().sub(a), cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), basic(v.color, 0.15 + 0.85 * w, true));
      cyl.scale.set(0.08 + 0.45 * w, d.length(), 0.08 + 0.45 * w);
      cyl.quaternion.setFromUnitVectors(up, d.clone().normalize());
      cyl.position.copy(a).lerp(b, 0.5);
      g.add(cyl);
    }));
  },
};

function clear() {
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.isCSS2DObject) o.element.remove();
  });
  root.clear();
  S.objs = {}; S.vis = {}; S.updaters = [];
}

function build(sc) {
  clear();
  S.box.makeEmpty();
  for (const [id, o] of Object.entries(sc.objects)) {
    const geo = o.geometry || solidGeometry(o.solid); // geometry + material: meshes from a downloaded GLB
    geo.computeBoundingBox();
    const mat = o.material || new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide, clipShadows: true });
    const mesh = new THREE.Mesh(geo, mat);
    Object.assign(mesh, { castShadow: true, receiveShadow: true, matrixAutoUpdate: false });
    const centre = centreOf(geo.boundingBox);
    if (o.label) mesh.add(css('lbl', o.label, new THREE.Vector3(centre.x, centre.y, geo.boundingBox.max.z + 3)));
    root.add(mesh);
    S.objs[id] = { o, mesh, centre };
    S.box.union(geo.boundingBox);
  }
  S.box.getCenter(S.centre);
  for (const [id, v] of Object.entries(sc.visuals)) {
    const g = new THREE.Group();
    try { VISUALS[v.type]?.(v, g); } catch (e) { showError(new Error(`visual "${id}": ${e.message}`)); }
    root.add(g);
    S.vis[id] = g;
  }
  root.traverse((o) => o.material && (o.material.userData.base = o.material.opacity));
  S.animated = S.updaters.length > 0 || Object.values(sc.objects).some((o) => o.anim);
  frameGround();
  setSection();
  applyStep();
}

function frameGround() {
  const size = S.box.getSize(new THREE.Vector3()), r = Math.max(size.x, size.y, size.z, 20);
  ground.scale.set(r * 6, r * 6, 1);
  ground.position.set(S.centre.x, S.centre.y, S.box.min.z - 0.01);
  if (grid) world.remove(grid), grid.dispose();
  const step = 10 ** Math.floor(Math.log10(r / 2));
  grid = new THREE.GridHelper(Math.ceil((r * 4) / step) * step, Math.ceil((r * 4) / step), '#3a4252', '#232833');
  grid.rotation.x = Math.PI / 2;
  grid.position.copy(ground.position);
  world.add(grid);
  sun.position.set(S.centre.x + r, S.centre.y - r * 0.6, S.centre.z + r * 2);
  sun.target.position.copy(S.centre);
  fill.position.set(S.centre.x - r, S.centre.y + r, S.centre.z + r * 0.5);
  Object.assign(sun.shadow.camera, { left: -r * 1.5, right: r * 1.5, top: r * 1.5, bottom: -r * 1.5, near: 0.1, far: r * 8 });
  sun.shadow.camera.updateProjectionMatrix();
  if (!S.fitted) {
    S.fitted = true;
    const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9;
    controls.target.copy(S.centre);
    camera.position.copy(S.centre).add(new THREE.Vector3(0.55, -0.75, 0.45).normalize().multiplyScalar(d));
  }
}

// ---------- per frame: animation + explode ----------
const tmp = new THREE.Matrix4(), tmp2 = new THREE.Matrix4();
function animMatrix(ops) {
  const m = new THREE.Matrix4();
  for (const op of ops || []) {
    if (op.translate) tmp.makeTranslation(...op.translate);
    else if (op.rotate) {
      const p = V(op.about || [0, 0, 0]);
      // Manifold rotates about x, then y, then z
      const e = new THREE.Euler(...op.rotate.map(THREE.MathUtils.degToRad), 'ZYX');
      tmp.makeTranslation(p.x, p.y, p.z).multiply(tmp2.makeRotationFromEuler(e)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    } else continue;
    m.premultiply(tmp);
  }
  return m;
}
function placeObjects() {
  for (const { o, mesh, centre } of Object.values(S.objs)) {
    const off = o.explode ? V(o.explode) : centre.clone().sub(S.centre);
    mesh.matrix.makeTranslation(off.multiplyScalar(S.explode));
    if (o.anim) mesh.matrix.multiply(animMatrix(o.anim(S.t)));
    mesh.matrixWorldNeedsUpdate = true;
  }
}

// ---------- section ----------
function setSection() {
  const on = $('section').checked, ax = 'xyz'.indexOf($('axis').value);
  const lo = S.box.min.getComponent(ax), hi = S.box.max.getComponent(ax);
  clipPlane.normal.set(0, 0, 0).setComponent(ax, -1);
  clipPlane.constant = lo + (hi - lo) * Number($('cut').value);
  for (const { mesh } of Object.values(S.objs)) mesh.material.clippingPlanes = on ? [clipPlane] : [];
}
['section', 'axis', 'cut'].forEach((id) => ($(id).oninput = setSection));

// ---------- steps ----------
const stepped = () => new Set((S.scene?.steps || []).flatMap((s) => s.show || []));
function applyStep() {
  dirty = true; // also reached from autoplay's timer, which no input event covers
  const steps = S.scene.steps || [];
  $('steps').hidden = !steps.length;
  const s = steps[S.step] || {};
  if (steps.length) {
    $('stepTitle').textContent = s.title || '';
    $('stepText').textContent = s.text || '';
    $('stepNum').textContent = `${S.step + 1} / ${steps.length}`;
  }
  const only = stepped(), show = new Set(s.show || []), hi = s.highlight?.length ? new Set(s.highlight) : null;
  const items = [...Object.entries(S.objs).map(([id, x]) => [id, x.mesh]), ...Object.entries(S.vis)];
  for (const [id, node] of items) {
    node.visible = !only.has(id) || show.has(id);
    const dim = hi && !hi.has(id);
    node.traverse((n) => {
      if (n.material) {
        n.material.opacity = (n.material.userData.base ?? 1) * (dim ? 0.15 : 1);
        n.material.transparent = n.material.opacity < 1 || n.material.blending === THREE.AdditiveBlending;
        n.material.depthWrite = !n.material.transparent;
      }
      if (n.isCSS2DObject) n.element.style.opacity = dim ? 0.25 : 1;
    });
  }
  if (S.flown !== S.step) {
    if (s.camera) flyTo(s.camera); // re-evaluating a param keeps the camera
    if (s.explode != null) $('explode').value = S.explode = s.explode;
  }
  S.flown = S.step;
}
function go(i) {
  const n = S.scene?.steps?.length || 0;
  if (!n) return;
  S.step = (i + n) % n;
  applyStep();
}
$('prev').onclick = () => go(S.step - 1);
$('next').onclick = () => go(S.step + 1);
$('auto').onclick = () => {
  clearInterval(S.auto);
  S.auto = $('auto').classList.toggle('on') ? setInterval(() => go(S.step + 1), 6000) : null;
};
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') go(S.step + 1);
  if (e.key === 'ArrowLeft') go(S.step - 1);
});

// ---------- camera fly-to ----------
let fly = null;
function flyTo(c) {
  let target, position;
  if (typeof c === 'object' && c.target) [target, position] = [at(c.target), at(c.position)];
  else {
    const node = S.objs[c]?.mesh || S.vis[c];
    if (!node) return;
    const box = new THREE.Box3().setFromObject(node);
    const sph = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3().setFromMatrixPosition(node.children[0]?.matrixWorld || node.matrixWorld), 20) : box.getBoundingSphere(new THREE.Sphere());
    target = sph.center;
    const d = Math.max(sph.radius, 8) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.5;
    position = target.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(d));
  }
  fly = { t0: performance.now(), p0: camera.position.clone(), q0: controls.target.clone(), p1: position, q1: target };
}
function stepFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / 900), e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(fly.p0, fly.p1, e);
  controls.target.lerpVectors(fly.q0, fly.q1, e);
  if (k === 1) fly = null;
}

// ---------- params UI ----------
let timer;
function paramsUI() {
  const box = $('params');
  box.hidden = !S.params.length;
  box.innerHTML = '';
  for (const p of S.params) {
    const l = document.createElement('label');
    l.className = 'slider';
    l.innerHTML = `${p.name} <span>${p.value}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">`;
    l.querySelector('input').oninput = (e) => {
      const v = Number(e.target.value);
      l.querySelector('span').textContent = v;
      S.overrides[p.name] = v;
      clearTimeout(timer);
      timer = setTimeout(run, 150);
    };
    box.appendChild(l);
  }
}

// ---------- evaluate ----------
function run() {
  try {
    const { result, params } = S.evaluate(S.data.script, { overrides: S.overrides, extra: S.extra });
    const newParams = JSON.stringify(params.map((p) => p.name)) !== JSON.stringify(S.params.map((p) => p.name));
    S.scene = result;
    S.params = params;
    S.step = Math.min(S.step, Math.max(0, (result.steps?.length || 1) - 1));
    $('title').textContent = result.title || modelName;
    document.title = `${result.title || modelName} · forge3d`;
    if (newParams) paramsUI();
    build(result);
    showError(null);
  } catch (e) { showError(e); }
}

// ---------- buttons ----------
$('play').onclick = () => {
  S.playing = !S.playing;
  $('play').textContent = S.playing ? '❚❚ Pause' : '▶ Play';
  $('play').classList.toggle('on', S.playing);
};
$('speed').oninput = (e) => (S.speed = Number(e.target.value));
$('explode').oninput = (e) => (S.explode = Number(e.target.value));
$('stl').onclick = () => {
  const g = new THREE.Group();
  for (const { mesh } of Object.values(S.objs)) g.add(new THREE.Mesh(mesh.geometry)); // as modelled: no explode/anim offsets
  const data = new STLExporter().parse(g, { binary: true });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([data])), download: `${modelName}.stl` });
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- loop ----------
// draw only when something changes: an idle static model costs no GPU/CPU
let last = performance.now(), dirty = true;
const redraw = () => (dirty = true);
['input', 'click', 'keydown', 'resize'].forEach((e) => addEventListener(e, redraw));
renderer.setAnimationLoop((now) => {
  const moving = S.playing && S.speed > 0 && S.animated;
  if (moving) S.t += ((now - last) / 1000) * S.speed;
  last = now;
  const flying = !!fly;
  stepFly(now);
  if (!controls.update() && !moving && !flying && !dirty) return; // update() is true while the camera moves or damps
  dirty = false;
  if (S.scene) {
    placeObjects();
    for (const u of S.updaters) u(S.t);
  }
  renderer.render(world, camera);
  labels.render(world, camera);
});

// ---------- boot ----------
$('play').textContent = '❚❚ Pause';
$('play').classList.add('on');
if (!modelName) listModels().catch(showError);
else try {
  $('controls').hidden = false;
  const [{ evaluate, userScope }, data, userParts] = await Promise.all([
    import('/src/run.js'),
    fetch(`/api/model/${encodeURIComponent(modelName)}`).then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error))))),
    fetch('/api/userparts').then((r) => r.json()),
  ]);
  Object.assign(S, { evaluate, data, extra: userScope(userParts) });
  if (data.glb) await showGlb(data);
  else run();
} catch (e) { showError(e); }

// downloaded model: every mesh becomes an object, so explode pulls them apart from the centre
async function showGlb({ glb, source }) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(glb);
  gltf.scene.rotation.x = Math.PI / 2; // glTF is Y-up, the viewer is Z-up
  gltf.scene.updateMatrixWorld(true);
  const objects = {};
  let i = 0;
  gltf.scene.traverse((m) => {
    if (!m.isMesh) return;
    const material = Array.isArray(m.material) ? m.material[0] : m.material;
    Object.assign(material, { side: THREE.DoubleSide, clipShadows: true });
    objects[`${m.name || 'mesh'}#${i++}`] = { geometry: m.geometry.clone().applyMatrix4(m.matrixWorld), material };
  });
  // shortcut: rescaled so the longest side is 200 mm (Sketchfab units vary), real size is lost
  const box = new THREE.Box3();
  for (const o of Object.values(objects)) box.union((o.geometry.computeBoundingBox(), o.geometry.boundingBox));
  const size = box.getSize(new THREE.Vector3()), k = 200 / Math.max(size.x, size.y, size.z, 1e-9), c = box.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -box.min.z));
  for (const o of Object.values(objects)) o.geometry.applyMatrix4(fit);
  S.scene = { title: source.name, objects, visuals: {}, steps: [] };
  $('title').textContent = source.name;
  document.title = `${source.name} · forge3d`;
  $('params').hidden = true;
  build(S.scene);
  const credit = Object.assign(document.createElement('a'), { className: 'hint', href: source.url, target: '_blank', rel: 'noopener', textContent: `by ${source.author} · ${source.license}` });
  $('title').after(credit); // CC licenses require crediting the author
}
