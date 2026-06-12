# Dynamo Viewer

A small, dependency-free web app for inspecting [Autodesk Dynamo](https://dynamobim.org/) `.dyn` files. Since `.dyn` files are just JSON, you can drop one in and get an instant visual + textual breakdown of the graph — no Dynamo install required.

**Live demo:** https://benregnier.github.io/dynamo-viewer/

## How it works

The app is plain HTML/CSS/JS using native ES modules — no build step, no frameworks, no dependencies. Just open `index.html` (or serve the folder with any static file server) and drop in a `.dyn` file.

```
dynamo-viewer/
├── index.html       # Drop zone + app shell (header, sidebar, canvas)
└── src/
    ├── main.js       # Wires everything together, handles file loading
    ├── graph.js       # Computes node layout and draws connector edges
    ├── panzoom.js     # Self-contained pan/zoom controller for the canvas
    ├── nodes.js       # Node type classification, colors, and label resolution
    ├── sidebar.js     # Renders meta info, stats, legend, code, and deps panels
    └── style.css      # Dark theme styling
```

### Loading a file

`.dyn` files are parsed as JSON in the browser via `FileReader` — nothing is uploaded anywhere. Once parsed, `main.js` populates the sidebar and renders the graph.

### Sidebar (Graph / Code / Deps tabs)

- **Meta** — graph `Name`, `Author`, and `Description` from the JSON root.
- **Stats** — node count, connector count, Python node count, and dependency count.
- **Graph tab** — a legend of the node types present, with colors matching the canvas.
- **Code tab** — the verbatim `Code` field from every Python and CodeBlock node, plus any `HintPath` from file path nodes, rendered in monospace `<pre>` blocks.
- **Deps tab** — `NodeLibraryDependencies` (name, version, reference type).

### Graph canvas

- Nodes are positioned using `View.NodeViews[].X/Y` from the file, normalized so the top-left-most node sits at `(24, 24)`. If no view data exists, nodes fall back to a simple grid layout.
- Each node is rendered as a DOM `<div>` with a colored left bar (by node type), a resolved label, an optional namespace subtitle, and input/output port dots.
- Connectors are drawn in an SVG overlay as cubic bezier curves between port dots, with horizontal tangents for a left-to-right flow.
- Pan (drag) and zoom (scroll wheel + pinch) are handled by a small self-contained `PanZoom` class — no external libraries.
- The toolbar provides fit-to-view, 1:1 reset, zoom in/out, and a live zoom percentage. Fit-to-view runs automatically when a file loads.

### Node label resolution

Labels are resolved in priority order:

1. `NickName`, if set and not a generic placeholder (`Function`, `DSFunction`, `DSVarArgFunction`).
2. `FunctionSignature` — the last segment after the final `.`, with any `@argTypes` suffix dropped. The preceding two namespace segments are shown as a gray subtitle.
3. `ConcreteType` short name (last `.`-delimited segment, assembly suffix dropped), unless it's `DSFunction`/`DSVarArgFunction`.
4. `Name` field.
5. Fallback: `"Node"`.

### Node type classification

| Type | Match | Color |
| --- | --- | --- |
| Python | `ConcreteType` contains `Python` | `#3b82f6` |
| Code Block | `ConcreteType` contains `CodeBlock` | `#22c55e` |
| Watch | `ConcreteType` contains `Watch` | `#f59e0b` |
| Selection | `ConcreteType` contains `Selection` or `ModelElement` | `#ec4899` |
| Elements | `ConcreteType` contains `Categories` or `ElementsOf` | `#a78bfa` |
| File / Path | `ConcreteType` contains `Filename` or `FileSystem` | `#14b8a6` |
| Input | `FunctionSignature` contains `.Input.`, or `ConcreteType` is `StringInput`/`BoolSelector`/`IntegerSlider`/`DoubleSlider` | `#fb923c` |
| Function | everything else | `#475569` |

## Running locally

No install needed — just serve the directory with any static file server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
