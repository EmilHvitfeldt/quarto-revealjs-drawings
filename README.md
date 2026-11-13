# quarto-revealjs-drawings

A Quarto extension that plays saved drawings inside revealjs slides as solid colored lines, one fragment per click.

## Install

```bash
quarto add EmilHvitfeldt/quarto-revealjs-drawings
```

Or copy `_extensions/drawings/` into your deck's folder.

## Use

Turn the plugin on and put the shortcode on a slide:

```markdown
---
format: revealjs
revealjs-plugins:
  - drawings
---

## My slide

{{< drawing drawing.json >}}
```

A drawing is a `.json` file holding timed strokes (see below) and optional stopping points, called cues. Cues split the animation into segments: n cues make n + 1 segments, and each click plays the next one. Pressing next while a segment is still playing finishes it instantly instead of leaving the slide, and the following press moves on. Stepping back undraws smoothly to where the previous segment ended (about three times faster than it was drawn, and never longer than 1.5 seconds). You can change direction at any moment: going back or forward halfway through a segment redirects from what is on screen right now instead of jumping, and pressing next while it is undrawing starts drawing forward again from there. The segment that plays by itself (`auto=true`, or a drawing without cues) has no click of its own, so pressing back undraws it, whether it is still drawing or already finished, instead of leaving the slide. The next press draws it again, and a back on the blank slide moves to the previous slide as usual. Arriving on a slide by going back shows its drawing finished, as you left it, instead of drawing it again. Fragments of the drawing mix with the slide's other fragments in the order they appear.

Options, all optional:

- `auto="true"`: play the first segment as soon as the slide appears (so it needs one click less)
- `speed="1.5"`: playback speed
- `width="60%"`: any CSS width; the drawing keeps its 16:9 shape
- `wiggle="0.5"`: how hand-drawn the lines look. Each stroke drifts a little off true and its thickness varies slightly. `0` is perfectly smooth, `1` is the default, `2` is shakier. The wobble is seeded, so a drawing looks the same every time it plays

While a segment plays, the drawing has `data-playing="true"`.

The JSON is inlined into the page, so a deck with `embed-resources: true` stays a single file and works from `file://`. Printing to PDF (`?print-pdf`) draws every drawing finished. The canvas is transparent, so the slide's own background shows through.

Don't keep your drawings in a folder called `drawings` next to the deck: Quarto would mistake it for the plugin directory.

## Making drawings

`_extensions/drawings/editor/index.html` is a small editor for recording drawings. It installs with the extension, so once you have run `quarto add` it is in your project at `_extensions/drawings/editor/index.html`. Open it directly in a browser (or serve the folder), no build step or server needed. It draws solid colored lines, the same way the extension plays them, so what you see in the editor is what the slide shows.

- **Draw** (D): draw on the canvas. Every stroke is recorded with its position, pressure and timing, and the timeline plays while you draw.
- **Select** (V): click a stroke to change its color, size, start time or speed, drag it to move it, or delete or duplicate it. You can also click its clip in the timeline.
- **Curve** (C): reshape a stroke's path by dragging its anchors and handles.
- **Timeline**: drag a clip to retime a stroke, drag its right edge to stretch it, click the ruler to scrub.
- **Transport**: play/pause (Space), jump to start/end (Home/End), step a frame (arrows, Shift for one second), loop, 0.25x to 2x.
- **Cues**: press `+ Cue` (K) to drop a stopping point at the playhead. The extension pauses there and plays the next segment on the next click.
- **Tracing image**: choose, drop or paste an image to draw over. It is a view aid only and isn't saved.
- **Project**: undo/redo, and save or open a `.json` file. Save the file next to your deck and point `{{< drawing >}}` at it.

## Drawing format

```json
{
  "version": 1,
  "cues": [{ "ms": 2000 }],
  "strokes": [
    {
      "start": 0,
      "speed": 1,
      "size": 0.2,
      "color": { "r": 83, "g": 105, "b": 7 },
      "points": [{ "x": 0.1, "y": 0.08, "pressure": 0.58, "t": 0 }]
    }
  ]
}
```

`x` and `y` are fractions of the drawing (0 to 1), `t` is milliseconds since the stroke began, and `start` is when it begins on the timeline. Colors are drawn fully opaque (any `a` is ignored). Line width follows `size` and `pressure`. Files saved from the editor have exactly this shape. Files from other tools that carry extra fields (like brush types) work too: the extra fields are ignored and everything is drawn as plain lines.

## Example

`example/slides.qmd` is a small deck of four handwritten math equations, one per slide:

- `pythagoras`: no cues, plays through on its own (`auto=true`)
- `quadratic`: two cues, so three segments. The first plays by itself, then one click each for the square root and the denominator
- `euler`: two cues and no `auto`, so the slide starts blank and every click writes the next piece
- `sum`: two cues and a faster pen (`speed=1.5`)

Render it with `quarto render example/slides.qmd`.

For slides that keep a fixed size so a drawing always fits the frame, the [letterbox](https://github.com/EmilHvitfeldt/quarto-revealjs-letterbox) format works well with this extension.
