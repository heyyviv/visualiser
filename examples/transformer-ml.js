// ML Transformer explainer: one self-attention block on "the cat sat on the mat".
// Everything stands in the XZ plane (read it from -Y); stages run left to right; boards are the solids, data are visuals.
const tokens = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
const n = tokens.length;
const focus = param('query token', 2, 0, n - 1, 1); // which token's attention to trace
const temp = param('softmax temperature', 1, 0.3, 3, 0.1);

// deterministic pseudo-random numbers 0..1 (same word -> same embedding)
const rnd = (s) => { const x = Math.sin(s * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };
const wordId = (w) => [...w].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 997;
const matrix = (rows, cols, seed) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => rnd(seed(r) * 13 + c)));
const embed = matrix(n, 8, (r) => wordId(tokens[r]));
const Q = matrix(n, 4, (r) => wordId(tokens[r]) + 101 + r);
const K = matrix(n, 4, (r) => wordId(tokens[r]) + 211 + r);
const V = matrix(n, 4, (r) => wordId(tokens[r]) + 307 + r);

// hand-made relevance scores (what a trained model plausibly learns), then softmax per row
const score = (i, j) => (i === j ? 1 : 0) + ({ '2,1': 3, '2,5': 1.4, '1,2': 1.6, '1,0': 1.2, '3,5': 2.5, '5,3': 1.6, '5,4': 1.8, '4,5': 2.4, '0,1': 2, '3,2': 1.2 }[`${i},${j}`] || 0);
const A = tokens.map((_, i) => {
  const e = tokens.map((_, j) => Math.exp(score(i, j) / temp));
  const s = e.reduce((a, b) => a + b);
  return e.map((x) => x / s);
});
const mix = A.map((row) => V[0].map((_, c) => row.reduce((a, w, j) => a + w * V[j][c], 0)));
const ffn = matrix(n, 12, (r) => r * 5 + 900).map((row, r) => row.map((x, c) => Math.max(0, x * 1.4 - 0.4 + mix[r][c % 4] * 0.3)));
const outV = matrix(n, 8, (r) => r * 3 + 1500);
const pct = (x) => `${Math.round(x * 100)}%`;

// layout: grid centre z = 40, cell 4 + gap 1; mirror the viewer's blockGrid layout to place lines/labels on cells
const Z = 40, P = 5;
const cell = (x, cols, r, c) => [x + (c - (cols - 1) / 2) * P, 0, Z - (r - (n - 1) / 2) * P];
const grid = (x, values, extra = {}) => blockGrid({ rows: values.length, cols: values[0].length, values, at: [x, 0, Z], axis: 'xz', cell: 4, gap: 1, ...extra });
const board = (x, w) => roundedBox([w, 3, 46], 1).translate([x, 6, 17]);
const plinth = (x, w) => box([w + 6, 16, 4]).translate([x, 4, 0]);
const stand = (x, w) => union(board(x, w), plinth(x, w), box([4, 3, 14]).translate([x, 6, 3]));

const X = { emb: -150, q: -100, k: -78, v: -56, att: -5, mat: 45, mix: 92, ffn: 145, out: 200 };
const keyPts = tokens.map((_, r) => cell(X.att - 15, 1, r, 0).map((v, i) => (i === 0 ? v + 2.5 : v)));
const qryPts = tokens.map((_, r) => cell(X.att + 15, 1, r, 0).map((v, i) => (i === 0 ? v - 2.5 : v)));
const top = Z + 22;

