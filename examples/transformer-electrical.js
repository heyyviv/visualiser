// Step-up transformer explainer: AC in the primary -> changing flux in the core -> induced voltage in the secondary.
// Core frame stands in the XZ plane; primary on the left leg, secondary on the right.
const Np = param('primary turns', 4, 2, 10, 1);
const Ns = param('secondary turns', 10, 2, 20, 1);
const Vp = 230;
const Vs = Math.round((Vp * Ns) / Np);

const ironCore = transformerCore({ width: 80, height: 100, depth: 20, leg: 20 });

// coil = helix around a leg at x=cx plus leads out to a device at x=dx; a0 = angle where the ends face outward
const R = 16, z0 = 25, z1 = 75;
const windingPts = (cx, a0, n, seg) => Array.from({ length: n * seg + 1 }, (_, i) => {
  const a = a0 + (2 * Math.PI * i) / seg;
  return [cx + R * Math.cos(a), R * Math.sin(a), z0 + ((z1 - z0) * i) / (n * seg)];
});
const wirePath = (cx, a0, n, dx, seg) => [[dx, 0, 40], [dx, 0, z0], ...windingPts(cx, a0, n, seg), [dx, 0, z1], [dx, 0, 60]];
const wireR = (n) => Math.min(1.4, (50 / n) * 0.3);

const primaryWire = tube(wirePath(-30, Math.PI, Np, -75, 16), wireR(Np));
const secondaryWire = tube(wirePath(30, 0, Ns, 75, 16), wireR(Ns));
const acSource = union(cylinder(8, 20).translate([-75, 0, 40]), cylinder(3, 3).translate([-75, 0, 60]));
const lampSolid = union(sphere(9).translate([75, 0, 50]), cylinder(5, 8).translate([75, 0, 38]));

return scene({
  title: 'Step-up transformer',
  objects: {
    core: { solid: ironCore, color: '#7d8796', label: 'Iron core' },
    primary: { solid: primaryWire, color: '#d9822b', label: `Primary · ${Np} turns`, explode: [0, -50, 0] },
    secondary: { solid: secondaryWire, color: '#c9a227', label: `Secondary · ${Ns} turns`, explode: [0, -50, 0] },
    source: { solid: acSource, color: '#4f8ef7', label: `AC source ${Vp} V`, explode: [-30, 0, 0] },
    lamp: { solid: lampSolid, color: '#ffe680', label: `Load ${Vs} V`, explode: [30, 0, 0] },
  },
  visuals: {
    currentP: flow({ path: wirePath(-30, Math.PI, Np, -75, 8), closed: true, color: '#00e5ff', speed: 60, count: 6 * Np + 6, radius: 2 }),
    currentS: flow({ path: wirePath(30, 0, Ns, 75, 8), closed: true, color: '#7dff8a', speed: 60, count: 4 * Ns + 6, radius: 1.8 }),
    field: arrow({ from: [-30, -24, 30], to: [-30, -24, 72], color: '#ff4fd8', text: 'B changes' }),
    flux: fieldLoop({ path: [[-30, -12, 20], [-30, -12, 80], [-25, -12, 89], [0, -12, 90], [25, -12, 89], [30, -12, 80], [30, -12, 20], [25, -12, 11], [0, -12, 10], [-25, -12, 11]], color: '#ff4fd8', speed: 40, count: 24, radius: 1.6 }),
    emf: arrow({ from: [52, -24, 30], to: [52, -24, 70], color: '#7dff8a', text: `EMF ${Vs} V` }),
    ratio: text3d({ text: `Vs / Vp = Ns / Np  →  ${Vp} V × ${Ns}/${Np} = ${Vs} V`, at: [0, 0, 125], size: 1.3 }),
    dc: label({ text: 'DC: constant flux → no change → no induced voltage', at: [0, -12, 100], offset: [0, 0, 0] }),
  },
  steps: [
    { title: '1. AC goes in', text: `The source drives an alternating current (${Vp} V) through the ${Np}-turn primary coil. The current keeps reversing direction, many times a second.`, show: ['currentP'], highlight: ['source', 'primary', 'currentP'], camera: 'primary' },
    { title: '2. A changing magnetic field', text: 'Current in a coil makes a magnetic field along the coil axis. Because the current alternates, the field keeps growing, shrinking and flipping.', show: ['currentP', 'field'], highlight: ['primary', 'field', 'currentP'], camera: 'primary' },
    { title: '3. Flux runs round the core', text: 'The iron core gives the field an easy path: almost all the magnetic flux circulates through the closed loop of iron, passing through both coils.', show: ['currentP', 'flux'], highlight: ['core', 'flux'], camera: 'core' },
    { title: '4. Voltage is induced in the secondary', text: 'A changing flux through a coil induces a voltage in every turn (Faraday\'s law). The secondary drives current through the load.', show: ['flux', 'currentS', 'emf'], highlight: ['secondary', 'lamp', 'flux', 'currentS', 'emf'], camera: 'secondary' },
    { title: '5. Turns ratio sets the voltage', text: `Each turn gets the same volts. ${Ns} secondary turns vs ${Np} primary turns steps ${Vp} V up to ${Vs} V; the current steps down by the same ratio so power is (ideally) conserved. Try the turns sliders.`, show: ['currentP', 'flux', 'currentS', 'ratio'], camera: { position: [120, -260, 170], target: [0, 0, 60] } },
    { title: '6. Why AC, not DC', text: 'Induction needs a CHANGING flux. Steady DC makes a constant field: after switch-on nothing changes, so the secondary gets no voltage and the primary just acts as a short circuit.', show: ['dc'], highlight: ['core', 'dc'], camera: { position: [0, -240, 110], target: [0, 0, 55] } },
  ],
});
