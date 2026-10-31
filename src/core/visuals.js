// Visual-only scene elements for explainers. Plain data: the viewer draws them, export ignores them.
// Positions are [x,y,z] in mm, or an object id string (= centre of that object).
import { part } from './part.js';

const visual = (name, doc, params) => part({ name, doc, params, kind: 'visual', build: (p) => ({ type: name, ...p }) });

export const arrow = visual('arrow', 'straight arrow from -> to', { from: [0, 0, 0], to: [10, 0, 0], color: '#ffcc00', text: '' });
export const label = visual('label', 'floating text tag at a point or object id', { text: 'label', at: [0, 0, 0], offset: [0, 0, 5] });
export const flow = visual('flow', 'dots moving along a path: current, fluid, data', { path: [[0, 0, 0], [10, 0, 0]], color: '#00e5ff', speed: 20, count: 12, closed: false, radius: 0.8 });
export const fieldLoop = visual('fieldLoop', 'closed glowing loop with moving dots: magnetic flux, cycles', { path: [[-10, 0, 0], [10, 0, 0], [10, 0, 10], [-10, 0, 10]], color: '#ff4fd8', speed: 15, count: 16, radius: 0.6, closed: true });
export const blockGrid = visual('blockGrid', 'rows x cols of boxes coloured by value 0..1: matrices, embeddings, tensors', { rows: 4, cols: 8, values: null, cell: 4, gap: 1, at: [0, 0, 0], axis: 'xz', color: '#4f8ef7', labels: null });
export const connections = visual('connections', 'lines from each `from` point to each `to` point; weights[i][j] 0..1 set strength: attention, wiring', { from: [[0, 0, 0]], to: [[10, 0, 0]], weights: null, color: '#ffffff' });
export const text3d = visual('text3d', 'large heading text pinned in space', { text: 'Title', at: [0, 0, 20], size: 1.6 });
