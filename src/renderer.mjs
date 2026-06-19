// Browser-side capture: open the deck, inject the engine, step a virtual clock
// per scene, and screenshot each scene element frame by frame.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./playwright-loader.mjs";
import { installSceneEngine } from "./engine.mjs";

// Cheap mid-buffer djb2: detect frames that never change (timeline not advancing).
// Hashing a middle window keeps it fast on multi-MB PNGs while still
// distinguishing distinct frames; identical frames yield identical bytes.
function frameHash(buf) {
  const len = buf.length;
  const start = Math.max(0, (len >> 1) - 4096);
  const end = Math.min(len, start + 8192);
  let h = 5381;
  for (let i = start; i < end; i += 1) h = (((h << 5) + h) + buf[i]) >>> 0;
  return `${h}:${len}`;
}

export async function captureFrames({
  input,
  framesDir,
  sceneSelector,
  sceneDuration,
  fps,
  deckWidth,
  deckHeight,
  scale,
  channel,
}) {
  const { module: playwright, source } = loadPlaywright();
  const launchOpts = { headless: true };
  if (channel) launchOpts.channel = channel; // empty => Playwright's bundled Chromium

  const browser = await playwright.chromium.launch(launchOpts);
  let frameIdx = 0;
  let sceneCount = 0;
  let warnings = [];

  try {
    const context = await browser.newContext({
      viewport: { width: deckWidth, height: deckHeight },
      deviceScaleFactor: scale,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      // "load" (not "networkidle"): arbitrary user HTML may hold long-lived
      // connections or slow/failed requests that never reach network idle.
      await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
      await page.emulateMedia({ media: "screen" });

      const info = await page.evaluate(installSceneEngine, sceneSelector);
      sceneCount = info.scenes;
      warnings = info.warnings || [];
      for (const w of warnings) console.warn(`scenecast: ${w}`);
      if (!sceneCount) throw new Error(`No scenes matched selector: ${sceneSelector}`);

      for (let i = 0; i < sceneCount; i += 1) {
        const loc = page.locator(sceneSelector).nth(i);
        await loc.waitFor({ state: "visible", timeout: 5000 });
        await loc.scrollIntoViewIfNeeded();
        const declared = await loc.evaluate((el) => {
          const v = parseFloat(el.dataset.sceneDuration);
          return Number.isFinite(v) ? v : -1;
        });
        // Does this scene declare any animation? (used for the dead-frame check)
        const hasAnim = await loc.evaluate(
          (el) => el.hasAttribute("data-anim") || el.querySelector("[data-anim]") !== null,
        );
        const dur = declared > 0 ? declared : sceneDuration;
        await page.evaluate((idx) => window.__scenecast.init(idx), i);

        const framesPerScene = Math.max(1, Math.round(fps * dur));
        const sceneHashes = new Set();
        for (let f = 0; f < framesPerScene; f += 1) {
          // last frame lands exactly on `dur` so the final state is always captured
          // (a single-frame scene captures the end state, not t=0)
          const t = framesPerScene <= 1 ? dur : f === framesPerScene - 1 ? dur : f / fps;
          await page.evaluate((p) => window.__scenecast.render(p[0], p[1]), [i, t]);
          frameIdx += 1;
          const framePath = path.join(framesDir, `${String(frameIdx).padStart(5, "0")}.png`);
          const buf = await loc.screenshot({ animations: "disabled", type: "png" });
          await writeFile(framePath, buf);
          sceneHashes.add(frameHash(buf));
        }

        // A scene that declares animation but yields a single unique frame across
        // many frames means the timeline never advanced (engine/seek broken, or an
        // invalid data-anim value). Surface it instead of silently shipping a still.
        if (hasAnim && framesPerScene > 1 && sceneHashes.size === 1) {
          const w = `scene ${i + 1} declares animation but all ${framesPerScene} frames are identical — the animation may not be running`;
          warnings.push(w);
          console.warn(`scenecast: ${w}`);
        }
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return { scenes: sceneCount, frames: frameIdx, warnings, playwright: source };
}
