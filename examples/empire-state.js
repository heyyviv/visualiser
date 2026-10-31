// Empire State Building, printable massing model. Real dimensions in metres, scaled to mm.
const scale = param('scale', 2000, 1000, 5000, 100); // 1:scale
const piers = param('piers', 1, 0, 1, 1); // vertical window grooves on the shaft
const s = 1000 / scale; // metres -> mm

// [width, depth, top height] in metres, bottom to top (setbacks at floors 5, 21, 25, 30, 72, 81, 85)
const tiers = [
  [129, 57, 25], [110, 52, 85], [96, 48, 100], [84, 46, 120],
  [60, 40, 270], [54, 36, 300], [48, 32, 320], [30, 28, 335],
];
let z = 0;
const blocks = tiers.map(([w, d, top]) => {
  const b = box([w * s, d * s, (top - z) * s]).translate([0, 0, z * s]);
  z = top;
  return b;
});

// mooring mast: stepped drum, tapering spire, antenna
const mast = union(
  cylinder(11 * s, 15 * s, 9 * s).translate([0, 0, 335 * s]),
  cylinder(8 * s, 18 * s, 6 * s).translate([0, 0, 350 * s]),
  cone(5 * s, 1.5 * s, 13 * s).translate([0, 0, 368 * s]),
  cylinder(Math.max(1.2 * s, 0.6), 62 * s, Math.max(0.5 * s, 0.4)).translate([0, 0, 381 * s]),
);

let building = union(...blocks, mast);

if (piers) {
  // shallow vertical grooves between the piers on the main shaft (the window bands)
  const depth = Math.max(0.8 * s, 0.3), h = (270 - 125) * s, z0 = 125 * s;
  const slotsX = array(box([1.6 * s, depth * 2, h]).translate([-24 * s, 20 * s, z0]), 13, [4 * s, 0, 0]);
  const slotsY = array(box([depth * 2, 1.6 * s, h]).translate([30 * s, -16 * s, z0]), 9, [0, 4 * s, 0]);
  building = subtract(building, slotsX, mirror(slotsX, [0, 1, 0], false), slotsY, mirror(slotsY, [1, 0, 0], false));
}

return scene({
  title: `Empire State Building 1:${scale}`,
  objects: { building: { solid: building, color: '#c9c1b0', label: 'Empire State Building' } },
  visuals: {
    deck86: label({ text: '86th floor observatory', at: [0, 0, 320 * s], offset: [30 * s, 0, 0] }),
    mast: label({ text: 'Mooring mast', at: [0, 0, 360 * s], offset: [20 * s, 0, 0] }),
  },
});
