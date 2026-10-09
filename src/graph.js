import { createNodeElement } from './nodes.js';

const GRID_COLS = 6;
const GRID_CELL_W = 280;
const GRID_CELL_H = 180;

const ANNOTATION_PADDING = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Render the node graph (nodes + connectors + annotations) into the given layers.
// Returns a Graph object that tracks node/annotation positions so they can be
// moved interactively after rendering.
export function renderGraph(data, nodesLayer, svg, annotationsLayer) {
  nodesLayer.innerHTML = '';
  svg.innerHTML = '';
  if (annotationsLayer) annotationsLayer.innerHTML = '';

  const nodes = data.Nodes || [];
  const connectors = data.Connectors || [];
  const { positions, offset } = computePositions(data, nodes);

  const nodeViews = (data.View && data.View.NodeViews) || [];
  const viewNameById = new Map();
  nodeViews.forEach((v) => {
    if (v.Id != null && typeof v.Name === 'string') viewNameById.set(v.Id, v.Name);
  });

  const graph = new Graph(nodesLayer, svg);
  const portElements = new Map(); // portId -> { el, kind, nodeId }

  nodes.forEach((node) => {
    const el = createNodeElement(node, viewNameById.get(node.Id));
    const pos = positions.get(node.Id) || { x: 0, y: 0 };
    nodesLayer.appendChild(el);
    graph.addNode(node.Id, el, pos.x, pos.y);

    el.querySelectorAll('.port-col.inputs .port').forEach((portEl, i) => {
      const port = (node.Inputs || [])[i];
      if (port && port.Id != null) {
        portElements.set(port.Id, { el: portEl, kind: 'input', nodeId: node.Id });
      }
    });
    el.querySelectorAll('.port-col.outputs .port').forEach((portEl, i) => {
      const port = (node.Outputs || [])[i];
      if (port && port.Id != null) {
        portElements.set(port.Id, { el: portEl, kind: 'output', nodeId: node.Id });
      }
    });
  });

  // Render annotation groups (drawn behind nodes and connectors).
  if (annotationsLayer && offset) {
    const annotations = (data.View && data.View.Annotations) || [];
    annotations.forEach((annotation) => {
      if (typeof annotation.Left !== 'number' || typeof annotation.Top !== 'number') return;

      const rect = {
        x: annotation.Left + offset.x,
        y: annotation.Top + offset.y,
        width: annotation.Width || 200,
        height: annotation.Height || 100,
      };
      const memberIds = (annotation.Nodes || []).filter((id) => graph.nodes.has(id));

      const el = createAnnotationElement(annotation);
      annotationsLayer.appendChild(el);
      // Expand the box to fully enclose its member nodes, in case the
      // recorded annotation bounds are smaller than the rendered nodes.
      graph.addAnnotation(el, memberIds, unionRect(rect, graph.membersRect(memberIds)));
    });
  }

  // Draw connectors as cubic bezier curves between port dots.
  connectors.forEach((conn) => {
    const start = portElements.get(conn.Start);
    const end = portElements.get(conn.End);
    if (!start || !end) return;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'edge-path');
    svg.appendChild(path);
    graph.addEdge(path, start, end);
  });

  graph.redrawAllEdges();
  graph.updateSvgSize();

  return graph;
}

// Tracks rendered node, connector, and annotation elements and keeps them in
// sync as nodes are moved.
class Graph {
  constructor(nodesLayer, svg) {
    this.nodesLayer = nodesLayer;
    this.svg = svg;
    this.nodes = new Map(); // nodeId -> { el, x, y, edges: [], annotations: [] }
    this.edges = [];
    this.annotations = []; // { el, memberIds, x, y, width, height }
  }

  addNode(id, el, x, y) {
    const entry = { el, x, y, edges: [], annotations: [] };
    this.nodes.set(id, entry);
    placeElement(el, x, y);
  }

  addEdge(path, start, end) {
    const edge = { path, start, end };
    this.edges.push(edge);
    this.nodes.get(start.nodeId).edges.push(edge);
    if (end.nodeId !== start.nodeId) this.nodes.get(end.nodeId).edges.push(edge);
  }

  addAnnotation(el, memberIds, rect) {
    const annotation = { el, memberIds, ...rect };
    this.annotations.push(annotation);
    memberIds.forEach((id) => this.nodes.get(id).annotations.push(annotation));
    placeAnnotation(annotation);
  }

  // Bounding box of the given member nodes, padded, or null if there are none.
  membersRect(memberIds) {
    let rect = null;
    memberIds.forEach((id) => {
      const { el, x, y } = this.nodes.get(id);
      const w = el.offsetWidth || 160;
      const h = el.offsetHeight || 60;
      rect = unionRect(rect, {
        x: x - ANNOTATION_PADDING,
        y: y - ANNOTATION_PADDING,
        width: w + ANNOTATION_PADDING * 2,
        height: h + ANNOTATION_PADDING * 2,
      });
    });
    return rect;
  }

  // Move the given nodes by (dx, dy) in canvas coordinates, updating their
  // connectors and any annotation groups that contain them.
  moveNodes(ids, dx, dy) {
    const edges = new Set();
    const annotations = new Set();
    ids.forEach((id) => {
      const node = this.nodes.get(id);
      if (!node) return;
      node.x += dx;
      node.y += dy;
      placeElement(node.el, node.x, node.y);
      node.edges.forEach((e) => edges.add(e));
      node.annotations.forEach((a) => annotations.add(a));
    });
    edges.forEach((e) => this.drawEdge(e));
    // Refit groups around their members, as Dynamo does when a member moves.
    annotations.forEach((a) => {
      Object.assign(a, this.membersRect(a.memberIds));
      placeAnnotation(a);
    });
  }