const visuals = {
  title: text3d({ text: 'Transformer: self-attention', at: [25, 0, 92], size: 1.5 }),
  tokensIn: label({ text: `"${tokens.join(' ')}"`, at: [X.emb, 0, top], offset: [0, 0, 0] }),
  emb: grid(X.emb, embed, { color: '#4f8ef7', labels: tokens }),
  q: grid(X.q, Q, { color: '#e05d6f', labels: tokens }),
  k: grid(X.k, K, { color: '#5cc98a' }),
  v: grid(X.v, V, { color: '#e8c547' }),
  qkvTag: label({ text: 'Q            K            V', at: [X.k, 0, top], offset: [0, 0, 0] }),
  toQKV: arrow({ from: [X.emb + 24, -4, Z], to: [X.q - 22, -4, Z], color: '#9aa5b1', text: '× W_Q, W_K, W_V' }),
  keys: grid(X.att - 15, tokens.map((_, r) => [K[r][0]]), { color: '#5cc98a', labels: tokens }),
  queries: grid(X.att + 15, tokens.map((_, r) => [r === focus ? 1 : Q[r][0] * 0.6]), { color: '#e05d6f' }),
  attTag: label({ text: 'keys  ←  query', at: [X.att, 0, top], offset: [0, 0, 0] }),
  focusLines: connections({ from: [qryPts[focus]], to: keyPts, weights: [A[focus]], color: '#ff7b9c' }),
  allLines: connections({ from: qryPts, to: keyPts, weights: A, color: '#a77bf3' }),
  ...Object.fromEntries(tokens.map((t, j) => [`w${j}`, label({ text: pct(A[focus][j]), at: keyPts[j], offset: [6, 0, 1.8] })])),
  attMat: grid(X.mat, A.map((r) => r.map((x) => Math.min(1, x * 1.6))), { color: '#a77bf3', labels: tokens }),
  matTag: label({ text: 'softmax(Q·Kᵀ/√d)', at: [X.mat, 0, top], offset: [0, 0, 0] }),
  mix: grid(X.mix, mix, { color: '#e8c547', labels: tokens }),
  mixTag: label({ text: 'Σ weight × V', at: [X.mix, 0, top], offset: [0, 0, 0] }),
  toMix: arrow({ from: [X.mat + 18, -4, Z], to: [X.mix - 14, -4, Z], color: '#9aa5b1' }),
  ffn: grid(X.ffn, ffn, { color: '#3fc1c9', cell: 3, gap: 1 }),
  ffnTag: label({ text: 'feed-forward (per token)', at: [X.ffn, 0, top], offset: [0, 0, 0] }),
  toFfn: arrow({ from: [X.mix + 14, -4, Z], to: [X.ffn - 27, -4, Z], color: '#9aa5b1' }),
  out: grid(X.out, outV, { color: '#5cc98a', labels: tokens }),
  outTag: label({ text: 'next token → "."  (62%)', at: [X.out, 0, top], offset: [0, 0, 0] }),
  toOut: arrow({ from: [X.ffn + 27, -4, Z], to: [X.out - 24, -4, Z], color: '#9aa5b1' }),
};

// each step adds visuals; earlier ones stay
const story = [
  ['1. Text becomes tokens', 'The sentence is split into tokens. Each token is looked up in a table and becomes a vector of numbers: its embedding. Both "the"s get the same vector (position info is added on top).', ['tokensIn', 'emb'], 'embBoard'],
  ['2. Queries, keys and values', 'Three learned matrices turn every embedding into a Query ("what am I looking for?"), a Key ("what do I contain?") and a Value ("what I pass on").', ['q', 'k', 'v', 'qkvTag', 'toQKV'], 'qkvBoard'],
  [`3. "${tokens[focus]}" looks at every token`, `The query of "${tokens[focus]}" is compared with every key (dot product). Softmax turns the scores into weights that sum to 100%. Brighter, thicker lines = more attention. Try the query token slider.`, ['keys', 'queries', 'attTag', 'focusLines', ...tokens.map((_, j) => `w${j}`)], 'attBoard'],
  ['4. Every token attends at once', 'All tokens do this in parallel: the full attention pattern is a square matrix of weights, one row per query.', ['allLines', 'attMat', 'matTag'], 'matBoard'],
  ['5. Weighted sum of values', `Each token's new vector is the attention-weighted mix of all value vectors, so "${tokens[focus]}" now carries information from the words it attended to.`, ['mix', 'mixTag', 'toMix'], 'mixBoard'],
  ['6. Feed-forward network', 'A small two-layer network then processes each token on its own: expand, ReLU, project back. Attention mixes between tokens; the feed-forward thinks within one.', ['ffn', 'ffnTag', 'toFfn'], 'ffnBoard'],
  ['7. Stack and predict', 'Real models stack dozens of these blocks. The last vector is turned into probabilities over the vocabulary to predict the next token.', ['out', 'outTag', 'toOut'], 'outBoard'],
];
let shown = ['title'];
const boards = { embBoard: [X.emb, 46], qkvBoard: [X.k, 70], attBoard: [X.att, 40], matBoard: [X.mat, 36], mixBoard: [X.mix, 24], ffnBoard: [X.ffn, 52], outBoard: [X.out, 46] };
// look at a board head-on, slightly from the right and above
const view = ([x, w]) => ({ target: [x, 0, 38], position: [x + 18, -Math.max(w, 46) * 2.6, 62] });
const steps = story.map(([title, text, add, board], i) => {
  shown = [...shown.filter((id) => !(i >= 3 && (id === 'focusLines' || id.match(/^w\d$/)))), ...add];
  return { title, text, show: shown, highlight: [board, ...add], camera: view(boards[board]) };
});
steps.push({ title: '8. The whole block', text: 'Tokens → embeddings → Q, K, V → attention weights → weighted sum → feed-forward → next-token prediction.', show: [...shown, 'focusLines'], camera: { position: [25, -420, 110], target: [25, 0, 40] } });

return scene({
  title: 'Transformer (attention) explained',
  objects: {
    ...Object.fromEntries(Object.entries(boards).map(([id, [x, w]]) => [id, { solid: stand(x, w), color: '#3a4356' }])),
  },
  visuals,
  steps,
});
