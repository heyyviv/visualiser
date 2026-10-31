// Signed distance functions for organic shapes. Convention: negative inside, in mm.
// mesh() turns one into a printable Manifold so it combines with the mechanical parts.
import { Manifold } from './geom.js';

const len = (x, y, z = 0) => Math.hypot(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---- shapes: each returns (p) => distance ----
export const sSphere = (r) => ([x, y, z]) => len(x, y, z) - r;
export const sBox = ([bx, by, bz], r = 0) => ([x, y, z]) => {
  const qx = Math.abs(x) - bx / 2 + r, qy = Math.abs(y) - by / 2 + r, qz = Math.abs(z) - bz / 2 + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
export const sCylinder = (r, h) => ([x, y, z]) => {
  const dx = len(x, y) - r, dz = Math.abs(z - h / 2) - h / 2;
  return Math.min(Math.max(dx, dz), 0) + len(Math.max(dx, 0), Math.max(dz, 0));
};
export const sTorus = (R, r) => ([x, y, z]) => len(len(x, y) - R, z) - r;
// infinite gyroid lattice; intersect it with a shape. cell = period in mm, t = wall thickness
export const sGyroid = (cell = 10, t = 1) => ([x, y, z]) => {
  const k = (2 * Math.PI) / cell;
  const g = Math.sin(k * x) * Math.cos(k * y) + Math.sin(k * y) * Math.cos(k * z) + Math.sin(k * z) * Math.cos(k * x);
  return (Math.abs(g) / k) - t / 2;
};

// ---- combinators ----
export const sUnion = (...fs) => (p) => Math.min(...fs.map((f) => f(p)));
export const sIntersect = (...fs) => (p) => Math.max(...fs.map((f) => f(p)));
export const sSubtract = (a, ...bs) => (p) => Math.max(a(p), ...bs.map((b) => -b(p)));
// smooth blends: k = blend radius in mm
export const sSmoothUnion = (k, ...fs) => fs.reduce((a, b) => (p) => {
  const d1 = a(p), d2 = b(p), h = clamp(0.5 + (0.5 * (d2 - d1)) / k, 0, 1);
  return d2 * (1 - h) + d1 * h - k * h * (1 - h);
});
export const sSmoothSubtract = (k, a, b) => (p) => {
  const d1 = a(p), d2 = -b(p), h = clamp(0.5 - (0.5 * (d2 - d1)) / k, 0, 1);
  return d1 * (1 - h) + d2 * h + k * h * (1 - h);
};
export const sShell = (f, t) => (p) => Math.abs(f(p)) - t / 2;
export const sRound = (f, r) => (p) => f(p) - r;
export const sMove = (f, [dx, dy, dz]) => ([x, y, z]) => f([x - dx, y - dy, z - dz]);
export const sScale = (f, s) => ([x, y, z]) => f([x / s, y / s, z / s]) * s;
export const sTwist = (f, degPerMm) => ([x, y, z]) => {
  const a = (-degPerMm * z * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return f([c * x - s * y, s * x + c * y, z]);
};
// any warp of space; not a true distance afterwards, keep it gentle
export const sWarp = (f, fn) => (p) => f(fn([...p]));

// SDF -> Manifold. bounds: {min:[x,y,z], max:[x,y,z]}; res = triangle edge in mm (smaller = finer, slower)
export const mesh = (f, bounds, res = 1) => Manifold.levelSet((p) => -f(p), bounds, res, 0);
