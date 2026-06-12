// Node classification, label resolution, and rendering helpers.

const TYPE_COLORS = {
  python: '#3b82f6',
  codeblock: '#22c55e',
  watch: '#f59e0b',
  selection: '#ec4899',
  elements: '#a78bfa',
  filename: '#14b8a6',
  input: '#fb923c',
  function: '#475569',
};

const TYPE_LABELS = {
  python: 'Python',
  codeblock: 'Code Block',
  watch: 'Watch',
  selection: 'Selection',
  elements: 'Elements',
  filename: 'File / Path',
  input: 'Input',
  function: 'Function',
};

const GENERIC_NICKNAMES = new Set(['Function', 'DSFunction', 'DSVarArgFunction']);

export function getTypeColors() {
  return TYPE_COLORS;
}

export function getTypeLabels() {
  return TYPE_LABELS;
}

// Classify a node based on its ConcreteType / FunctionSignature.
export function classifyNode(node) {
  const concrete = node.ConcreteType || '';
  const sig = node.FunctionSignature || '';

  if (concrete.includes('Python')) return 'python';
  if (concrete.includes('CodeBlock')) return 'codeblock';
  if (concrete.includes('Watch')) return 'watch';
  if (concrete.includes('Selection') || concrete.includes('ModelElement')) return 'selection';
  if (concrete.includes('Categories') || concrete.includes('ElementsOf')) return 'elements';
  if (concrete.includes('Filename') || concrete.includes('FileSystem')) return 'filename';
  if (
    sig.includes('.Input.') ||
    concrete.includes('StringInput') ||
    concrete.includes('BoolSelector') ||
    concrete.includes('IntegerSlider') ||
    concrete.includes('DoubleSlider')
  ) {
    return 'input';
  }
  return 'function';
}

// Strip a `,assembly` suffix and return the last `.`-delimited segment.
function shortConcreteType(concrete) {
  const withoutAssembly = concrete.split(',')[0];
  const segments = withoutAssembly.split('.');
  return segments[segments.length - 1];
}

// Resolve the display label (and optional subtitle) for a node.
export function resolveLabel(node) {
  const nick = node.NickName;
  if (nick && !GENERIC_NICKNAMES.has(nick)) {
    return { label: nick, subtitle: null };
  }

  const sig = node.FunctionSignature;
  if (sig) {
    const withoutArgs = sig.split('@')[0];
    const segments = withoutArgs.split('.');
    const label = segments[segments.length - 1];
    const subtitleSegments = segments.slice(0, -1).slice(-2);
    const subtitle = subtitleSegments.length ? subtitleSegments.join('.') : null;
    return { label, subtitle };
  }

  const concrete = node.ConcreteType;
  if (concrete) {
    const short = shortConcreteType(concrete);
    if (short !== 'DSFunction' && short !== 'DSVarArgFunction') {
      return { label: short, subtitle: null };
    }
  }

  if (node.Name) {
    return { label: node.Name, subtitle: null };
  }

  return { label: 'Node', subtitle: null };
}

// Build the DOM element representing a single node.
export function createNodeElement(node) {
  const type = classifyNode(node);
  const color = TYPE_COLORS[type];
  const { label, subtitle } = resolveLabel(node);

  const el = document.createElement('div');
  el.className = 'dyn-node';
  el.style.borderLeftColor = color;
  el.dataset.nodeId = node.Id;
  el.dataset.nodeType = type;

  const body = document.createElement('div');
  body.className = 'dyn-node-body';

  const labelEl = document.createElement('div');
  labelEl.className = 'dyn-node-label';
  labelEl.textContent = label;
  body.appendChild(labelEl);

  if (subtitle) {
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'dyn-node-subtitle';
    subtitleEl.textContent = subtitle;
    body.appendChild(subtitleEl);
  }

  const ports = document.createElement('div');
  ports.className = 'dyn-node-ports';

  const inputsCol = document.createElement('div');
  inputsCol.className = 'port-col inputs';
  (node.Inputs || []).forEach((input) => {
    inputsCol.appendChild(createPortElement(input, 'input'));
  });

  const outputsCol = document.createElement('div');
  outputsCol.className = 'port-col outputs';
  (node.Outputs || []).forEach((output) => {
    outputsCol.appendChild(createPortElement(output, 'output'));
  });

  ports.appendChild(inputsCol);
  ports.appendChild(outputsCol);
  body.appendChild(ports);

  el.appendChild(body);

  if (typeof node.Code === 'string' && node.Code.trim() !== '') {
    attachCodeTooltip(el, node.Code);
  }

  return el;
}

// Shared tooltip element used to preview code on hover.
let tooltipEl = null;

function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'code-tooltip';
    const pre = document.createElement('pre');
    tooltipEl.appendChild(pre);
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

// Show the node's Code in a floating tooltip while hovering over it.
function attachCodeTooltip(el, code) {
  el.addEventListener('mouseenter', () => {
    const tooltip = getTooltip();
    tooltip.querySelector('pre').textContent = code;
    tooltip.classList.add('visible');
    positionTooltip(tooltip, el);
  });

  el.addEventListener('mousemove', () => {
    const tooltip = getTooltip();
    if (tooltip.classList.contains('visible')) {
      positionTooltip(tooltip, el);
    }
  });

  el.addEventListener('mouseleave', () => {
    getTooltip().classList.remove('visible');
  });
}

function positionTooltip(tooltip, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;

  let left = rect.right + margin;
  let top = rect.top;

  const tooltipRect = tooltip.getBoundingClientRect();
  if (left + tooltipRect.width > window.innerWidth) {
    left = rect.left - tooltipRect.width - margin;
  }
  if (left < 0) left = margin;

  if (top + tooltipRect.height > window.innerHeight) {
    top = window.innerHeight - tooltipRect.height - margin;
  }
  if (top < 0) top = margin;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function createPortElement(port, kind) {
  const portEl = document.createElement('div');
  portEl.className = 'port';
  portEl.dataset.portId = port.Id;

  const dot = document.createElement('div');
  dot.className = `port-dot ${kind}`;

  const name = document.createElement('span');
  name.textContent = port.Name || '';

  portEl.appendChild(dot);
  portEl.appendChild(name);
  return portEl;
}
