---
name: forge3d
description: Make 3D models with the forge3d MCP tools. Use when the user wants a 3D model, a printable part (STL), an enclosure, bracket, gear or mechanism, or a visual 3D explanation of how something works (machines, physics, circuits, algorithms).
---

# forge3d

You write short JS scripts against a part library; the server builds them, writes an STL and serves a live 3D viewer. Keep scripts short: compose parts, do not hand-build geometry the catalog already has.

## Workflow

1. `catalog` once per session (use `filter` to narrow it, e.g. "gear"). `part_doc` only if a one-line entry is not enough.
2. Write a script: a function body ending in `return <solid>` or `return scene({...})`. Every catalog name is in scope. Units mm, Z up, bed is z=0.
3. `build({ name, script })`. Give the user the viewer URL and the STL path. Mention warnings.
4. Fix errors by reading the message (it gives the script line) and building again.
5. Variants: wrap key dimensions in `param('name', default, min, max)` and rebuild with `overrides` instead of rewriting the script. The viewer shows them as sliders.
6. If you made something reusable, `save_part` it (`return part({ name, doc, params, build: (p) => solid })`) so later scripts call it in one line.

## Ready-made models

When the user wants a real-looking existing object (a bike, an engine, a phone) rather than a printable part or a parametric explainer, try `find_model({ query })` first and pick a result with reasonable size (< ~50 MB) and a CC license. Then `get_model({ uid, name })`, and give the viewer URL plus the author and license (CC Attribution means crediting the author). Downloads are temporary: they are deleted when the session ends. Call `keep_model({ name })` only if the user asks to save or keep it. If there is no token, relay the setup line from the error. If nothing fits, build it with the catalog.

## Explainers

Return `scene({ title, objects, visuals, steps })`:
- objects: `{ id: solid }` or `{ id: { solid, color, anim, explode: [x,y,z], label } }`; anim = `spin(degPerSec, about, axis)`, `slide([dx,dy,dz], sec)`, `swing(deg, about, axis, sec)`, `chain(...)`.
- visuals (viewer-only, not printed): `arrow`, `label`, `flow`, `fieldLoop`, `blockGrid`, `connections`, `text3d`. Positions are `[x,y,z]` or an object id.
- steps: `[{ title, text, show: [visualIds], highlight: [ids], camera: id, explode: 0..1 }]`; `explode` sets the explode slider (1 = every part pulled apart). A visual listed in some step's `show` appears only in those steps.
Tell the story in 3-6 steps, one idea per step.

## Printing rules

- mm; model sits on the bed (z min = 0, use `onBed()`); flat base down.
- Walls >= 0.8 mm (1.2+ for strength); holes for screws +0.2-0.3 mm.
- Print-in-place moving parts: 0.3-0.4 mm clearance all round.
- Avoid overhangs steeper than 45° from vertical; use chamfers instead of flat ceilings.
- Fits in 250 mm unless the user says otherwise.

## Examples

Mechanical (parametric tray with a cable slot):
```js
const w = param('width', 40, 20, 80);
const t = param('wall', 2, 0.8, 4);
const base = roundedBox([w, 30, 12], 2);
const pocket = roundedBox([w - 2 * t, 30 - 2 * t, 12], 1.5).translate([0, 0, t]);
const slot = box([10, 40, 6]).translate([0, 0, 8]);
return subtract(base, pocket, slot);
```

Explainer (belt drive):
```js
const r = 10;
return scene({
  title: 'How a belt drive works',
  objects: {
    motor: { solid: cylinder(r, 6), anim: spin(90), label: 'Driver' },
    wheel: { solid: cylinder(2 * r, 6).translate([50, 0, 0]), anim: spin(45, [50, 0, 0]), label: 'Driven' },
  },
  visuals: {
    belt: flow({ path: [[0, r, 3], [50, 2 * r, 3], [50, -2 * r, 3], [0, -r, 3]], closed: true }),
    ratio: label({ text: '2x bigger = half speed, 2x torque', at: 'wheel' }),
  },
  steps: [
    { title: 'The motor turns the small pulley', highlight: ['motor'] },
    { title: 'The belt carries the motion', show: ['belt'] },
    { title: 'Bigger pulley: slower, stronger', show: ['belt', 'ratio'], highlight: ['wheel'], camera: 'wheel' },
  ],
});
```
