import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate as ev } from '../src/run.js';
const evaluate = (s) => ev(s).result.objects.model.solid;
import { toSTL, report } from '../src/export.js';

test('cube minus sphere is a closed solid on the bed', () => {
  const m = evaluate('return subtract(box(20), sphere(12).translate([0, 0, 10]))');
  const r = report(m);
  assert.deepEqual(r.size_mm, [20, 20, 20]);
  assert.ok(r.volume_cm3 > 0 && r.volume_cm3 < 8);
  assert.deepEqual(r.warnings, []);
});

test('STL has 50 bytes per triangle', () => {
  const m = evaluate('return cylinder(5, 10)');
  assert.equal(toSTL(m).length, 84 + m.numTri() * 50);
});

test('SDF gyroid sphere meshes into a printable solid', () => {
  const m = evaluate(`
    const f = sIntersect(sSphere(15), sGyroid(8, 1.2));
    return onBed(mesh(f, { min: [-16, -16, -16], max: [16, 16, 16] }, 0.8));
  `);
  const r = report(m);
  assert.ok(r.volume_cm3 > 0.5, `volume ${r.volume_cm3}`);
  assert.ok(r.genus > 5, 'a lattice has many holes');
});

test('extrude keeps full volume (number scale is uniform, not Y-only)', () => {
  assert.equal(Math.round(evaluate('return extrude([[0,0],[10,0],[10,10],[0,10]], 2)').volume()), 200);
});

test('twist, polar, tube and torus build', () => {
  for (const s of [
    'return twist(box([10, 10, 30]), 90)',
    'return polar(box([2, 10, 4]).translate([0, 8, 0]), 6)',
    'return tube([[0,0,0],[10,0,5],[10,10,10]], 1.5)',
    'return onBed(torus(10, 2))',
  ]) assert.ok(report(evaluate(s)).volume_cm3 > 0, s);
});

test('script that returns nothing explains itself', () => {
  assert.throws(() => evaluate('box(1)'), /end it with `return/);
});

test('scenes, params and visuals', () => {
  const { result, params } = ev(`
    const r = param('r', 5, 1, 20);
    return scene({ title: 't',
      objects: { a: cylinder(r, 10), b: { solid: box(4), anim: spin(30) } },
      visuals: { f: flow({ path: [[0,0,0],[0,0,10]] }) },
      steps: [{ title: 's1', show: ['f'], highlight: ['a'] }] })`, { overrides: { r: 7 } });
  assert.deepEqual(params.map((p) => [p.name, p.value]), [['r', 7]]);
  assert.equal(result.objects.b.anim(1)[0].rotate[2], 30);
  assert.equal(result.visuals.f.type, 'flow');
  assert.throws(() => ev(`return scene({ objects: { a: box(1) }, steps: [{ title: 'x', show: ['nope'] }] })`), /unknown id/);
});
