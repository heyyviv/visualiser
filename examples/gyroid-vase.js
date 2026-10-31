// Organic vase: a twisted, bulging rounded square shelled into a thin wall, with a gyroid lattice band.
const H = param('height', 110, 60, 180);
const twistDeg = param('twist', 120, 0, 360);
const wall = 1.6, half = 18; // half-width of the body at its narrowest

// radius scale along the height: wide belly, narrow neck, flared lip (z in -H/2..H/2)
const bulge = (z) => { const u = z / H + 0.5; return 1 + 0.45 * Math.sin(Math.PI * u * 1.2) - 0.15 * u; };
const body = sTwist(sWarp(sBox([2 * half, 2 * half, H], 8), ([x, y, z]) => [x / bulge(z), y / bulge(z), z]), twistDeg / H);
const shell = sIntersect(sShell(body, wall), ([, , z]) => z - (H / 2 - 1)); // cut open at the top
// band around the belly: the solid wall is swapped for a thick gyroid lattice
const band = ([, , z]) => Math.abs(z + H * 0.05) - H * 0.15;
const lattice = sIntersect(sShell(body, wall * 3), sGyroid(9, 1.4), band);
const f = sUnion(sSubtract(shell, band), lattice);

const R = half * 1.8 + 3;
const vase = mesh(f, { min: [-R, -R, -H / 2 - 2], max: [R, R, H / 2 + 2] }, 0.9);
// the lattice leaves a few loose crumbs at the band edges: keep the main body only
return onBed(vase.decompose().sort((a, b) => b.volume() - a.volume())[0]);
