// Plays a saved drawing inside a Quarto revealjs deck as solid colored lines,
// one fragment at a time.
//
// The Quarto shortcode (see drawings.lua) writes, per drawing, a `.drawing` div
// holding the drawing JSON, followed by one empty `.fragment.drawing-step` per
// segment. A drawing with cues at 2s and 5s has three segments: 0 to 2s, 2s to
// 5s, and 5s to the end. Showing a fragment plays the next segment; hiding it
// jumps back to where the previous one ended.
//
// A drawing is a list of timed strokes:
//   { start, speed, color: { r, g, b }, size, points: [{ x, y, pressure, t }] }
// x and y are fractions of the drawing (0..1), t is ms since the stroke began.
// The picture at any moment is a pure function of the time, so seeking,
// stepping back and resizing all just redraw from the strokes.

(() => {
  const MIN_LENGTH_MS = 500;
  const MAX_DPR = 2;
  const MAX_WIDTH_PX = 2560;
  // Reveal's pdf-ready layout and window resizes both settle over a few frames.
  const RESIZE_DELAY_MS = 150;
  // Line half-width as a fraction of the drawing's height, at size 1. Width
  // follows the square root of size, so big strokes get a bit thicker, not huge.
  const HALF_WIDTH = 0.0175;
  const DEFAULT_PRESSURE = 0.58;

  const STYLE = `
.drawing { position: relative; isolation: isolate; width: 100%; aspect-ratio: 16 / 9; margin: 0 auto; }
.drawing canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; margin: 0; pointer-events: none; }
.drawing-step { position: absolute; width: 0; height: 0; overflow: hidden; }
.drawing-error { padding: 1em; border: 2px dashed #b3261e; color: #b3261e; font-size: 0.6em; }
`;

  function loadStrokes(data) {
    const incoming = Array.isArray(data) ? data : data?.strokes;
    if (!Array.isArray(incoming)) throw new Error("not a saved drawing");

    let cursor = 0;
    const strokes = [];
    for (const raw of incoming) {
      if (!Array.isArray(raw?.points) || raw.points.length === 0) continue;
      const stroke = {
        start: Number.isFinite(raw.start) ? raw.start : cursor,
        speed: raw.speed > 0 ? raw.speed : 1,
        size: raw.size > 0 ? raw.size : 1,
        color: raw.color ?? { r: 30, g: 30, b: 30 },
        points: raw.points.map((point) => ({
          x: point.x,
          y: point.y,
          pressure: point.pressure > 0 ? point.pressure : DEFAULT_PRESSURE,
          t: point.t ?? 0,
        })),
      };
      stroke.end = stroke.start + stroke.points[stroke.points.length - 1].t / stroke.speed;
      cursor = stroke.end + 300;
      strokes.push(stroke);
    }

    const cues = Array.isArray(data) || !Array.isArray(data.cues)
      ? []
      : data.cues.filter((cue) => cue?.ms > 0).map((cue) => cue.ms).sort((a, b) => a - b);
    return { strokes, cues };
  }

  class DrawingEmbed {
    constructor(root, deck) {
      this.root = root;
      this.deck = deck;
      this.auto = root.dataset.auto === "true";
      this.speed = Number(root.dataset.speed) > 0 ? Number(root.dataset.speed) : 1;
      this.active = false;
      // How many segments have finished: 0 is the blank start.
      this.done = 0;
      this.nowMs = 0;
      this.target = 0;
      this.frame = 0;
      this.lastFrameTime = 0;
      this.sizeKey = "";
      this.tick = this.tick.bind(this);

      const { strokes, cues } = loadStrokes(JSON.parse(root.querySelector("script.drawing-data").textContent));
      this.strokes = strokes;
      this.cues = cues;
      this.endMs = strokes.reduce((end, stroke) => Math.max(end, stroke.end), 0);

      this.canvas = document.createElement("canvas");
      root.append(this.canvas);
      this.ctx = this.canvas.getContext("2d");
    }

    /** The time each segment ends at, starting with 0. */
    get times() {
      const end = Math.max(this.endMs, MIN_LENGTH_MS, ...this.cues);
      return [0, ...this.cues, end];
    }

    get slide() {
      return this.root.closest("section");
    }

    /** Fragments of this drawing already shown, plus the first segment when it plays by itself. */
    get segmentsDone() {
      const shown = this.slide.querySelectorAll(`.drawing-step[data-drawing="${this.root.id}"].visible`).length;
      return shown + (this.auto ? 1 : 0);
    }

    /** Pixels to render at: the layout size times how much reveal scales the slide up, so a projector gets sharp lines. */
    renderSize() {
      const width = Math.max(1, this.root.clientWidth);
      const height = Math.max(1, this.root.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const scale = Math.max(1, Math.min(this.deck.getScale?.() ?? 1, 3, MAX_WIDTH_PX / (width * dpr)));
      return { width: Math.round(width * scale), height: Math.round(height * scale) };
    }

    /** Draws everything that has happened by `ms`. */
    render(ms) {
      this.nowMs = ms;
      const { width, height } = this.canvas;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const stroke of this.strokes) {
        // A stroke that hasn't begun yet leaves nothing, not even its first dot.
        if (stroke.start >= ms) continue;
        const { r, g, b } = stroke.color;
        const color = `rgb(${r}, ${g}, ${b})`;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        let previous = null;
        for (const point of stroke.points) {
          if (stroke.start + point.t / stroke.speed > ms) break;
          const x = point.x * width;
          const y = point.y * height;
          const lineWidth = 2 * HALF_WIDTH * Math.sqrt(stroke.size) * (0.8 + point.pressure * 0.35) * height;
          if (previous) {
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(x, y);
            ctx.stroke();
          } else {
            // A lone point still leaves a dot.
            ctx.beginPath();
            ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          previous = { x, y };
        }
      }
    }

    layout() {
      const size = this.renderSize();
      this.sizeKey = `${size.width}x${size.height}`;
      this.canvas.width = size.width;
      this.canvas.height = size.height;
    }

    /** Entered the slide: show where the fragments say we are. A drawing that plays by itself starts now. */
    enter() {
      const done = this.segmentsDone;
      this.active = true;
      this.layout();
      this.goTo(done, false);
      if (this.auto && done === 1) {
        this.goTo(0, false);
        this.goTo(1, true);
      }
    }

    leave() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.root.dataset.playing = "false";
      this.active = false;
    }

    /** The slide scaled or the window resized: redraw sharp at the same moment, unless the size didn't really change. */
    relayout() {
      if (!this.active) return;
      const size = this.renderSize();
      if (this.sizeKey === `${size.width}x${size.height}`) return;
      this.layout();
      this.render(this.nowMs);
    }

    /** Moves to the end of segment `done`: plays there when `animate` and it is ahead, otherwise jumps. */
    goTo(done, animate) {
      const times = this.times;
      this.done = Math.max(0, Math.min(done, times.length - 1));
      if (!this.active) return;

      const ms = times[this.done];
      if (animate && ms > this.nowMs) {
        this.target = ms;
        if (!this.frame) {
          this.lastFrameTime = 0;
          this.frame = requestAnimationFrame(this.tick);
          this.root.dataset.playing = "true";
        }
      } else {
        this.stop();
        this.render(ms);
      }
    }

    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.root.dataset.playing = "false";
    }

    get isPlaying() {
      return this.frame !== 0;
    }

    /** Jumps to the end of the segment that is playing. */
    finish() {
      this.stop();
      this.render(this.target);
    }

    tick(time) {
      this.frame = 0;
      const dtMs = this.lastFrameTime ? Math.min(time - this.lastFrameTime, 100) : 1000 / 60;
      this.lastFrameTime = time;

      const next = Math.min(this.nowMs + dtMs * this.speed, this.target);
      this.render(next);
      if (this.target - next > 0.5) {
        this.frame = requestAnimationFrame(this.tick);
      } else {
        this.render(this.target);
        this.root.dataset.playing = "false";
      }
    }

    /** A fragment of this drawing was shown or hidden. */
    fragmentChanged(shown) {
      this.goTo(this.segmentsDone, shown);
    }
  }

  window.RevealDrawings = () => ({
    id: "RevealDrawings",
    init(deck) {
      const style = document.createElement("style");
      style.textContent = STYLE;
      document.head.append(style);

      const embeds = [];
      for (const root of deck.getRevealElement().querySelectorAll(".drawing")) {
        try {
          embeds.push(new DrawingEmbed(root, deck));
        } catch (error) {
          root.className = "drawing-error";
          root.textContent = `Could not load the drawing: ${error.message}`;
        }
      }
      if (embeds.length === 0) return;

      const forStep = (fragment) => embeds.find((embed) => embed.root.id === fragment.dataset.drawing);

      function showSlide(slide) {
        for (const embed of embeds) {
          if (embed.slide === slide) embed.enter();
          else if (embed.active) embed.leave();
        }
      }

      // Printing lays every slide out at once; that is handled at pdf-ready below.
      const printing = deck.isPrintView?.() || /print-pdf/i.test(window.location.search);
      deck.on("ready", (event) => {
        if (!printing) showSlide(event.currentSlide);
      });
      deck.on("slidechanged", (event) => showSlide(event.currentSlide));

      const onFragments = (shown) => (event) => {
        for (const fragment of event.fragments ?? []) {
          if (fragment.classList.contains("drawing-step")) forStep(fragment)?.fragmentChanged(shown);
        }
      };
      deck.on("fragmentshown", onFragments(true));
      deck.on("fragmenthidden", onFragments(false));

      // Next while a drawing is still playing finishes it first, and only the
      // following press moves on. Capture phase runs before Reveal's handlers.
      const finishPlaying = () => {
        const playing = embeds.filter((embed) => embed.active && embed.isPlaying);
        playing.forEach((embed) => embed.finish());
        return playing.length > 0;
      };
      const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "n", "N"]);
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (!NEXT_KEYS.has(event.key) || (event.key === " " && event.shiftKey)) return;
          if (finishPlaying()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true
      );
      deck.getRevealElement().addEventListener(
        "click",
        (event) => {
          if (!event.target.closest?.(".navigate-right, .navigate-down")) return;
          if (finishPlaying()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true
      );

      let resizeTimer = 0;
      deck.on("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => embeds.forEach((embed) => embed.relayout()), RESIZE_DELAY_MS);
      });

      // Printing to PDF lays every slide out at once. Draw each one finished.
      deck.on("pdf-ready", () => {
        for (const embed of embeds) {
          embed.active = true;
          embed.layout();
          embed.render(embed.times[embed.times.length - 1]);
        }
      });
    },
  });
})();
