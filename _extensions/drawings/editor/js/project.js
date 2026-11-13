// The editor's document: a list of timed strokes, plus undo/redo.
//
// The canvas is never the source of truth: every change goes through this
// model and the Player (player.js) re-renders the canvas from it. A stroke looks like:
//   {
//     id: 3,
//     start: 1200,          // ms on the timeline when the stroke begins
//     speed: 1,             // playback rate of just this stroke (2 = twice as fast)
//     color: { r, g, b, name? },
//     size: 0.15,           // line thickness (width follows its square root)
//     points: [{ x, y, pressure, t }],  // x/y normalized to the stage (0..1),
//                                       // t = ms since the stroke began at speed 1
//   }
// Classic script: shares one global scope with the other files.

class Project {
  constructor() {
    this.strokes = [];
    this.nextId = 1;
    // Pause points for slides: [{ ms }], sorted. A Quarto revealjs fragment
    // plays the animation up to the next one (see drawings.js). They don't change
    // the picture, so editing them never re-renders and isn't part of undo.
    this.cues = [];
    this.undoStack = [];
    this.redoStack = [];
    this.lastCheckpointKey = null;
    this.lastCheckpointTime = 0;
    this.listeners = new Set();
  }

  /** fn(kind): "edit" when strokes changed (canvas needs re-rendering), "layout" when only the timeline needs a redraw. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(kind = "edit") {
    for (const listener of this.listeners) listener(kind);
  }

  get(id) {
    return this.strokes.find((stroke) => stroke.id === id);
  }

  static strokeEnd(stroke) {
    const last = stroke.points[stroke.points.length - 1];
    return stroke.start + (last ? last.t : 0) / stroke.speed;
  }

  get endMs() {
    return this.strokes.reduce((end, stroke) => Math.max(end, Project.strokeEnd(stroke)), 0);
  }

  /**
   * Saves an undo point. Repeated calls with the same key inside 800ms (a
   * slider being dragged) share one point, so one drag is one undo step.
   */
  checkpoint(key) {
    const now = performance.now();
    if (key && key === this.lastCheckpointKey && now - this.lastCheckpointTime < 800) {
      this.lastCheckpointTime = now;
      return;
    }
    this.lastCheckpointKey = key ?? null;
    this.lastCheckpointTime = now;
    this.undoStack.push(structuredClone(this.strokes));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** `silent` skips the event, for strokes still being drawn or dragged. `after` is the id of the stroke to insert behind (default: the end). */
  add(stroke, { silent = false, after } = {}) {
    stroke.id ??= this.nextId++;
    const index = after === undefined ? -1 : this.strokes.findIndex((other) => other.id === after);
    if (index === -1) this.strokes.push(stroke);
    else this.strokes.splice(index + 1, 0, stroke);
    if (!silent) this.emit("edit");
    return stroke;
  }

  remove(id) {
    this.strokes = this.strokes.filter((stroke) => stroke.id !== id);
    this.emit("edit");
  }

  update(id, patch, { silent = false } = {}) {
    const stroke = this.get(id);
    if (!stroke) return;
    Object.assign(stroke, patch);
    if (!silent) this.emit("edit");
  }

  clear() {
    this.strokes = [];
    this.emit("edit");
  }

  /** Adds a cue at `ms` (ignored if one is already within 20ms). Returns whether it was added. */
  addCue(ms) {
    const at = Math.round(ms);
    if (at <= 0 || this.cues.some((cue) => Math.abs(cue.ms - at) < 20)) return false;
    this.cues.push({ ms: at });
    this.cues.sort((a, b) => a.ms - b.ms);
    this.emit("layout");
    return true;
  }

  removeCue(cue) {
    this.cues = this.cues.filter((other) => other !== cue);
    this.emit("layout");
  }

  /**
   * Rewrites timing so it runs `factor` times as fast (2 = half the duration).
   * With no `strokes` it covers the whole project: start times, recorded point
   * times and cues all shrink. With a subset, only those strokes change and the
   * group keeps its earliest start where it is. Per-stroke speed is left alone.
   * Callers checkpoint first.
   */
  scaleTime(factor, strokes = null) {
    if (!(factor > 0) || factor === 1) return;
    const targets = strokes ?? this.strokes;
    const pivot = strokes ? Math.min(...targets.map((stroke) => stroke.start)) : 0;
    for (const stroke of targets) {
      stroke.start = pivot + (stroke.start - pivot) / factor;
      for (const point of stroke.points) point.t /= factor;
    }
    if (!strokes) this.cues = this.cues.map((cue) => ({ ms: Math.max(1, Math.round(cue.ms / factor)) }));
    this.emit("edit");
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(structuredClone(this.strokes));
    this.strokes = this.undoStack.pop();
    this.lastCheckpointKey = null;
    this.emit("edit");
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(structuredClone(this.strokes));
    this.strokes = this.redoStack.pop();
    this.lastCheckpointKey = null;
    this.emit("edit");
  }

  toJSON() {
    return { version: 1, cues: this.cues, strokes: this.strokes };
  }

  /**
   * Accepts a saved project, or the bare stroke array the old "Download
   * recording" button produced (no start times: laid end to end).
   */
  load(data) {
    const incoming = Array.isArray(data) ? data : data?.strokes;
    if (!Array.isArray(incoming)) throw new Error("Not a saved drawing.");

    let cursor = 0;
    const strokes = incoming
      .filter((stroke) => Array.isArray(stroke?.points) && stroke.points.length > 0)
      .map((stroke) => {
        const loaded = {
          id: undefined,
          start: Number.isFinite(stroke.start) ? stroke.start : cursor,
          speed: stroke.speed > 0 ? stroke.speed : 1,
          color: stroke.color ?? penColors[0],
          size: stroke.size > 0 ? stroke.size : 1,
          points: stroke.points.map((point) => ({
            x: point.x,
            y: point.y,
            pressure: point.pressure > 0 ? point.pressure : 0.58,
            t: point.t ?? 0,
          })),
        };
        cursor = Project.strokeEnd(loaded) + 300;
        return loaded;
      });

    this.checkpoint();
    this.cues = Array.isArray(data) || !Array.isArray(data.cues)
      ? []
      : data.cues.filter((cue) => cue?.ms > 0).map((cue) => ({ ms: cue.ms })).sort((a, b) => a.ms - b.ms);
    this.strokes = [];
    for (const stroke of strokes) this.add(stroke, { silent: true });
    this.emit("edit");
  }
}
