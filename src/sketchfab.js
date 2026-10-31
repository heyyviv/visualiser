// Find and download ready-made models from Sketchfab. Search is public; download needs a free API token.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './paths.js';

const API = 'https://api.sketchfab.com/v3';
export const UID = /^[a-f0-9]{32}$/;
const MAX_BYTES = 300e6;

export function token() {
  if (process.env.SKETCHFAB_TOKEN) return process.env.SKETCHFAB_TOKEN.trim();
  try { return readFileSync(join(HOME, 'sketchfab_token'), 'utf8').trim() || null; } catch { return null; }
}

const mb = (b) => (b ? `${(b / 1e6).toFixed(1)} MB` : '? MB');

export async function search(query, count = 8) {
  const q = new URLSearchParams({ type: 'models', q: query, downloadable: 'true', count: String(count) });
  const r = await fetch(`${API}/search?${q}`);
  if (!r.ok) throw new Error(`Sketchfab search failed: HTTP ${r.status}`);
  return (await r.json()).results.map((m) => ({
    uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username, license: m.license?.label,
    faces: m.faceCount, size: mb(m.archives?.glb?.size), url: m.viewerUrl,
  }));
}

// writes <outDir>/model.glb and source.json (attribution: CC licenses require crediting the author)
export async function download(uid, outDir, tok) {
  const auth = { headers: { authorization: `Token ${tok}` } };
  const [meta, links] = await Promise.all([
    fetch(`${API}/models/${uid}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`no Sketchfab model ${uid} (HTTP ${r.status})`)))),
    fetch(`${API}/models/${uid}/download`, auth).then((r) => {
      if (r.status === 401) throw new Error('Sketchfab rejected the token (401); check ~/.forge3d/sketchfab_token');
      return r.ok ? r.json() : Promise.reject(new Error(`download not available: HTTP ${r.status}`));
    }),
  ]);
  if (!links.glb?.url) throw new Error('this model has no GLB download; pick another');
  if (links.glb.size > MAX_BYTES) throw new Error(`GLB is ${mb(links.glb.size)}, over the ${mb(MAX_BYTES)} limit; pick a lighter model`);
  const r = await fetch(links.glb.url);
  if (!r.ok) throw new Error(`GLB download failed: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('downloaded file is not a GLB');
  const source = { uid, name: meta.name, author: meta.user?.displayName || meta.user?.username, license: meta.license?.label, url: meta.viewerUrl };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'model.glb'), buf);
  writeFileSync(join(outDir, 'source.json'), JSON.stringify(source, null, 2));
  return { ...source, size: mb(buf.length) };
}
