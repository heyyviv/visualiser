// Print-in-place box: body and lid are separate bodies joined by a captured-pin hinge on the back edge.
const X = param('width', 50, 30, 120), Y = param('depth', 36, 20, 100), H = param('height', 24, 15, 80);
const c = 0.4, lidT = 2, t = 2, w = 20; // c = print clearance, w = hinge leaf width
const rk = Math.max(t / 2 + 0.01, 1.5 + c + 1.2); // knuckle radius used by hinge() for pin=3

// hinge() at 90 degrees, flipped so leaf A lies on the lid and leaf B hangs down the back
const hinged = hinge({ length: X - 8, width: w, thickness: t, pin: 3, clearance: c, angle: 90 }).rotate([0, 180, 0]);
const top = H + c + lidT - 0.5 + t; // top of the lid leaf, sunk 0.5 mm into the lid
const Y0 = Y / 2 + c + rk; // axis sits just behind the back wall
const [leafB, leafA] = hinged.translate([0, Y0, top]).decompose().sort((a, b) => a.boundingBox().min[2] - b.boundingBox().min[2]);
const axis = [0, Y0, top - rk];

// block joining the back wall to leaf B, stopping c below the lid knuckles
const fillerTop = top - 2 * rk - c, fillerBottom = leafB.boundingBox().min[2];
const filler = box([X - 8, Y0 + rk - t - Y / 2 + 1, fillerTop - fillerBottom]).translate([0, (Y / 2 - 0.5 + Y0 + rk - t + 0.5) / 2, fillerBottom]);
const body = union(enclosure({ size: [X, Y, H], wall: 2, radius: 3, lip: 0 }), filler, leafB);
const lidPlate = CrossSection.square([X - 6, Y - 6], true).offset(3, 'Round').extrude(lidT).translate([0, 0, H + c]);
const lid = union(lidPlate, leafA);

return scene({
  title: 'Hinged box (print in place)',
  objects: {
    body: { solid: body, color: '#4f8ef7', label: 'Box' },
    lid: { solid: lid, color: '#f7a24f', anim: swing(-110, axis, 'x', 4), explode: [0, 0, 15], label: 'Lid' },
  },
  visuals: { pin: label({ text: 'captured pin: printed inside its hole', at: axis, offset: [0, 8, 6] }) },
  steps: [
    { title: 'One print, two parts', text: `The box and lid print together. Every moving surface keeps a ${c} mm gap so nothing fuses.` },
    { title: 'Knuckles alternate', text: 'Lid knuckles carry a solid pin; box knuckles wrap around it with clearance, so the pin is trapped but free to turn.', highlight: ['lid'], show: ['pin'] },
    { title: 'Open and close', text: 'The lid swings about the pin axis along the back edge.', highlight: ['lid'] },
  ],
});
