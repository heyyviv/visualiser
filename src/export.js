// Mesh export + printability report.
export function meshOf(m) {
  const { vertProperties, triVerts, numProp } = m.getMesh();
  const pos = new Float32Array((vertProperties.length / numProp) * 3);
  for (let i = 0, j = 0; i < vertProperties.length; i += numProp, j += 3) pos.set(vertProperties.subarray(i, i + 3), j);
  return { pos, idx: triVerts };
}

export function toSTL(m) {
  const { pos, idx } = meshOf(m);
  const n = idx.length / 3;
  const buf = Buffer.alloc(84 + n * 50);
  buf.write('forge3d', 0);
  buf.writeUInt32LE(n, 80);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const [a, b, c] = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]].map((i) => pos.subarray(i * 3, i * 3 + 3));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    [nx / l, ny / l, nz / l, ...a, ...b, ...c].forEach((f, k) => buf.writeFloatLE(f, o + k * 4));
  }
  return buf;
}

// Checks a slicer would complain about. Manifold output is always closed, so we check the rest.
export function report(m) {
  const { min, max } = m.boundingBox();
  const size = max.map((x, i) => +(x - min[i]).toFixed(2));
  const warnings = [];
  if (m.isEmpty()) warnings.push('empty solid');
  if (m.status() !== 'NoError' && m.status() !== 0) warnings.push(`manifold status: ${m.status()}`);
  if (Math.abs(min[2]) > 0.01) warnings.push(`not on the bed: lowest z is ${min[2].toFixed(2)} (use onBed())`);
  if (Math.max(...size) > 250) warnings.push(`larger than 250 mm (${size.join(' x ')}): may not fit a common printer`);
  if (Math.max(...size) < 2) warnings.push('smaller than 2 mm: check units are mm');
  const parts = m.decompose().length;
  if (parts > 1) warnings.push(`${parts} separate bodies (fine for print-in-place, otherwise check for floating pieces)`);
  return {
    size_mm: size,
    volume_cm3: +(m.volume() / 1000).toFixed(2),
    triangles: m.numTri(),
    genus: m.genus(),
    warnings,
  };
}
