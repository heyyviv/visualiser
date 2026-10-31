// Where user data lives. FORGE3D_HOME overrides (tests, sandboxes).
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = process.env.FORGE3D_HOME || join(homedir(), '.forge3d');
export const MODELS_DIR = join(HOME, 'models'); // <name>/model.js, model.stl, report.json
export const PARTS_DIR = join(HOME, 'parts'); // <name>.js user parts, each `return part({...})`
