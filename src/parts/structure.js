// Structural parts: brackets, boxes, snap fits.
import { part } from '../core/part.js';
import { CrossSection, Manifold } from '../core/geom.js';

const roundRect = (x, y, r) => CrossSection.square([x - 2 * r, y - 2 * r], true).offset(r, 'Round');

export const bracket = part({
  name: 'bracket',
  doc: 'L bracket: base plate on the bed along X, upright plate at -X; hole = mounting hole dia (one per plate)',
  params: { length: 40, width: 20, height: 30, thickness: 3, hole: 4 },
  build: ({ length: L, width: w, height: h, thickness: t, hole }) => {
    const l = new CrossSection([[[-L / 2, 0], [L / 2, 0], [L / 2, t], [-L / 2 + t, t], [-L / 2 + t, h], [-L / 2, h]]]);
    const body = l.extrude(w).rotate([90, 0, 0]).translate(0, w / 2, 0);
    const drill = Manifold.cylinder(L + h, hole / 2, hole / 2, 0, true);
    return body.subtract(drill.translate(t / 2, 0, 0)).subtract(drill.rotate([0, 90, 0]).translate(0, 0, (h + t) / 2));
  },
});

export const enclosure = part({
  name: 'enclosure',
  doc: 'open-top box with rounded vertical edges; size = outside [x,y,z], wall = wall thickness, lip = depth of the lid rebate at the rim',
  params: { size: [60, 40, 30], wall: 2, radius: 3, lip: 2 },
  build: ({ size: [x, y, z], wall, radius, lip }) => {
    const inner = (d) => roundRect(x - 2 * d, y - 2 * d, Math.max(radius - d, 0.5));
    return roundRect(x, y, radius).extrude(z)
      .subtract(inner(wall).extrude(z).translate(0, 0, wall))
      .subtract(inner(wall / 2).extrude(lip + 1).translate(0, 0, z - lip));
  },
});

export const snapHook = part({
  name: 'snapHook',
  doc: 'cantilever snap-fit hook lying flat (flexes in XY); length = beam length, hookDepth = catch overhang',
  params: { length: 12, width: 6, thickness: 1.6, hookDepth: 1 },
  build: ({ length: L, width, thickness: t, hookDepth: d }) => {
    const ramp = Math.max(2, 3 * d), b = 3;
    const pts = [[-b, -2], [0, -2], [0, 0], [L, 0], [L, t], [L - ramp, t + d], [L - ramp, t], [0, t], [0, t + 2], [-b, t + 2]];
    return new CrossSection([pts]).translate([-(L - b) / 2, -t / 2]).extrude(width);
  },
});
