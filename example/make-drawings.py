#!/usr/bin/env python3
"""Writes the example drawings in data/: math equations "handwritten" with a tiny
stroke font, so the example deck has something to play without needing an editor.

Run it from anywhere: python3 example/make-drawings.py

Units: layout is in "height units" (1 = the height of the drawing); x is divided by
16/9 on the way out because saved points are fractions of the drawing's width.
"""
import json
import math
import random
from pathlib import Path

ASPECT = 16 / 9
OUT = Path(__file__).resolve().parent / "data"

INK = dict(r=40, g=42, b=52)
BLUE = dict(r=46, g=111, b=189)
RED = dict(r=200, g=60, b=50)
GREEN = dict(r=53, g=130, b=80)
COLORS = dict(ink=INK, blue=BLUE, red=RED, green=GREEN)

PEN_SIZE = 0.1
# How fast the pen moves, in drawing heights per second, and the pauses between strokes.
PEN_SPEED = 0.55
STROKE_GAP_MS = 130
# Hand wobble, in drawing heights: slow drift along each stroke, plus a fine tremor.
WOBBLE = 0.0028
TREMOR = 0.00025
CUE_GAP_MS = 450

# Glyphs: (width in units of the glyph height, strokes). Points are (x, y) in a
# 0..1 box (y down, baseline at 1, x-height starts at 0.35). A stroke is a smooth
# curve through its points, or ("L", points) for straight segments with corners.
L = "L"
GLYPHS = {
    "0": (0.55, [[(0.5, 0), (0.1, 0.2), (0.05, 0.5), (0.1, 0.8), (0.5, 1), (0.9, 0.8), (0.95, 0.5), (0.9, 0.2), (0.5, 0)]]),
    "1": (0.4, [(L, [(0.1, 0.22), (0.6, 0), (0.6, 1)])]),
    "2": (0.55, [[(0.1, 0.2), (0.4, 0), (0.8, 0.15), (0.75, 0.45), (0.1, 1)], (L, [(0.1, 1), (0.95, 1)])]),
    "4": (0.6, [(L, [(0.7, 1), (0.7, 0), (0.05, 0.7), (0.95, 0.7)])]),
    "a": (0.6, [[(0.85, 0.45), (0.5, 0.35), (0.15, 0.55), (0.15, 0.85), (0.5, 1), (0.85, 0.85)], [(0.85, 0.35), (0.85, 1)]]),
    "b": (0.6, [[(0.15, 0), (0.15, 1)], [(0.15, 0.6), (0.5, 0.35), (0.85, 0.55), (0.85, 0.85), (0.5, 1), (0.15, 0.9)]]),
    "c": (0.55, [[(0.85, 0.5), (0.5, 0.35), (0.15, 0.6), (0.15, 0.8), (0.5, 1), (0.85, 0.9)]]),
    "e": (0.6, [[(0.1, 0.7), (0.9, 0.7), (0.85, 0.45), (0.5, 0.35), (0.15, 0.55), (0.15, 0.85), (0.5, 1), (0.85, 0.9)]]),
    "i": (0.3, [[(0.5, 0.4), (0.5, 1)], [(0.5, 0.1), (0.5, 0.14)]]),
    "k": (0.6, [[(0.15, 0), (0.15, 1)], (L, [(0.85, 0.35), (0.15, 0.7)]), (L, [(0.4, 0.62), (0.85, 1)])]),
    "n": (0.6, [[(0.15, 0.35), (0.15, 1)], [(0.15, 0.55), (0.5, 0.35), (0.85, 0.55), (0.85, 1)]]),
    "x": (0.6, [(L, [(0.1, 0.35), (0.9, 1)]), (L, [(0.9, 0.35), (0.1, 1)])]),
    "π": (0.7, [[(0.05, 0.4), (0.5, 0.34), (0.95, 0.4)], [(0.3, 0.4), (0.28, 1)], [(0.7, 0.4), (0.72, 1)]]),
    "+": (0.6, [(L, [(0.1, 0.675), (0.9, 0.675)]), (L, [(0.5, 0.4), (0.5, 0.95)])]),
    "−": (0.6, [(L, [(0.1, 0.675), (0.9, 0.675)])]),
    "=": (0.6, [(L, [(0.1, 0.55), (0.9, 0.55)]), (L, [(0.1, 0.8), (0.9, 0.8)])]),
    "±": (0.6, [(L, [(0.1, 0.55), (0.9, 0.55)]), (L, [(0.5, 0.28), (0.5, 0.82)]), (L, [(0.1, 1), (0.9, 1)])]),
    "(": (0.3, [[(0.7, -0.05), (0.3, 0.3), (0.3, 0.7), (0.7, 1.05)]]),
    ")": (0.3, [[(0.3, -0.05), (0.7, 0.3), (0.7, 0.7), (0.3, 1.05)]]),
    "Σ": (0.7, [(L, [(0.9, 0), (0.1, 0), (0.55, 0.5), (0.1, 1), (0.9, 1)])]),
    " ": (0.25, []),
}
GAP = 0.18  # space after each glyph, in glyph heights


