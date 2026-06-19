#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { renderHtmlToVideo } from "./index.mjs";

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

const HELP = `scenecast — turn a paginated HTML deck into an element-level motion video

Usage:
  scenecast render <input.html> -o <output.mp4|.webm|.gif> [options]

Options:
  -o, --output PATH       Output file; codec by extension: .mp4 / .webm / .gif (required)
  --scene-selector SEL    Scene selector (default: [data-scene])
  --scene-duration SEC    Seconds per scene (default: 5; per-scene via data-scene-duration)
  --fps N                 Frames per second (default: 30)
  --width N               Output width (default: 1920)
  --height N              Output height (default: 1080)
  --deck-width N          HTML design width per scene (default: 1200)
  --deck-height N         HTML design height per scene (default: 675)
  --scale N               Capture device scale factor (default: 2)
  --channel NAME          Chrome channel (default: Playwright's bundled Chromium)
  --voiceover PATH        Audio to mux into a *-voiceover.mp4 (mp4 output only)
  --keep-frames           Keep the intermediate frame PNGs
  -h, --help              Show this help

Declarative animation (write it in your HTML):
  data-scene [data-scene-duration="5"]              mark a scene / page
  data-anim="fade | fade-up | fade-down | fade-left | fade-right
             | zoom-in | count-up | draw | highlight"
  data-anim-delay  data-anim-duration  data-anim-ease  data-anim-distance  data-anim-base
  data-anim-color="#246bfe"        target color for highlight
  data-anim-stagger="0.12"         on a container; its children enter in sequence
`;

const NEEDS_VALUE = new Set([
  "-o", "--output", "--scene-selector", "--scene-duration", "--fps", "--width",
  "--height", "--deck-width", "--deck-height", "--scale", "--channel", "--voiceover",
]);

const POSITIVE = { sceneDuration: "--scene-duration", fps: "--fps", width: "--width", height: "--height", deckWidth: "--deck-width", deckHeight: "--deck-height", scale: "--scale" };

function fail(msg) {
  console.error(`scenecast: ${msg}`);
  process.exit(1);
}

function parse(argv) {
  const o = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    let value;
    if (NEEDS_VALUE.has(a)) {
      value = argv[i + 1];
      // allow negative numbers as values; only a flag-looking token counts as "missing"
      if (value === undefined || (value.startsWith("-") && !/^-\d/.test(value))) fail(`option ${a} needs a value`);
      i += 1;
    }
    if (a === "-o" || a === "--output") o.output = value;
    else if (a === "--scene-selector") o.sceneSelector = value;
    else if (a === "--scene-duration") o.sceneDuration = Number(value);
    else if (a === "--fps") o.fps = Number(value);
    else if (a === "--width") o.width = Number(value);
    else if (a === "--height") o.height = Number(value);
    else if (a === "--deck-width") o.deckWidth = Number(value);
    else if (a === "--deck-height") o.deckHeight = Number(value);
    else if (a === "--scale") o.scale = Number(value);
    else if (a === "--channel") o.channel = value;
    else if (a === "--voiceover") o.voiceover = value;
    else if (a === "--keep-frames") o.keepFrames = true;
    else if (a === "-h" || a === "--help") { console.log(HELP); process.exit(0); }
    else if (!a.startsWith("-")) rest.push(a);
    else fail(`unknown option: ${a}`);
  }
  if (rest.length > 1) fail(`unexpected extra arguments: ${rest.slice(1).join(", ")}`);
  o.input = rest[0];
  for (const [key, flag] of Object.entries(POSITIVE)) {
    if (o[key] !== undefined && !(o[key] > 0)) fail(`${flag} must be a positive number`);
  }
  return o;
}

const [, , cmd, ...argv] = process.argv;
if (!cmd || cmd === "-h" || cmd === "--help") {
  console.log(HELP);
  process.exit(cmd ? 0 : 1);
}
if (cmd !== "render") {
  console.error(`scenecast: unknown command: ${cmd}`);
  console.log(HELP);
  process.exit(2);
}

const o = parse(argv);
if (!o.input) fail("missing input HTML");
if (!o.output) fail("missing -o/--output");
o.input = expandHome(o.input);
o.output = expandHome(o.output);
if (o.voiceover) o.voiceover = expandHome(o.voiceover);

renderHtmlToVideo(o)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => { console.error(`scenecast: ${e.message}`); process.exit(1); });
