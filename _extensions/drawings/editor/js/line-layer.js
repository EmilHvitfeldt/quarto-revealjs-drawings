// The editor's brush: solid colored lines on a plain Canvas 2D, drawn exactly
// the way the Quarto extension (../../drawings.js) draws them,
// so what you see here is what the slide plays.
//
// The Player (player.js) feeds it one point at a time, in order, and replays
// every stroke from zero whenever something changes, so this only ever has to
// add to what is already on the canvas. Classic script: everything shares one
// global scope and index.html loads the files in dependency order.

// Line half-width as a fraction of the drawing's height, at size 1. Width
// follows the square root of size. Keep in step with drawings.js.
const LINE_HALF_WIDTH = 0.0175;

function createLineLayer(options) {
  // The last point drawn for each stroke, so a stroke that overlaps another in
  // time (the editor lets you drag them around a timeline) connects to its own
  // previous point and not to the other stroke's.
  const lastPoints = new Map();

  function context() {
    return options.canvas()?.getContext("2d");
  }

  function resize() {
    const canvas = options.canvas();
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr);
    const { width, height } = options.size?.() ?? getShellViewportSize();
    const bufferWidth = Math.max(1, Math.round(width * dpr));
    const bufferHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    lastPoints.clear();
  }

  function clear() {
    const canvas = options.canvas();
    context()?.clearRect(0, 0, canvas.width, canvas.height);
    lastPoints.clear();
  }

  /** Draws one point of a stroke: a dot where it starts, a line from the previous point after that. */
  function draw(point) {
    const ctx = context();
    if (!ctx) return;

    const { r, g, b } = point.color;
    const color = `rgb(${r}, ${g}, ${b})`;
    const lineWidth = 2 * LINE_HALF_WIDTH * Math.sqrt(point.size > 0 ? point.size : 1) * (0.8 + point.pressure * 0.35) * ctx.canvas.height;
    const previous = point.isMove ? lastPoints.get(point.strokeKey) : undefined;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (previous) {
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPoints.set(point.strokeKey, { x: point.x, y: point.y });
  }

  // Nothing to simulate or flush: lines are on the canvas as soon as they are drawn.
  function advance() {}
  function present() {}
  function dispose() {
    lastPoints.clear();
  }

  return { advance, clear, dispose, draw, present, resize };
}
