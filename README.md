# scenecast

> Turn a paginated HTML deck into an element-level motion video. The HTML stays the only visual source — no template, no front-end framework.

![scenecast demo](demo/demo.gif)

## Why

Most "HTML → video" tools either flip through whole pages like a slideshow, or lock you into a template system whose look isn't your HTML. **scenecast animates _your_ poster, element by element** — the HTML you wrote is the only visual source, so the video looks exactly like your page, just moving.

- **Your HTML is the source of truth** — palette, layout, fonts are all inherited.
- **Declarative** — describe motion with `data-anim` attributes; write zero JS.
- **Deterministic** — seek-based rendering, frame-accurate and reproducible.
- **No front-end framework** — no GSAP, no React; just your HTML and a tiny engine.

## How it works

scenecast opens your HTML in headless Chromium (Playwright), injects a dependency-free, seek-based animation engine that reads your `data-anim` attributes, steps a virtual clock frame by frame while screenshotting each scene, then encodes the frames to MP4 with ffmpeg.

## Install

```bash
npm install scenecast playwright
npx playwright install chromium   # one-time browser download
```

scenecast also needs **ffmpeg** on your `PATH`:

- macOS: `brew install ffmpeg`
- Debian/Ubuntu: `sudo apt install ffmpeg`
- Windows: <https://ffmpeg.org/download.html>

Playwright is a peer dependency, so you pick the version. By default scenecast uses Playwright's bundled Chromium; pass `--channel chrome` to use system Chrome instead.

## Quick start

Mark each page with `data-scene`, and add `data-anim` to the elements you want to move:

```html
<section data-scene data-scene-duration="4">
  <h1 data-anim="fade-left" data-anim-delay="0.1">Hello</h1>
  <span data-anim="count-up" data-anim-delay="0.6">128</span>
</section>
<section data-scene>
  <p data-anim="fade-up">The HTML you wrote is the only visual source.</p>
</section>
```

Render it:

```bash
npx scenecast render deck.html -o out.mp4
```

Or from Node:

```js
import { renderHtmlToVideo } from "scenecast";

await renderHtmlToVideo({ input: "deck.html", output: "out.mp4" });
```

## Declarative animation

### Scenes

| attribute | meaning |
| --- | --- |
| `data-scene` | marks an element as one scene (a page / shot) |
| `data-scene-duration="5"` | seconds this scene lasts (overrides `--scene-duration`) |

### Element animation

Add `data-anim` to any element inside a scene:

| `data-anim` | effect |
| --- | --- |
| `fade` | fade in |
| `fade-up` / `fade-down` | fade + slide vertically |
| `fade-left` / `fade-right` | fade + slide horizontally |
| `zoom-in` | fade + scale up |
| `count-up` | count a number from 0 up to the element's final value |
| `draw` | draw on an SVG `line` / `path` (stroke draw-on) |
| `highlight` | tween text color toward `data-anim-color` |

Modifiers (all optional):

| attribute | default | meaning |
| --- | --- | --- |
| `data-anim-delay` | `0` | start time within the scene (seconds) |
| `data-anim-duration` | `0.6` | animation length (seconds) |
| `data-anim-ease` | `outCubic` | `linear` / `outQuad` / `outCubic` / `outQuint` / `outBack` |
| `data-anim-distance` | preset | slide distance in px for `fade-*` |
| `data-anim-color` | — | target color for `highlight` (hex or `rgb()`) |
| `data-anim-base` | — | a transform to keep, e.g. `translateX(-50%)` |

### Stagger

Put `data-anim-stagger` on a container; its **direct children** enter in sequence, each offset by the step (seconds). A child and any animated elements inside it move together as one unit:

```html
<div class="cards" data-anim-stagger="0.15">
  <div class="card" data-anim="fade-up">…</div>
  <div class="card" data-anim="fade-up">…</div>
  <div class="card" data-anim="fade-up">…</div>
</div>
```

## CLI

```
scenecast render <input.html> -o <output.mp4> [options]
```

| option | default | |
| --- | --- | --- |
| `-o, --output` | — | output mp4 (required) |
| `--scene-selector` | `[data-scene]` | which elements are scenes |
| `--scene-duration` | `5` | seconds per scene |
| `--fps` | `30` | frames per second |
| `--width` / `--height` | `1920` / `1080` | output size |
| `--deck-width` / `--deck-height` | `1200` / `675` | your HTML's per-scene design size |
| `--scale` | `2` | capture device scale factor (sharper text) |
| `--channel` | bundled Chromium | e.g. `chrome` for system Chrome |
| `--voiceover` | — | audio file; also writes `*-voiceover.mp4` |
| `--keep-frames` | off | keep the intermediate PNG frames |

A runnable example lives in [`demo/demo.html`](demo/demo.html); `npm run demo` renders it.

## Notes & limitations

- **Only render HTML you trust.** scenecast opens your HTML in a real browser and executes its scripts with network access. Don't feed it untrusted pages.
- **Your existing CSS animations / transitions are not captured.** Frames are seek-driven and grabbed with `animations: "disabled"`; motion comes from `data-anim`, not from CSS keyframes.
- **`transform` animations on inline elements** (`fade-*`, `zoom-in`) promote them to `inline-block`, which can change wrapping and baseline. Prefer animating block / inline-block elements, or use `highlight` (color only) for inline text.
- **Nested `data-anim-stagger` is not supported** — the outermost container wins.
- **`data-anim-base` is manual.** If an element already has a CSS transform you want to keep, repeat it there.
- **count-up** reads the element's final text. It handles integers, decimals, and a leading unit/sign, but not arbitrary formats; thousands separators are dropped while counting.

## Requirements

- Node ≥ 18
- Playwright (peer dependency) + a browser (`npx playwright install chromium`)
- ffmpeg on `PATH`

## License

MIT © AliceLJY
