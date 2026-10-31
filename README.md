# forge3d

Claude builds printable 3D models and animated 3D explainers from short scripts over a part library (`gear`, `bolt`, ...), or downloads ready-made models from Sketchfab. A local viewer shows them live with sliders, animation, steps and exploded views.

## Install (Claude Code, Node 20+)

```
/plugin marketplace add heyyviv/visualiser
/plugin install forge3d@forge3d
```

Then ask: `/forge3d explain how bike gears work`.

To download models, save a free [Sketchfab API token](https://sketchfab.com/settings/password): `echo <token> > ~/.forge3d/sketchfab_token`. Downloads are deleted when the session ends unless you ask to keep them.

## Tools

`catalog` · `part_doc` · `build` · `save_part` · `view` · `find_model` · `get_model` · `keep_model`

Models live in `~/.forge3d`; the viewer runs at `http://127.0.0.1:4317/viewer/`.

## Security

Scripts run as local JavaScript in a worker with time and memory limits, not a sandbox. Only build scripts you would run yourself.

## Dev

```
npm ci && npm test
```
