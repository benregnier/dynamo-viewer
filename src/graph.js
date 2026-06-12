import { createNodeElement } from './nodes.js';

const GRID_COLS = 6;
const GRID_CELL_W = 280;
const GRID_CELL_H = 180;

// Render the node graph (nodes + connectors + annotations) into the given layers.
// Returns the content bounding box in canvas coordinates.
export function renderGraph(data, nodesLayer, svg, annotationsLayer) {
  nodesLayer.innerHTML = '';
  svg.innerHTML = '';
  if (annotationsLayer) annotationsLayer.innerHTML = '';

  const nodes = data.Nodes || [];
  const connectors = data.Connectors || [];
  const { positions, offset } = computePositions(data, nodes);

  const elementsById = new Map();
  const portElements = new Map(); // portId -> { el, kind, nodeId }

  nodes.forEach((node) => {
    const el = createNodeElement(node);
    const pos = positions.get(node.Id) || { x: 0, y: 0 };
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    nodesLayer.appendChild(el);
    elementsById.set(node.Id, el);

    el.querySelectorAll('.port-col.inputs .port').forEach((portEl, i) => {
      const port = (node.Inputs || [])[i];
      if (port && port.Id != null) {
        portElements.set(port.Id, { el: portEl, kind: 'input', nodeEl: el });
      }
    });
    el.querySelectorAll('.port-col.outputs .port').forEach((portEl, i) => {
      const port = (node.Outputs || [])[i];
      if (port && port.Id != null) {
        portElements.set(port.Id, { el: portEl, kind: 'output', nodeEl: el });
      }
    });
  });

  // Compute content bounds from rendered node sizes.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const el = elementsById.get(node.Id);
    const pos = positions.get(node.Id) || { x: 0, y: 0 };
    const w = el.offsetWidth || 160;
    const h = el.offsetHeight || 60;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w);
    maxY = Math.max(maxY, pos.y + h);
  });

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  // Render annotation groups (drawn behind nodes and connectors).
  if (annotationsLayer && offset) {
    const annotations = (data.View && data.View.Annotations) || [];
    annotations.forEach((annotation) => {
      if (typeof annotation.Left !== 'number' || typeof annotation.Top !== 'number') return;

      const x = annotation.Left + offset.x;
      const y = annotation.Top + offset.y;
      const width = annotation.Width || 200;
      const height = annotation.Height || 100;

      annotationsLayer.appendChild(createAnnotationElement(annotation, x, y, width, height));

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      // Leave room below the box for the wrapped title text.
      maxY = Math.max(maxY, y + height + 40);
    });
  }

  // Draw connectors as cubic bezier curves between port dots.
  const svgNS = 'http://www.w3.org/2000/svg';
  connectors.forEach((conn) => {
    const start = portElements.get(conn.Start);
    const end = portElements.get(conn.End);
    if (!start || !end) return;

    const startPt = portCenter(start.el, start.kind, nodesLayer);
    const endPt = portCenter(end.el, end.kind, nodesLayer);

    const dx = Math.max(Math.abs(endPt.x - startPt.x) * 0.5, 40);
    const c1x = startPt.x + dx;
    const c2x = endPt.x - dx;

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute(
      'd',
      `M ${startPt.x} ${startPt.y} C ${c1x} ${startPt.y}, ${c2x} ${endPt.y}, ${endPt.x} ${endPt.y}`
    );
    svg.appendChild(path);
  });

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  svg.setAttribute('width', `${bounds.x + bounds.width + 200}`);
  svg.setAttribute('height', `${bounds.y + bounds.height + 200}`);

  return bounds;
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
function createAnnotationElement(annotation, x, y, width, height) {
  const el = document.createElement('div');
  el.className = 'dyn-annotation';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;

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
function portCenter(portEl, kind, ancestor) {
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
