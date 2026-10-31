// Electrical-looking parts for explainers (transformers, motors).
import { part } from '../core/part.js';
import { CrossSection, Manifold } from '../core/geom.js';
import { helix } from './motion.js';

export const coil = part({
  name: 'coil',
  doc: 'winding of round wire around Z (transformer/motor coil); radius = inner winding radius, wire = wire dia, layers = stacked winding layers',
  params: { radius: 10, wire: 1, turns: 10, pitch: 2.2, layers: 1 },
  build: ({ radius, wire, turns, pitch, layers }) =>
    Manifold.union(Array.from({ length: layers }, (_, i) => helix(radius + wire / 2 + i * wire * 1.1, wire, pitch, turns))),
});

export const transformerCore = part({
  name: 'transformerCore',
  doc: 'laminated rectangular core standing on the bed: frame width x height in XZ, depth along Y, leg = leg thickness',
  params: { width: 60, height: 60, depth: 20, leg: 15, lamination: 1 },
  build: ({ width: w, height: h, depth, leg, lamination }) => {
    const frame = CrossSection.square([w, h], true).subtract(CrossSection.square([w - 2 * leg, h - 2 * leg], true));
    // thin plates over a slightly smaller core: the grooves read as laminations
    const n = Math.max(1, Math.floor(depth / lamination));
    const plate = frame.extrude(depth / n - 0.2);
    const plates = Array.from({ length: n }, (_, i) => plate.translate(0, 0, (i * depth) / n + 0.1));
    return Manifold.union([frame.offset(-0.3).extrude(depth), ...plates])
      .rotate([90, 0, 0]).translate(0, depth / 2, h / 2);
  },
});
