# forge3d

Claude makes printable 3D models and step-by-step animated 3D explainers by writing short scripts against a part library. Geometry is [Manifold](https://github.com/elalish/manifold) (WASM), so every solid is watertight and exports straight to STL. A local viewer shows the model live, with parameter sliders, animation, exploded views and explainer steps.

Scripts are short because they compose parts (`gear`, `bolt`, ...) instead of raw geometry, which keeps token use low.

## Install in Claude Code

```
/plugin marketplace add heyyviv/visualiser
/plugin install forge3d@forge3d
```

From a local checkout:

```
/plugin marketplace add ~/Desktop/projects/forge3d
/plugin install forge3d@forge3d
```

The plugin brings the MCP server (installs its npm dependencies on first start), the `forge3d` skill and the `/forge3d <what to make or explain>` command. Needs Node 20+.

## Other MCP clients (Claude Desktop, ...)

```json
{
  "mcpServers": {
    "forge3d": { "command": "node", "args": ["/absolute/path/to/forge3d/src/mcp.js"] }
  }
}
```

Run `npm ci` in the checkout first. Once published to npm: `"command": "npx", "args": ["-y", "forge3d-mcp"]`.

## Tools

| tool | what it does |
|---|---|
| `catalog({filter?})` | script API plus one line per part. Call it first. |
| `part_doc({name})` | full params and notes for one part (source for user parts) |
| `build({name, script, overrides?})` | builds in a worker, writes `~/.forge3d/models/<name>/model.stl`, returns the viewer URL, size, volume and print warnings |
| `save_part({name, script})` | test-builds and saves a reusable part to `~/.forge3d/parts/<name>.js`, then it is listed as `[user]` |
| `view({name?})` | viewer URL for a model, or every model with its URL |
| `find_model({query})` | searches Sketchfab for a ready-made downloadable model (no login needed) |
| `get_model({uid, name})` | downloads it as GLB to `~/.forge3d/models/<name>/` and opens it in the viewer, where explode pulls the meshes apart. Needs a free [Sketchfab API token](https://sketchfab.com/settings/password) in `~/.forge3d/sketchfab_token`. Downloads are deleted when the session ends |
| `keep_model({name})` | keeps a download from this session instead of deleting it at session end |

## Script cheat-sheet

A script is a JS function body that ends in `return <solid>` or `return scene({...})`. Units are mm, Z is up and the bed is z=0.

```js
const d = param('diameter', 30, 10, 60);          // tunable: slider in the viewer, `overrides` in build
return subtract(cylinder(d / 2, 5), cylinder(3, 5)); // a washer
```

- Primitives: `box roundedBox cylinder cone sphere torus extrude revolve tube polygon circle`
- Operations: `union subtract intersect hull mirror array polar twist bend onBed`, plus `.translate .rotate .scale` on solids
- SDF (organic shapes, lattices): `sSphere sBox sGyroid sSmoothUnion sShell ...` then `mesh(f, bounds, res)`
- Explainers: `scene({ title, objects, visuals, steps })`, animations `spin slide swing chain`, visuals `arrow label flow fieldLoop blockGrid connections text3d`
- Reusable parts: `part({ name, doc, params, build })`

`catalog` prints the full list with arguments.

## Viewer

`http://127.0.0.1:4317/viewer/?model=<name>` (set `FORGE3D_PORT` to change the port). It shows the model with live parameter sliders, plays animations, explodes assemblies and walks through explainer steps.

## Data and settings

- `FORGE3D_HOME` (default `~/.forge3d`): `models/` and `parts/`
- `FORGE3D_PORT` (default 4317, `0` = any free port)
- `FORGE3D_TIMEOUT_MS` (default 60000): build time limit

## Security

Scripts run as local JavaScript in a Node worker thread with a time and memory limit. A worker is not a security sandbox: a script can read and write your files like any program you run. Only build scripts you would run yourself.

## Development

```
npm ci
npm test
```
