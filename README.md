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

A drawing is a `.json` file holding timed strokes (see below) and optional cues. Cues split the animation into segments: n cues make n + 1 segments, and each click plays the next one. Pressing next while a segment is still playing finishes it instantly instead of leaving the slide, and the following press moves on. Stepping back jumps to where the previous segment ended. Fragments of the drawing mix with the slide's other fragments in the order they appear.

Options, all optional:

- `auto="true"`: play the first segment as soon as the slide appears (so it needs one click less)
- `speed="1.5"`: playback speed
- `width="60%"`: any CSS width; the drawing keeps its 16:9 shape

While a segment plays, the drawing has `data-playing="true"`.

The JSON is inlined into the page, so a deck with `embed-resources: true` stays a single file and works from `file://`. Printing to PDF (`?print-pdf`) draws every drawing finished. The canvas is transparent, so the slide's own background shows through.

Don't keep your drawings in a folder called `drawings` next to the deck: Quarto would mistake it for the plugin directory.

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

`x` and `y` are fractions of the drawing (0 to 1), `t` is milliseconds since the stroke began, and `start` is when it begins on the timeline. Colors are drawn fully opaque (any `a` is ignored). Line width follows `size` and `pressure`. Files saved from the watercolor drawing studio work as they are, with the watercolor brush types drawn as plain lines.

## Example

`example/slides.qmd` is a small deck using all of this. It uses the [letterbox](https://github.com/EmilHvitfeldt/quarto-revealjs-letterbox) format (`example/_extensions/letterbox/` is a copy, only needed for the example), which keeps the slide at a fixed size so the drawings always fit. Render it with `quarto render example/slides.qmd`.
