// Self-contained pan & zoom controller for a viewport/canvas pair.
export class PanZoom {
  constructor(viewport, canvas, opts = {}) {
    this.viewport = viewport;
    this.canvas = canvas;
    this.minScale = opts.minScale ?? 0.05;
    this.maxScale = opts.maxScale ?? 4;
    this.onChange = opts.onChange ?? (() => {});

    this.x = 0;
    this.y = 0;
    this.scale = 1;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._pointers = new Map();
    this._lastPinchDist = null;

    this._bindEvents();
    this._apply();
  }

  _bindEvents() {
    const vp = this.viewport;

    vp.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    vp.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // pinch-zoom gesture on trackpads is reported as ctrlKey wheel
      const delta = -e.deltaY * 0.01;
      this._zoomAt(cx, cy, Math.exp(delta));
    } else {
      const delta = -e.deltaY * 0.0015;
      this._zoomAt(cx, cy, Math.exp(delta));
    }
  }

  _onPointerDown(e) {
    this.viewport.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.viewport.classList.add('panning');
    } else if (this._pointers.size === 2) {
      this._dragging = false;
      this._lastPinchDist = this._pinchDistance();
    }
  }

  _onPointerMove(e) {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 2) {
      const dist = this._pinchDistance();
      const center = this._pinchCenter();
      const rect = this.viewport.getBoundingClientRect();
      const cx = center.x - rect.left;
      const cy = center.y - rect.top;

      if (this._lastPinchDist) {
        const factor = dist / this._lastPinchDist;
        this._zoomAt(cx, cy, factor);
      }
      this._lastPinchDist = dist;
      return;
    }

    if (this._dragging) {
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.x += dx;
      this.y += dy;
      this._apply();
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 0) {
      this._dragging = false;
      this.viewport.classList.remove('panning');
      this._lastPinchDist = null;
    } else if (this._pointers.size === 1) {
      this._lastPinchDist = null;
      const remaining = [...this._pointers.values()][0];
      this._dragging = true;
      this._lastX = remaining.x;
      this._lastY = remaining.y;
    }
  }

  _pinchDistance() {
    const pts = [...this._pointers.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  _pinchCenter() {
    const pts = [...this._pointers.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  // Zoom keeping the point (px, py) in viewport coordinates fixed on screen.
  _zoomAt(px, py, factor) {
    const newScale = this._clampScale(this.scale * factor);
    const actualFactor = newScale / this.scale;

    this.x = px - (px - this.x) * actualFactor;
    this.y = py - (py - this.y) * actualFactor;
    this.scale = newScale;
    this._apply();
  }

  _clampScale(scale) {
    return Math.min(this.maxScale, Math.max(this.minScale, scale));
  }

  setTransform(x, y, scale) {
    this.x = x;
    this.y = y;
    this.scale = this._clampScale(scale);
    this._apply();
  }

  zoomBy(factor) {
    const rect = this.viewport.getBoundingClientRect();
    this._zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  reset() {
    this.setTransform(0, 0, 1);
  }

  // Fit the given content bounding box (in canvas/content coordinates) into the viewport.
  fitToBounds(bounds, padding = 48) {
    const rect = this.viewport.getBoundingClientRect();
    const w = Math.max(bounds.width, 1);
    const h = Math.max(bounds.height, 1);

    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;

    const scale = this._clampScale(Math.min(availW / w, availH / h, this.maxScale));

    const x = padding + (availW - w * scale) / 2 - bounds.x * scale;
    const y = padding + (availH - h * scale) / 2 - bounds.y * scale;

    this.setTransform(x, y, scale);
  }

  _apply() {
    this.canvas.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
    this.onChange({ x: this.x, y: this.y, scale: this.scale });
  }
}
