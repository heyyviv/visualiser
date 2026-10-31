// L0 primitives + L1 operations on top of Manifold. All units are millimetres;
// solids sit on z=0 and are centred in XY so they print without repositioning.
import Module from 'manifold-3d';

const wasm = await Module();
wasm.setup();
wasm.setMinCircularEdgeLength(0.5);
export const { Manifold, CrossSection } = wasm;
export { wasm };

const v3 = (s) => (Array.isArray(s) ? s : [s, s, s]);

// ---- L0 primitives ----
export const box = (size, { center = false } = {}) => {
  const [x, y, z] = v3(size);
  const m = Manifold.cube([x, y, z], true);
  return center ? m : m.translate(0, 0, z / 2);
};
export const roundedBox = (size, r = 1) => {
  const [x, y, z] = v3(size).map((d) => d / 2 - r);
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push(Manifold.sphere(r).translate(sx * x, sy * y, sz * z));
  return Manifold.hull(corners).translate(0, 0, z + r);
};
export const cylinder = (r, h, r2 = r) => Manifold.cylinder(h, r, r2);
export const cone = (r1, r2, h) => Manifold.cylinder(h, r1, r2);
export const sphere = (r) => Manifold.sphere(r);
export const torus = (R, r) => CrossSection.circle(r).translate([R, 0]).revolve();
// pts: [[x,y], ...] polygon in XY
export const extrude = (pts, h, { twist = 0, scale = 1, divisions = 0 } = {}) =>
  new CrossSection([pts]).extrude(h, divisions || (twist ? Math.ceil(Math.abs(twist) / 5) : 0), twist, Array.isArray(scale) ? scale : [scale, scale]);
// pts: [[r,z], ...] profile in the XZ half-plane (r >= 0), spun around Z
export const revolve = (pts, degrees = 360) => new CrossSection([pts]).revolve(0, degrees);
// tube of radius r along a polyline [[x,y,z], ...]: pipes, wires, coils
export const tube = (path, r) => {
  const balls = path.map((p) => Manifold.sphere(r, 12).translate(p));
  return Manifold.union(balls.slice(1).map((b, i) => Manifold.hull([balls[i], b])));
};
export const polygon = (pts) => new CrossSection([pts]);
export const circle = (r) => CrossSection.circle(r);

// ---- L1 operations ----
export const union = (...ms) => Manifold.union(ms.flat());
export const subtract = (a, ...bs) => (bs.length ? Manifold.difference([a, ...bs.flat()]) : a);
export const intersect = (...ms) => Manifold.intersection(ms.flat());
export const hull = (...ms) => Manifold.hull(ms.flat());
export const mirror = (m, normal = [1, 0, 0], keep = true) => (keep ? union(m, m.mirror(normal)) : m.mirror(normal));
// n copies, each offset by step [x,y,z]
export const array = (m, n, step) => union(Array.from({ length: n }, (_, i) => m.translate(step.map((s) => s * i))));
// n copies rotated around Z
export const polar = (m, n, degrees = 360) => union(Array.from({ length: n }, (_, i) => m.rotate([0, 0, (degrees / n) * i])));
// twist around Z by `degrees` over the part's height
export const twist = (m, degrees) => {
  const { min, max } = m.boundingBox();
  const h = max[2] - min[2] || 1;
  return m.refineToLength(Math.max(h / 40, 0.5)).warp((v) => {
    const a = (((v[2] - min[2]) / h) * degrees * Math.PI) / 180;
    const [x, y] = v;
    v[0] = x * Math.cos(a) - y * Math.sin(a);
    v[1] = x * Math.sin(a) + y * Math.cos(a);
  });
};
// bend along X into an arc of `degrees` around the Y axis
export const bend = (m, degrees) => {
  const { min, max } = m.boundingBox();
  const len = max[0] - min[0] || 1;
  const R = len / ((degrees * Math.PI) / 180);
  return m.refineToLength(Math.max(len / 60, 0.5)).warp((v) => {
    const a = (v[0] - min[0]) / R;
    const r = R - v[2];
    v[0] = min[0] + r * Math.sin(a);
    v[2] = R - r * Math.cos(a);
  });
};
// put a solid back on the bed: lowest point at z=0
export const onBed = (m) => m.translate(0, 0, -m.boundingBox().min[2]);
