// Involute gears. Gears are centred on the origin, z from 0 to thickness, with a tooth pointing along +X.
import { part } from '../core/part.js';
import { CrossSection } from '../core/geom.js';

const inv = (a) => Math.tan(a) - a;
const rad = Math.PI / 180;

// 2D involute spur profile. addendum/dedendum are in modules (an internal gear's cutter swaps them).
// clearance (mm) thins every tooth at the pitch circle for backlash.
export function gearProfile({ teeth: z = 20, module: m = 2, pressureAngle = 20, clearance = 0, addendum = 1, dedendum = 1.25, bore = 0 } = {}) {
  const pa = pressureAngle * rad;
  const r = (m * z) / 2, rb = r * Math.cos(pa), ra = r + addendum * m, rf = Math.max(r - dedendum * m, 0.1);
  const psi = (rr) => Math.max(Math.PI / (2 * z) + inv(pa) - inv(Math.acos(Math.min(1, rb / rr))) - clearance / (2 * r), 0.002);
  const r0 = Math.max(rb, rf), N = 8;
  const flank = Array.from({ length: N + 1 }, (_, i) => r0 + ((ra - r0) * i) / N);
  const pt = (rr, a) => [rr * Math.cos(a), rr * Math.sin(a)];
  const pts = [];
  for (let k = 0; k < z; k++) {
    const c = (2 * Math.PI * k) / z;
    if (rb > rf) pts.push(pt(rf, c - psi(rb)));
    for (const rr of flank) pts.push(pt(rr, c - psi(rr)));
    for (const rr of flank.slice().reverse()) pts.push(pt(rr, c + psi(rr)));
    if (rb > rf) pts.push(pt(rf, c + psi(rb)));
  }
  const cs = new CrossSection([pts]);
  return bore > 0 ? cs.subtract(CrossSection.circle(bore / 2)) : cs;
}

export const gear = part({
  name: 'gear',
  doc: 'involute spur/helical gear; module = tooth size (pitch dia = module*teeth), twist = helix degrees over thickness, clearance = backlash mm',
  params: { teeth: 20, module: 2, thickness: 6, bore: 5, pressureAngle: 20, twist: 0, clearance: 0.1 },
  build: (p) => gearProfile(p).extrude(p.thickness, p.twist ? Math.ceil(Math.abs(p.twist) / 3) : 0, p.twist),
});

export const ringGear = part({
  name: 'ringGear',
  doc: 'internal gear for planetary sets; rim = wall outside the tooth roots, clearance = extra gap around mating teeth',
  params: { teeth: 48, module: 2, thickness: 6, rim: 5, pressureAngle: 20, clearance: 0.15 },
  build: (p) => {
    const cutter = gearProfile({ ...p, clearance: 0, addendum: 1.25, dedendum: 1 }).offset(p.clearance, 'Round');
    const outer = CrossSection.circle((p.module * p.teeth) / 2 + 1.25 * p.module + p.rim);
    return outer.subtract(cutter).extrude(p.thickness);
  },
});

export const rack = part({
  name: 'rack',
  doc: 'straight gear meshing with gear() of the same module; pitch line at y=0, teeth point +Y, height = solid body below the roots',
  params: { teeth: 10, module: 2, thickness: 6, height: 8, pressureAngle: 20, clearance: 0.1 },
  build: ({ teeth: n, module: m, thickness, height, pressureAngle, clearance }) => {
    const p = Math.PI * m, t = Math.tan(pressureAngle * rad), hw = p / 4 - clearance / 2;
    const yr = -1.25 * m, ya = m, x0 = (-n * p) / 2, bottom = yr - height;
    const pts = [[x0, bottom], [-x0, bottom], [-x0, yr]];
    for (let i = n - 1; i >= 0; i--) {
      const c = x0 + (i + 0.5) * p;
      pts.push([c + hw - yr * t, yr], [c + hw - ya * t, ya], [c - hw + ya * t, ya], [c - hw + yr * t, yr]);
    }
    pts.push([x0, yr]);
    return new CrossSection([pts]).extrude(thickness);
  },
});

// Rotation (degrees) for gear B whose centre sits at angle `at` (degrees) around gear A, at distance
// module*(teethA+teethB)/2, so its teeth fall into A's gaps. Gear A is unrotated (tooth on +X).
export const meshAngle = (teethA, teethB, at = 0) => at + 180 + 180 / teethB + (at * teethA) / teethB;