  // Move an annotation group together with all of its member nodes.
  moveAnnotation(annotation, dx, dy) {
    annotation.x += dx;
    annotation.y += dy;
    placeAnnotation(annotation);
    if (annotation.memberIds.length) this.moveNodes(annotation.memberIds, dx, dy);
  }

  drawEdge({ path, start, end }) {
    const startPt = portCenter(start.el, this.nodesLayer);
    const endPt = portCenter(end.el, this.nodesLayer);

    const dx = Math.max(Math.abs(endPt.x - startPt.x) * 0.5, 40);
    const c1x = startPt.x + dx;
    const c2x = endPt.x - dx;

    path.setAttribute(
      'd',
      `M ${startPt.x} ${startPt.y} C ${c1x} ${startPt.y}, ${c2x} ${endPt.y}, ${endPt.x} ${endPt.y}`
    );
  }

  redrawAllEdges() {
    this.edges.forEach((e) => this.drawEdge(e));
  }

  // Content bounding box in canvas coordinates.
  getBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    this.nodes.forEach(({ el, x, y }) => {
      const w = el.offsetWidth || 160;
      const h = el.offsetHeight || 60;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });

    this.annotations.forEach((a) => {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.width);
      // Leave room below the box for the wrapped title text.
      maxY = Math.max(maxY, a.y + a.height + 40);
    });

    if (!isFinite(minX)) {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  updateSvgSize() {
    const bounds = this.getBounds();
    this.svg.setAttribute('width', `${Math.max(bounds.x + bounds.width + 200, 1)}`);
    this.svg.setAttribute('height', `${Math.max(bounds.y + bounds.height + 200, 1)}`);
  }
}

function placeElement(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function placeAnnotation(a) {
  placeElement(a.el, a.x, a.y);
  a.el.style.width = `${a.width}px`;
  a.el.style.height = `${a.height}px`;
}

function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

// Compute node positions from View.NodeViews, normalized so the
// top-left-most node sits at (24, 24). Falls back to a simple grid.
// Returns the positions map plus the coordinate offset applied (or null
// if a grid fallback was used, since annotations can't be placed reliably then).
function computePositions(data, nodes) {
  const positions = new Map();
  const nodeViews = data.View && data.View.NodeViews;

  if (Array.isArray(nodeViews) && nodeViews.length > 0) {
    const viewById = new Map();
    nodeViews.forEach((v) => {
      if (v.Id != null && typeof v.X === 'number' && typeof v.Y === 'number') {
        viewById.set(v.Id, v);
      }
    });

    if (viewById.size > 0) {
      let minX = Infinity;
      let minY = Infinity;
      viewById.forEach((v) => {
        minX = Math.min(minX, v.X);
        minY = Math.min(minY, v.Y);
      });

      const offset = { x: -minX + 24, y: -minY + 24 };

      let gridIndex = 0;
      nodes.forEach((node) => {
        const v = viewById.get(node.Id);
        if (v) {
          positions.set(node.Id, { x: v.X + offset.x, y: v.Y + offset.y });
        } else {
          // Node missing from view data: place in grid below the graph.
          positions.set(node.Id, gridPosition(gridIndex++));
        }
      });
      return { positions, offset };
    }
  }

  nodes.forEach((node, i) => {
    positions.set(node.Id, gridPosition(i));
  });
  return { positions, offset: null };
}

// Build the DOM element for an annotation (group) box.
function createAnnotationElement(annotation) {
  const el = document.createElement('div');
  el.className = 'dyn-annotation';

  const color = parseAnnotationColor(annotation.Background);
  if (color) {
    el.style.background = color.fill;
    el.style.borderColor = color.border;
  }

  const title = document.createElement('div');
  title.className = 'dyn-annotation-title';
  title.textContent = annotation.Title || '';
  if (color) title.style.color = color.border;
  el.appendChild(title);

  return el;
}

// Parse a Dynamo annotation color (#RRGGBB or #AARRGGBB) into fill/border CSS colors.
function parseAnnotationColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.replace('#', '');

  let r;
  let g;
  let b;
  if (hex.length === 8) {
    r = parseInt(hex.slice(2, 4), 16);
    g = parseInt(hex.slice(4, 6), 16);
    b = parseInt(hex.slice(6, 8), 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return null;
  }

  if ([r, g, b].some((v) => Number.isNaN(v))) return null;

  return {
    fill: `rgba(${r}, ${g}, ${b}, 0.18)`,
    border: `rgb(${r}, ${g}, ${b})`,
  };
}

function gridPosition(index) {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: 24 + col * GRID_CELL_W, y: 24 + row * GRID_CELL_H };
}

// Compute the center point of a port dot in coordinates relative to `ancestor`.
function portCenter(portEl, ancestor) {
  const dot = portEl.querySelector('.port-dot');
  const target = dot || portEl;

  let x = 0;
  let y = 0;
  let el = target;
  while (el && el !== ancestor) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent;
  }

  x += target.offsetWidth / 2;
  y += target.offsetHeight / 2;

  return { x, y };
}
