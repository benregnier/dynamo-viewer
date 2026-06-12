import { classifyNode, getTypeColors, getTypeLabels } from './nodes.js';

// Set up tab switching between sidebar panels.
export function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

function activateTab(tab) {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const sidebar = document.querySelector('.sidebar');

  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  panels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  sidebar.classList.toggle('code-tab-active', tab === 'code');
}

// Switch to the Code tab and scroll/highlight the code block(s) for a given node.
export function showCodeForNode(nodeId) {
  activateTab('code');

  const items = [...document.querySelectorAll('.code-block-item')].filter(
    (el) => el.dataset.nodeId === String(nodeId)
  );
  if (!items.length) return;

  items[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  items.forEach((item) => {
    item.classList.add('highlight');
    setTimeout(() => item.classList.remove('highlight'), 1500);
  });
}

// Render the meta section (Name, Author, Description) and header graph name.
export function renderMeta(data) {
  const meta = document.getElementById('meta-section');
  const headerName = document.getElementById('header-graph-name');

  const name = data.Name || 'Untitled Graph';
  const author = data.Author || '';
  const description = data.Description || '';

  headerName.textContent = name;

  meta.innerHTML = '';

  const nameEl = document.createElement('h2');
  nameEl.className = 'meta-name';
  nameEl.textContent = name;
  meta.appendChild(nameEl);

  if (author) {
    const row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = `<span class="meta-label">Author</span><span>${escapeHtml(author)}</span>`;
    meta.appendChild(row);
  }

  if (description) {
    const desc = document.createElement('div');
    desc.className = 'meta-desc';
    desc.textContent = description;
    meta.appendChild(desc);
  }
}

// Render stat cards: node count, connector count, python node count, dependency count.
export function renderStats(data) {
  const stats = document.getElementById('stats-section');
  const nodes = data.Nodes || [];
  const connectors = data.Connectors || [];
  const deps = data.NodeLibraryDependencies || [];

  const pythonCount = nodes.filter((n) => classifyNode(n) === 'python').length;

  const cards = [
    { label: 'Nodes', value: nodes.length },
    { label: 'Connectors', value: connectors.length },
    { label: 'Python Nodes', value: pythonCount },
    { label: 'Dependencies', value: deps.length },
  ];

  stats.innerHTML = '';
  cards.forEach((card) => {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `<div class="stat-value">${card.value}</div><div class="stat-label">${card.label}</div>`;
    stats.appendChild(el);
  });
}

// Render the legend of node types present in the file (Graph tab).
export function renderLegend(data) {
  const legend = document.getElementById('legend');
  const nodes = data.Nodes || [];
  const colors = getTypeColors();
  const labels = getTypeLabels();

  const counts = new Map();
  nodes.forEach((node) => {
    const type = classifyNode(node);
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  legend.innerHTML = '';

  if (counts.size === 0) {
    legend.innerHTML = '<div class="empty-msg">No nodes found.</div>';
    return;
  }

  // Order by count descending.
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  ordered.forEach(([type, count]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-swatch" style="background:${colors[type]}"></span>
      <span>${labels[type]}</span>
      <span class="legend-count">${count}</span>
    `;
    legend.appendChild(item);
  });
}

// Render the Code tab: Python/CodeBlock Code fields and HintPath values.
export function renderCode(data) {
  const container = document.getElementById('code-list');
  container.innerHTML = '';

  const nodes = data.Nodes || [];
  let count = 0;

  nodes.forEach((node) => {
    if (typeof node.Code === 'string' && node.Code.trim() !== '') {
      const type = classifyNode(node);
      const title = type === 'python' ? 'Python' : 'CodeBlock';
      container.appendChild(buildCodeItem(title, node.Code, node.Id));
      count++;
    }

    if (typeof node.HintPath === 'string' && node.HintPath.trim() !== '') {
      container.appendChild(buildCodeItem('File Path', node.HintPath, node.Id));
      count++;
    }
  });

  if (count === 0) {
    container.innerHTML = '<div class="empty-msg">No code blocks or file paths found.</div>';
  }
}

function buildCodeItem(title, code, nodeId) {
  const item = document.createElement('div');
  item.className = 'code-block-item';
  if (nodeId != null) item.dataset.nodeId = String(nodeId);

  const header = document.createElement('div');
  header.className = 'code-block-header';
  header.innerHTML = `<i class="ti ti-code"></i><span>${escapeHtml(title)}</span>`;

  const pre = document.createElement('pre');
  pre.textContent = code;

  item.appendChild(header);
  item.appendChild(pre);
  return item;
}

// Render the Deps tab: NodeLibraryDependencies (Name, Version, ReferenceType).
export function renderDeps(data) {
  const container = document.getElementById('deps-list');
  container.innerHTML = '';

  const deps = data.NodeLibraryDependencies || [];

  if (deps.length === 0) {
    container.innerHTML = '<div class="empty-msg">No dependencies found.</div>';
    return;
  }

  deps.forEach((dep) => {
    const item = document.createElement('div');
    item.className = 'dep-item';

    const name = document.createElement('div');
    name.className = 'dep-name';
    name.textContent = dep.Name || 'Unknown';

    const meta = document.createElement('div');
    meta.className = 'dep-meta';
    const parts = [];
    if (dep.Version) parts.push(`v${dep.Version}`);
    if (dep.ReferenceType) parts.push(dep.ReferenceType);
    meta.textContent = parts.join(' • ');

    item.appendChild(name);
    if (parts.length) item.appendChild(meta);
    container.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
