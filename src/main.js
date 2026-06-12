import { renderGraph } from './graph.js';
import { PanZoom } from './panzoom.js';
import { initTabs, renderMeta, renderStats, renderLegend, renderCode, renderDeps, showCodeForNode } from './sidebar.js';

const dropzone = document.getElementById('dropzone');
const layout = document.getElementById('layout');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const openBtn = document.getElementById('open-btn');

const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const nodesLayer = document.getElementById('nodes-layer');
const edgesSvg = document.getElementById('edges');
const annotationsLayer = document.getElementById('annotations-layer');

const zoomLabel = document.getElementById('zoom-label');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomFitBtn = document.getElementById('zoom-fit');

let panZoom = null;
let currentBounds = null;

initTabs();

nodesLayer.addEventListener('node-select', (e) => {
  showCodeForNode(e.detail.nodeId);
});

panZoom = new PanZoom(viewport, canvas, {
  onChange: ({ scale }) => {
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  },
});

// ---- File loading ----

browseBtn.addEventListener('click', () => fileInput.click());
openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) loadFile(file);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// Allow dropping a new file anywhere over the loaded layout to replace it.
['dragenter', 'dragover', 'drop'].forEach((evt) => {
  layout.addEventListener(evt, (e) => e.preventDefault());
});
layout.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      renderApp(data);
    } catch (err) {
      alert(`Failed to parse file as JSON: ${err.message}`);
    }
  };
  reader.onerror = () => {
    alert('Failed to read file.');
  };
  reader.readAsText(file);
}

function renderApp(data) {
  dropzone.classList.add('hidden');
  layout.classList.remove('hidden');

  renderMeta(data);
  renderStats(data);
  renderLegend(data);
  renderCode(data);
  renderDeps(data);

  currentBounds = renderGraph(data, nodesLayer, edgesSvg, annotationsLayer);

  // Run fit-to-view after layout settles so viewport dimensions are correct.
  requestAnimationFrame(() => {
    panZoom.fitToBounds(currentBounds);
  });
}

// ---- Toolbar ----

zoomInBtn.addEventListener('click', () => panZoom.zoomBy(1.25));
zoomOutBtn.addEventListener('click', () => panZoom.zoomBy(0.8));
zoomResetBtn.addEventListener('click', () => panZoom.setTransform(panZoom.x, panZoom.y, 1));
zoomFitBtn.addEventListener('click', () => {
  if (currentBounds) panZoom.fitToBounds(currentBounds);
});