def catmull_rom(points, step):
    """Samples a smooth curve through `points`, about `step` apart."""
    if len(points) == 2:
        return polyline(points, step)
    pts = [points[0], *points, points[-1]]
    out = [points[0]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        count = max(2, int(math.dist(p1, p2) / step))
        for k in range(1, count + 1):
            t = k / count
            out.append(tuple(
                0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
                       + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3)
                for j in range(2)))
    return out


def polyline(points, step):
    out = [points[0]]
    for a, b in zip(points, points[1:]):
        count = max(1, int(math.dist(a, b) / step))
        for k in range(1, count + 1):
            t = k / count
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


class Layout:
    """Places glyph strokes. Tokens are characters or tuples:
    ("sup", text), ("sqrt", tokens), ("frac", num, den), ("sum",), ("col", name),
    ("cue",), ("mark", name)."""

    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.strokes = []  # {"points": [(x, y)], "color": dict}
        self.cues = []  # number of strokes drawn before each cue
        self.marks = {}
        self.color = INK

    def add(self, points):
        self.strokes.append({"points": points, "color": self.color})

    def glyph(self, char, x, base, h):
        width, strokes = GLYPHS[char]
        angle = math.radians(self.rng.uniform(-2.5, 2.5))
        scale = self.rng.uniform(0.97, 1.04)
        dx, dy = self.rng.uniform(-0.01, 0.01) * h, self.rng.uniform(-0.012, 0.012) * h
        cx, cy = x + width * h / 2, base - h / 2

        def place(point):
            px = x + point[0] * width * h
            py = base - (1 - point[1]) * h
            px, py = (px - cx) * scale, (py - cy) * scale
            return (cx + px * math.cos(angle) - py * math.sin(angle) + dx,
                    cy + px * math.sin(angle) + py * math.cos(angle) + dy)

        step = 0.006
        for stroke in strokes:
            if stroke and stroke[0] == L:
                pts = polyline([place(p) for p in stroke[1]], step)
            else:
                pts = catmull_rom([place(p) for p in stroke], step)
            self.add(pts)

    def put(self, tokens, x, base, h, dry=False):
        """Lays tokens out left to right from x on `base`. Returns the x it ended at. A dry run only measures."""
        for token in tokens:
            if isinstance(token, str):
                width, _ = GLYPHS[token]
                if not dry:
                    self.glyph(token, x, base, h)
                x += (width + GAP) * h
                continue
            kind = token[0]
            if kind == "col":
                self.color = COLORS[token[1]]
            elif kind == "cue":
                if not dry:
                    self.cues.append(len(self.strokes))
            elif kind == "mark":
                if not dry:
                    self.marks[token[1]] = x
            elif kind == "sup":
                x = self.put(list(token[1]), x, base - 0.55 * h, 0.55 * h, dry)
            elif kind == "sqrt":
                inner = self.measure(token[1], h)
                top = 1.28  # the bar sits this many heights above the baseline
                if not dry:
                    self.add(polyline([(x, base - 0.4 * h), (x + 0.1 * h, base - 0.45 * h), (x + 0.28 * h, base),
                                       (x + 0.5 * h, base - top * h), (x + 0.6 * h + inner + 0.1 * h, base - top * h)], 0.006))
                x = self.put(token[1], x + 0.6 * h, base, h, dry) + 0.1 * h
            elif kind == "frac":
                axis = base - 0.325 * h
                num_w, den_w = self.measure(token[1], h), self.measure(token[2], h)
                width = max(num_w, den_w) + 0.3 * h
                self.put(token[1], x + (width - num_w) / 2, axis - 0.45 * h, h, dry)
                if not dry:
                    self.add(polyline([(x, axis), (x + width, axis)], 0.006))
                self.put(token[2], x + (width - den_w) / 2, axis + 1.15 * h, h, dry)
                x += width + GAP * h
            elif kind == "sum":
                axis = base - 0.325 * h
                big = 1.3 * h
                width = (GLYPHS["Σ"][0] + GAP) * big
                if not dry:
                    self.glyph("Σ", x, axis + 0.5 * big, big)
                top_w = self.measure(token[1], 0.5 * h)
                bottom_w = self.measure(token[2], 0.5 * h)
                span = max(width, top_w, bottom_w)
                self.put(token[1], x + (span - top_w) / 2, axis - 0.5 * big - 0.12 * h, 0.5 * h, dry)
                self.put(token[2], x + (span - bottom_w) / 2, axis + 0.5 * big + 0.12 * h + 0.5 * h, 0.5 * h, dry)
                x += span + GAP * h
        return x

    def measure(self, tokens, h):
        return self.put(tokens, 0, 0, h, dry=True)

    def box(self, left, right, top, bottom, pad):
        self.add(polyline([(left - pad, top - pad), (right + pad, top - pad), (right + pad, bottom + pad),
                           (left - pad, bottom + pad), (left - pad, top - pad)], 0.006))


