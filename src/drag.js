// Lets nodes and annotation groups be dragged around the canvas. Pointer
// events on draggable elements are stopped before they reach the PanZoom
// viewport, so dragging empty canvas still pans.
export class DragController {
  constructor(nodesLayer, annotationsLayer, opts = {}) {
    this.getGraph = opts.getGraph ?? (() => null);
    this.getScale = opts.getScale ?? (() => 1);
    this.onDragEnd = opts.onDragEnd ?? (() => {});

    this._drag = null;
    this._dragThreshold = 4;
    this._suppressClick = false;
    this._topZ = 1;

    nodesLayer.addEventListener('pointerdown', (e) => this._onNodePointerDown(e));
    annotationsLayer.addEventListener('pointerdown', (e) => this._onAnnotationPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this._onPointerUp(e));

    // Swallow the click that follows a drag so it doesn't open the Code tab.
    window.addEventListener(
      'click',
      (e) => {
        if (this._suppressClick) {
          e.stopPropagation();
          e.preventDefault();
          this._suppressClick = false;
        }
      },
      true
    );
  }

  _onNodePointerDown(e) {
    const graph = this.getGraph();
    const el = e.target.closest('.dyn-node');
    if (!graph || !el || e.button !== 0) return;

    const id = [...graph.nodes.entries()].find(([, n]) => n.el === el)?.[0];
    if (id === undefined) return;

    el.style.zIndex = String(++this._topZ);
    this._start(e, el, (dx, dy) => graph.moveNodes([id], dx, dy));
  }

  _onAnnotationPointerDown(e) {
    const graph = this.getGraph();
    const el = e.target.closest('.dyn-annotation');
    if (!graph || !el || e.button !== 0) return;

    const annotation = graph.annotations.find((a) => a.el === el);
    if (!annotation) return;

    this._start(e, el, (dx, dy) => graph.moveAnnotation(annotation, dx, dy));
  }

  _start(e, el, move) {
    e.stopPropagation();
    this._drag = {
      pointerId: e.pointerId,
      el,
      move,
      downX: e.clientX,
      downY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      active: false,
    };
  }

  _onPointerMove(e) {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (!drag.active) {
      const dist = Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY);
      if (dist < this._dragThreshold) return;
      drag.active = true;
      drag.el.setPointerCapture(e.pointerId);
      drag.el.classList.add('dragging');
    }

    const scale = this.getScale();
    const dx = (e.clientX - drag.lastX) / scale;
    const dy = (e.clientY - drag.lastY) / scale;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.move(dx, dy);
  }

  _onPointerUp(e) {
    const drag = this._drag;
    if (!drag || e.pointerId !== drag.pointerId) return;

    this._drag = null;
    if (drag.active) {
      drag.el.classList.remove('dragging');
      this._suppressClick = true;
      // The click (if any) fires synchronously after pointerup; clear the flag
      // afterwards in case no click follows (e.g. pointer released elsewhere).
      setTimeout(() => {
        this._suppressClick = false;
      }, 0);
      this.onDragEnd();
    }
  }
}
