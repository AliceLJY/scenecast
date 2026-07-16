// Library entry: render a paginated HTML deck to an element-level motion video.
import fs from "node:fs/promises";
import path from "node:path";
import { captureFrames } from "./renderer.mjs";
import { encodeFrames, muxAudio } from "./encoder.mjs";

let renderCounter = 0; // disambiguates work dirs for concurrent renders in one process

const DEFAULTS = {
  sceneSelector: "[data-scene]",
  sceneDuration: 5,
  fps: 30,
  width: 1920,
  height: 1080,
  deckWidth: 1200,
  deckHeight: 675,
  scale: 2,
  channel: "", // empty => bundled Chromium, then system Chrome as a fallback
  voiceover: "",
  keepFrames: false,
};

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

export async function renderHtmlToVideo(options) {
  const o = { ...DEFAULTS, ...options };
  if (!o.input) throw new Error("renderHtmlToVideo: missing input");
  if (!o.output) throw new Error("renderHtmlToVideo: missing output");
  if (!isPositiveFinite(o.fps)) throw new Error(`renderHtmlToVideo: fps must be finite and > 0 (got ${o.fps})`);
  if (!(isPositiveFinite(o.width) && isPositiveFinite(o.height))) throw new Error("renderHtmlToVideo: width/height must be finite and > 0");
  if (!(isPositiveFinite(o.deckWidth) && isPositiveFinite(o.deckHeight))) throw new Error("renderHtmlToVideo: deckWidth/deckHeight must be finite and > 0");
  if (!isPositiveFinite(o.scale)) throw new Error("renderHtmlToVideo: scale must be finite and > 0");
  if (!isPositiveFinite(o.sceneDuration)) throw new Error("renderHtmlToVideo: sceneDuration must be finite and > 0");

  const input = path.resolve(o.input);
  const output = path.resolve(o.output);
  // pid in the work dir name so concurrent renders to the same output don't wipe
  // each other's frames.
  const work = o.workDir
    ? path.resolve(o.workDir)
    : path.join(path.dirname(output), `.scenecast-${path.basename(output, path.extname(output))}-${process.pid}-${renderCounter++}`);
  const framesDir = path.join(work, "frames");

  await fs.access(input);
  if (o.voiceover) await fs.access(path.resolve(o.voiceover));
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(path.dirname(output), { recursive: true });

  const cap = await captureFrames({
    input,
    framesDir,
    sceneSelector: o.sceneSelector,
    sceneDuration: o.sceneDuration,
    fps: o.fps,
    deckWidth: o.deckWidth,
    deckHeight: o.deckHeight,
    scale: o.scale,
    channel: o.channel,
  });

  encodeFrames({ framesDir, output, fps: o.fps, width: o.width, height: o.height });

  const warnings = [...(cap.warnings || [])];
  let voiceoverOutput = null;
  if (o.voiceover) {
    // voiceover muxing only makes sense for mp4 (aac); webm/gif are skipped.
    if (/\.mp4$/i.test(output)) {
      voiceoverOutput = output.replace(/\.mp4$/i, "-voiceover.mp4");
      muxAudio({ video: output, audio: path.resolve(o.voiceover), output: voiceoverOutput });
    } else {
      const w = `voiceover is only supported for .mp4 output; skipped (${path.extname(output) || "no extension"})`;
      warnings.push(w);
      console.warn(`scenecast: ${w}`);
    }
  }

  if (!o.keepFrames) await fs.rm(framesDir, { recursive: true, force: true });

  return {
    output,
    voiceoverOutput,
    scenes: cap.scenes,
    frames: cap.frames,
    durationSeconds: cap.frames / o.fps,
    warnings,
    playwright: cap.playwright,
  };
}

export default { renderHtmlToVideo };