def arc_length(points):
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def wiggle(points, rng):
    """Bends a stroke the way a hand would: two slow waves of drift (different
    wavelengths, random phase, perpendicular to the stroke) plus a fine tremor.
    Returns the new points and a smooth pressure value for each."""
    total = arc_length(points)
    waves = [(rng.uniform(0.09, 0.16), rng.uniform(0, math.tau), rng.uniform(0.5, 1.0)),
             (rng.uniform(0.15, 0.3), rng.uniform(0, math.tau), rng.uniform(0.6, 1.2))]
    pressure_wave = (rng.uniform(0.1, 0.25), rng.uniform(0, math.tau))
    out, pressures, walked = [], [], 0.0
    for i, (x, y) in enumerate(points):
        if i:
            walked += math.dist(points[i - 1], (x, y))
        a, b = points[max(i - 1, 0)], points[min(i + 1, len(points) - 1)]
        length = math.dist(a, b) or 1
        nx, ny = -(b[1] - a[1]) / length, (b[0] - a[0]) / length  # unit normal
        drift = sum(amp * math.sin(math.tau * walked / wavelength + phase) for wavelength, phase, amp in waves)
        offset = WOBBLE * drift + rng.gauss(0, TREMOR)
        out.append((x + nx * offset, y + ny * offset))
        pressures.append(0.58 + 0.08 * math.sin(math.tau * walked / pressure_wave[0] + pressure_wave[1]))
    return out, pressures


