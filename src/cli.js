#!/usr/bin/env node
// forge3d build <script.js> [out.stl]
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from './build.js';

const [cmd, file, out = file?.replace(/\.js$/, '.stl')] = process.argv.slice(2);
if (cmd !== 'build' || !file) {
  console.error('usage: forge3d build <script.js> [out.stl]');
  process.exit(1);
}
const { stl, report, params, scene } = build(readFileSync(file, 'utf8'));
writeFileSync(out, stl);
console.log(JSON.stringify({ out, title: scene.title, objects: Object.keys(scene.objects), params, ...report }, null, 2));
