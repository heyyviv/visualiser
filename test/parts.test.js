import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as parts from '../src/parts/index.js';
import { gear, bolt, bearing, meshAngle } from '../src/parts/index.js';
import { report } from '../src/export.js';
import { evaluate } from '../src/run.js';

const all = Object.entries(parts).filter(([, f]) => f.partName);

test('every part builds with defaults into a valid non-empty solid', () => {
  assert.ok(all.length >= 18);
  for (const [name, f] of all) {
    const m = f();
    assert.ok(!m.isEmpty(), name);
    assert.ok(m.volume() > 0, `${name} volume ${m.volume()}`);
    const w = report(m).warnings;
    assert.ok(!w.some((x) => /manifold status|not on the bed/.test(x)), `${name}: ${w}`);
    assert.ok(f.doc && f.doc.length > 10, `${name} has a doc`);
  }
});

test('gear outer diameter is module*(teeth+2)', () => {
  for (const [z, m] of [[20, 2], [13, 1.5], [60, 1]]) {
    const { vertProperties: v, numProp } = gear({ teeth: z, module: m }).getMesh();
    let r = 0;
    for (let i = 0; i < v.length; i += numProp) r = Math.max(r, Math.hypot(v[i], v[i + 1]));
    const want = m * (z + 2);
    assert.ok(Math.abs(2 * r - want) / want < 0.01, `z=${z}: ${2 * r} vs ${want}`);
  }
});

test('bolt height is head + length', () => {
  const { min, max } = bolt({ length: 30, headHeight: 5 }).boundingBox();
  assert.ok(Math.abs(max[2] - min[2] - 35) < 0.01 && Math.abs(min[2]) < 1e-6);
});

test('bearing is print-in-place: rings and balls are separate bodies', () => {
  assert.ok(bearing().decompose().length >= 3);
});

test('gears placed with meshAngle interlock without overlapping', () => {
  for (const [za, zb, at] of [[20, 20, 0], [17, 11, 0], [24, 13, 40], [18, 30, 120]]) {
    const a = gear({ teeth: za }), d = (2 * (za + zb)) / 2, rad = (at * Math.PI) / 180;
    const b = gear({ teeth: zb }).rotate([0, 0, meshAngle(za, zb, at)]).translate(d * Math.cos(rad), d * Math.sin(rad), 0);
    const overlap = a.intersect(b).volume();
    assert.ok(overlap < 0.01 * a.volume(), `${za}/${zb}@${at}: overlap ${overlap}`);
    // and a half-tooth phase error must collide, so the test can fail
    const bad = gear({ teeth: zb }).rotate([0, 0, meshAngle(za, zb, at) + 180 / zb]).translate(d * Math.cos(rad), d * Math.sin(rad), 0);
    assert.ok(a.intersect(bad).volume() > 0.005 * a.volume());
  }
});

test('parts are in script scope', () => {
  const { result } = evaluate('return union(gear({ teeth: 12 }), washer().translate([0, 0, 6]))');
  assert.ok(result.objects.model.solid.volume() > 0);
});
