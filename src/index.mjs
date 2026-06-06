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
  channel: "", // empty => Playwright's bundled Chromium (most portable)
  voiceover: "",
  keepFrames: false,
};

export async function renderHtmlToVideo(options) {
  const o = { ...DEFAULTS, ...options };
  if (!o.input) throw new Error("renderHtmlToVideo: missing input");
  if (!o.output) throw new Error("renderHtmlToVideo: missing output");
  if (!(o.fps > 0)) throw new Error(`renderHtmlToVideo: fps must be > 0 (got ${o.fps})`);
  if (!(o.width > 0 && o.height > 0)) throw new Error("renderHtmlToVideo: width/height must be > 0");
  if (!(o.deckWidth > 0 && o.deckHeight > 0)) throw new Error("renderHtmlToVideo: deckWidth/deckHeight must be > 0");
  if (!(o.scale > 0)) throw new Error("renderHtmlToVideo: scale must be > 0");
  if (!(o.sceneDuration > 0)) throw new Error("renderHtmlToVideo: sceneDuration must be > 0");

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

  let voiceoverOutput = null;
  if (o.voiceover) {
    // guard: if output isn't *.mp4, don't collide input/output paths in the mux
    voiceoverOutput = /\.mp4$/i.test(output)
      ? output.replace(/\.mp4$/i, "-voiceover.mp4")
      : `${output}-voiceover.mp4`;
    muxAudio({ video: output, audio: path.resolve(o.voiceover), output: voiceoverOutput });
  }

  if (!o.keepFrames) await fs.rm(framesDir, { recursive: true, force: true });

  return {
    output,
    voiceoverOutput,
    scenes: cap.scenes,
    frames: cap.frames,
    durationSeconds: cap.frames / o.fps,
    warnings: cap.warnings || [],
    playwright: cap.playwright,
  };
}

export default { renderHtmlToVideo };
