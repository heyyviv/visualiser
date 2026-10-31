// Planetary gearbox: sun (input) drives 3 planets that roll inside a fixed ring; the carrier is the output.
const S = param('sun teeth', 12, 6, 40);
const P = param('planet teeth', 18, 6, 40);
const R = S + 2 * P; // ring teeth: the planets must span sun-to-ring exactly
const m = 2, T = 6;
const orbit = (m * (S + P)) / 2;

// planets can only sit where sun and ring teeth both line up: multiples of 360/(S+R)
const slots = S + R;
const angles = [0, 1, 2].map((i) => (Math.round((i * slots) / 3) * 360) / slots);
const ringTurn = (meshAngle(S, P, 0) * P) / R; // phase the ring to planet 0

// kinematics with the ring held still: carrier w, sun w*(1+R/S), planets spin -w*R/P relative to the carrier
const w = 12;
const sunRate = w * (1 + R / S);
const planetRate = (-w * R) / P;

const sun = union(gear({ teeth: S, module: m, thickness: T, bore: 0 }), axle({ d: 5, length: T + 12 }));
const objects = {
  ring: { solid: ringGear({ teeth: R, module: m, thickness: T, rim: 6 }).rotate([0, 0, ringTurn]), color: '#9aa5b1', explode: [0, 0, -15], label: 'Ring (fixed)' },
  sun: { solid: sun, color: '#e8c547', anim: spin(sunRate), label: 'Sun (input)' },
};
angles.forEach((a, i) => {
  const c = [orbit * Math.cos((a * Math.PI) / 180), orbit * Math.sin((a * Math.PI) / 180), 0];
  objects[`planet${i + 1}`] = {
    solid: gear({ teeth: P, module: m, thickness: T, bore: 5 }).rotate([0, 0, meshAngle(S, P, a)]).translate(c),
    color: '#4f8ef7',
    anim: chain(spin(planetRate, c), spin(w)),
    explode: [0, 0, 12],
    label: `Planet ${i + 1}`,
  };
});
const pins = angles.map((a) => cylinder(2.2, T + 1).translate([orbit * Math.cos((a * Math.PI) / 180), orbit * Math.sin((a * Math.PI) / 180), 0]));
const plate = subtract(cylinder(orbit + 6, 3).translate([0, 0, T + 1]), cylinder(3.5, 10).translate([0, 0, T]));
objects.carrier = { solid: union(plate, ...pins), color: '#5cc98a', anim: spin(w), explode: [0, 0, 28], label: 'Carrier (output)' };

const ratio = (1 + R / S).toFixed(2);
return scene({
  title: 'Planetary gearbox',
  objects,
  visuals: {
    inArrow: arrow({ from: [0, 0, T + 30], to: [0, 0, T + 14], text: 'input' }),
    outNote: label({ text: `output turns 1/${ratio} as fast`, at: 'carrier', offset: [0, 0, 12] }),
  },
  steps: [
    { title: 'A gearbox inside a gear', text: `A sun gear (${S} teeth) sits in the middle, three planets (${P} teeth) around it, all inside a ring with ${R} = ${S} + 2x${P} teeth.` },
    { title: 'The sun is the input', text: 'The motor turns the sun. Its teeth push every planet at once, so the load is shared three ways.', highlight: ['sun'], show: ['inArrow'] },
    { title: 'The ring holds still', text: 'The ring is bolted to the housing. Planets pushed by the sun have to roll around its inside, like wheels on a circular track.', highlight: ['ring', 'planet1', 'planet2', 'planet3'] },
    { title: 'Planets spin and orbit', text: 'Each planet spins backwards on its own pin while the whole group walks forwards around the sun.', highlight: ['planet1', 'planet2', 'planet3'] },
    { title: 'The carrier is the output', text: `The carrier holds the planet pins, so it turns at the planets' walking speed: the sun turns ${ratio} times for one carrier turn (1 + ${R}/${S}). Slow, strong and coaxial.`, highlight: ['carrier'], show: ['outNote'] },
  ],
});
