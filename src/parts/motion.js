// Moving things: bearings, hinges, springs, wheels, shafts. Print-in-place parts return one Manifold
// made of separate bodies (Manifold.compose) with `clearance` gaps between them.
import { part } from '../core/part.js';
import { CrossSection, Manifold, revolve } from '../core/geom.js';

const ring = (r1, r2) => CrossSection.circle(r2).subtract(CrossSection.circle(r1));

// round wire (diameter `wire`) wound around Z, starting at z=0: a straight rod along X warped onto the helix
export function helix(radius, wire, pitch, turns) {
  const len = 2 * Math.PI * radius * turns;
  const rod = Manifold.cylinder(len, wire / 2, wire / 2, 16).rotate([0, 90, 0]).refineToLength(Math.max(wire, 0.5));
  return rod.warp((v) => {
    const a = v[0] / radius, r = radius + v[2]; // rod's z becomes radial offset, y becomes axial
    v[0] = r * Math.cos(a);
    v[2] = (pitch * a) / (2 * Math.PI) + v[1] + wire / 2;
    v[1] = r * Math.sin(a);
  });
}

export const spring = part({
  name: 'spring',
  doc: 'helical compression spring; radius = coil radius to wire centre, wire = wire diameter, pitch = rise per turn',
  params: { radius: 8, wire: 1.2, pitch: 4, turns: 6 },
  build: (p) => helix(p.radius, p.wire, p.pitch, p.turns),
});

export const bearing = part({
  name: 'bearing',
  doc: 'print-in-place ball bearing: inner ring, outer ring, captured balls (separate bodies); clearance = gap around balls',
  params: { bore: 8, outer: 22, width: 7, balls: 8, clearance: 0.3 },
  build: ({ bore, outer, width, balls, clearance }) => {
    const rp = (bore + outer) / 4; // pitch radius of the ball track
    const rb = Math.min((outer - bore) / 8, width / 2 - 0.8, (2 * Math.PI * rp / balls) * 0.4);
    const lip = rb * 0.55; // rings stop short of the track centre so the balls stay captured
    const rings = CrossSection.compose([ring(bore / 2, rp - lip), ring(rp + lip, outer / 2)]).extrude(width);
    const race = CrossSection.circle(rb + clearance).translate([rp, 0]).revolve().translate(0, 0, width / 2);
    const ball = Manifold.sphere(rb).translate(rp, 0, width / 2);
    return Manifold.compose([rings.subtract(race), ...Array.from({ length: balls }, (_, i) => ball.rotate([0, 0, (360 * i) / balls]))]);
  },
});

export const hinge = part({
  name: 'hinge',
  doc: 'print-in-place two-leaf hinge, pin along X at y=0; leaf A (y<0) holds the pin, leaf B (y>0) turns on it; angle = opening (180 = flat)',
  params: { length: 40, width: 30, thickness: 3, knuckles: 5, pin: 3, clearance: 0.4, angle: 180 },
  build: ({ length, width, thickness: t, knuckles: n, pin, clearance: c, angle }) => {
    const rk = Math.max(t / 2 + 0.01, pin / 2 + c + 1.2); // knuckle radius
    const seg = (length - (n - 1) * c) / n;
    const knuckle = (i) => Manifold.cylinder(seg, rk).rotate([0, 90, 0]).translate(-length / 2 + i * (seg + c), 0, rk);
    const bridge = (i) => Manifold.cube([seg, rk + c + 1, t]).translate(-length / 2 + i * (seg + c), -rk - c - 1, 0);
    const plate = Manifold.cube([length, width / 2 - rk - c, t]).translate(-length / 2, -width / 2, 0);
    const pinRod = Manifold.cylinder(length, pin / 2).rotate([0, 90, 0]).translate(-length / 2, 0, rk);
    const idx = (odd) => Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === odd);
    const leafA = Manifold.union([plate, pinRod, ...idx(0).flatMap((i) => [knuckle(i), bridge(i)])]);
    const hole = Manifold.cylinder(length + 2, pin / 2 + c).rotate([0, 90, 0]).translate(-length / 2 - 1, 0, rk);
    const leafB = Manifold.union([plate, ...idx(1).flatMap((i) => [knuckle(i), bridge(i)])]).mirror([0, 1, 0]).subtract(hole);
    // open/close leaf B about the pin axis
    const b = leafB.translate(0, 0, -rk).rotate([180 - angle, 0, 0]).translate(0, 0, rk);
    return Manifold.compose([leafA, b]);
  },
});

export const wheel = part({
  name: 'wheel',
  doc: 'spoked wheel: rim + hub + spokes; hub = hub radius, groove = tyre groove depth (0 = none)',
  params: { radius: 30, width: 10, spokes: 6, hub: 8, bore: 5, rim: 3, groove: 1 },
  build: ({ radius, width, spokes, hub, bore, rim, groove }) => {
    let body = CrossSection.compose([ring(radius - rim, radius), ring(bore / 2, hub)]).extrude(width);
    const spoke = Manifold.cube([radius - rim - hub + 2, Math.max(2, rim), width * 0.6]).translate(hub - 1, -Math.max(2, rim) / 2, width * 0.2);
    body = body.add(Manifold.union(Array.from({ length: spokes }, (_, i) => spoke.rotate([0, 0, (360 * i) / spokes]))));
    if (groove > 0) body = body.subtract(CrossSection.circle(Math.min(groove, width / 3)).translate([radius, 0]).revolve().translate(0, 0, width / 2));
    return body.subtract(Manifold.cylinder(width * 3, bore / 2).translate(0, 0, -width));
  },
});

export const pulley = part({
  name: 'pulley',
  doc: 'V-groove pulley (revolved profile); radius = flange radius, groove = groove depth',
  params: { radius: 20, width: 10, groove: 4, bore: 5 },
  build: ({ radius: R, width: w, groove: g, bore }) => {
    const hw = Math.min(w / 2 - 0.6, g * Math.tan((20 * Math.PI) / 180) + 0.8); // ~40 degree V
    return revolve([[bore / 2, 0], [R, 0], [R, w / 2 - hw], [R - g, w / 2], [R, w / 2 + hw], [R, w], [bore / 2, w]]);
  },
});

export const axle = part({
  name: 'axle',
  doc: 'round shaft standing on Z with a D-flat; flat = depth cut from one side (0 = round)',
  params: { d: 5, length: 40, flat: 0.5 },
  build: ({ d, length, flat }) => {
    let cs = CrossSection.circle(d / 2);
    if (flat > 0) cs = cs.subtract(CrossSection.square([d, d]).translate([-d / 2, d / 2 - flat]));
    return cs.extrude(length);
  },
});

export const chainLink = part({
  name: 'chainLink',
  doc: 'stadium-shaped chain link lying flat; length/width = outside size, wire = wire diameter',
  params: { length: 20, width: 10, wire: 2.5 },
  build: ({ length, width, wire }) => {
    const rc = (width - wire) / 2, s = (length - width) / 2;
    const end = CrossSection.circle(wire / 2).translate([rc, 0]).revolve(0, 180);
    const side = Manifold.cylinder(2 * s, wire / 2).rotate([0, 90, 0]).translate(-s, 0, 0);
    return Manifold.union([end.rotate([0, 0, -90]).translate(s, 0, 0), end.rotate([0, 0, 90]).translate(-s, 0, 0), side.translate(0, rc, 0), side.translate(0, -rc, 0)])
      .translate(0, 0, wire / 2);
  },
});
