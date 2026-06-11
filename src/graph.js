import { createNodeElement } from './nodes.js';

const GRID_COLS = 6;
const GRID_CELL_W = 280;
const GRID_CELL_H = 180;

// Render the node graph (nodes + connectors) into the given layers.
// Returns the content bounding box in canvas coordinates.
export function renderGraph(data, nodesLayer, svg) {
  nodesLayer.innerHTML = '';
  svg.innerHTML = '';

  const nodes = data.Nodes || [];
  const connectors = data.Connectors || [];
  const positions = computePositions(data, nodes);

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

      let gridIndex = 0;
      nodes.forEach((node) => {
        const v = viewById.get(node.Id);
        if (v) {
          positions.set(node.Id, { x: v.X - minX + 24, y: v.Y - minY + 24 });
        } else {
          // Node missing from view data: place in grid below the graph.
          positions.set(node.Id, gridPosition(gridIndex++));
        }
      });
      return positions;
    }
  }

  nodes.forEach((node, i) => {
    positions.set(node.Id, gridPosition(i));
  });
  return positions;
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
