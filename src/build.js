// Node build: script -> scene -> one STL (all solids, kept as separate bodies) + printability report.
import { evaluate } from './run.js';
import { Manifold } from './core/geom.js';
import { toSTL, report } from './export.js';

export function build(script, opts) {
  const { result, params } = evaluate(script, opts);
  const solids = Object.values(result.objects).map((o) => o.solid);
  const all = solids.length === 1 ? solids[0] : Manifold.compose(solids);
  return { scene: result, params, stl: toSTL(all), report: report(all) };
}