def to_project(layout):
    """Turns placed strokes into a saved drawing: wobbles and times each stroke and works out the cue times."""
    strokes, cues, clock = [], [], 0.0
    cue_at = sorted(layout.cues)
    for index, stroke in enumerate(layout.strokes):
        while cue_at and cue_at[0] == index:
            cues.append(round(clock - STROKE_GAP_MS + 40))
            clock += CUE_GAP_MS
            cue_at.pop(0)
        points, pressures = wiggle(stroke["points"], layout.rng)
        total = arc_length(points)
        duration = max(90.0, total / PEN_SPEED * 1000)
        walked, timed = 0.0, []
        for i, (x, y) in enumerate(points):
            if i:
                walked += math.dist(points[i - 1], (x, y))
            u = walked / total if total else 0
            # The pen eases in and out a little instead of moving at one speed.
            eased = 0.7 * u + 0.3 * (0.5 - 0.5 * math.cos(math.pi * u))
            timed.append({"x": round(x / ASPECT, 5), "y": round(y, 5), "pressure": round(pressures[i], 3),
                          "t": round(eased * duration, 1)})
        strokes.append({"id": index + 1, "start": round(clock), "speed": 1, "size": PEN_SIZE,
                        "color": stroke["color"], "points": timed})
        clock += duration + STROKE_GAP_MS
    return {"version": 1, "cues": [{"ms": ms} for ms in cues], "strokes": strokes}


MAX_WIDTH = 1.4  # widest an equation gets, in drawing heights (the drawing is 1.78 wide)


def centered(layout, tokens, h):
    """Writes the tokens centered on the drawing, shrunk if needed to fit. Returns the height used and the baseline."""
    width = layout.measure(tokens, h) - GAP * h
    h = min(h, h * MAX_WIDTH / width)
    width = layout.measure(tokens, h) - GAP * h
    base = 0.5 + 0.325 * h  # puts the middle of the x-height on the middle of the drawing
    layout.put(tokens, (ASPECT - width) / 2, base, h)
    return h, base


def pythagoras():
    # No cues: this one plays through on its own.
    layout = Layout(1)
    h = 0.26
    tokens = [("col", "blue"), "a", ("sup", "2"), " ", ("col", "ink"), "+", " ", ("col", "green"), "b", ("sup", "2"), " ",
              ("col", "ink"), "=", " ", ("mark", "c0"), ("col", "red"), "c", ("sup", "2"), ("mark", "c1")]
    h, base = centered(layout, tokens, h)
    layout.color = RED
    layout.box(layout.marks["c0"], layout.marks["c1"] - GAP * h, base - 1.1 * h, base + 0.05 * h, 0.03)
    return layout


def quadratic():
    layout = Layout(2)
    h = 0.17
    numerator = [("col", "ink"), "−", "b", " ", "±", ("cue",), ("col", "red"),
                 ("sqrt", [("col", "red"), "b", ("sup", "2"), " ", "−", " ", "4", "a", "c"]), ("cue",)]
    tokens = [("col", "blue"), "x", " ", ("col", "ink"), "=", " ", ("frac", numerator, [("col", "green"), "2", "a"])]
    centered(layout, tokens, h)
    return layout


def euler():
    layout = Layout(3)
    h = 0.26
    tokens = [("col", "blue"), "e", ("col", "red"), ("sup", "iπ"), ("cue",), " ", ("col", "ink"), "+", " ", ("col", "green"), "1",
              ("cue",), " ", ("col", "ink"), "=", " ", ("col", "ink"), "0"]
    centered(layout, tokens, h)
    return layout


def gauss():
    layout = Layout(4)
    h = 0.17
    tokens = [("col", "blue"), ("sum", ["n"], ["k", "=", "1"]), ("cue",), ("col", "ink"), "k", " ", "=", ("cue",), " ",
              ("col", "red"), ("frac", ["n", "(", "n", " ", "+", " ", "1", ")"], ["2"])]
    centered(layout, tokens, h)
    return layout


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for name, build in [("pythagoras", pythagoras), ("quadratic", quadratic), ("euler", euler), ("sum", gauss)]:
        project = to_project(build())
        (OUT / f"{name}.json").write_text(json.dumps(project, separators=(",", ":")))
        print(f"{name}: {len(project['strokes'])} strokes, cues at {[c['ms'] for c in project['cues']]}")


if __name__ == "__main__":
    main()
