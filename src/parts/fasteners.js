// Threaded fasteners. Threads are a twisted extrude of a one-lobe cam: at height z the lobe angle is
// 360*z/pitch, which sweeps a triangular single-start helix (right-handed).
import { part } from '../core/part.js';
import { CrossSection, Manifold } from '../core/geom.js';

const hex = (acrossFlats) => CrossSection.circle(acrossFlats / Math.sqrt(3), 6);

// grow = radial allowance (mm) added everywhere, for the cutter of an internal thread
export function thread(d, pitch, length, grow = 0) {
  const rMaj = d / 2 + grow, rMin = d / 2 - 0.6134 * pitch + grow, N = 48;
  const tri = (u) => 1 - Math.abs(2 * u - 1);
  const pts = Array.from({ length: N }, (_, i) => {
    const a = (2 * Math.PI * i) / N, r = rMin + (rMaj - rMin) * tri(i / N);
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const twist = (360 * length) / pitch;
  return new CrossSection([pts]).extrude(length, Math.ceil(twist / 10), twist);
}

export const bolt = part({
  name: 'bolt',
  doc: 'hex bolt with a real helical thread, head on the bed; d = nominal dia, head = across flats, length = shaft below head',
  params: { d: 8, length: 20, pitch: 1.25, head: 13, headHeight: 5.5 },
  build: ({ d, length, pitch, head, headHeight }) => {
    // chamfer the tip so the thread starts cleanly
    const tip = Manifold.cylinder(length, d / 2 + length, d / 2 - pitch * 0.6);
    const shaft = thread(d, pitch, length).intersect(tip).translate(0, 0, headHeight);
    return hex(head).extrude(headHeight).add(shaft);
  },
});

export const nut = part({
  name: 'nut',
  doc: 'hex nut with internal thread; width = across flats, clearance = radial thread allowance (mm)',
  params: { d: 8, pitch: 1.25, width: 13, height: 6.5, clearance: 0.2 },
  build: ({ d, pitch, width, height, clearance }) =>
    hex(width).extrude(height).subtract(thread(d, pitch, height + 2, clearance).translate(0, 0, -1)),
});

export const washer = part({
  name: 'washer',
  doc: 'flat washer; d = bolt dia (hole gets +0.4 mm), outer = outside dia',
  params: { d: 8, outer: 16, thickness: 1.6 },
  build: ({ d, outer, thickness }) => CrossSection.circle(outer / 2).subtract(CrossSection.circle(d / 2 + 0.2)).extrude(thickness),
});
