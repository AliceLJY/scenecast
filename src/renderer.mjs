// Browser-side capture: open the deck, inject the engine, step a virtual clock
// per scene, and screenshot each scene element frame by frame.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./playwright-loader.mjs";
import { installSceneEngine } from "./engine.mjs";

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
        const dur = declared > 0 ? declared : sceneDuration;
        await page.evaluate((idx) => window.__scenecast.init(idx), i);

        const framesPerScene = Math.max(1, Math.round(fps * dur));
        for (let f = 0; f < framesPerScene; f += 1) {
          // last frame lands exactly on `dur` so the final state is always captured
          // (a single-frame scene captures the end state, not t=0)
          const t = framesPerScene <= 1 ? dur : f === framesPerScene - 1 ? dur : f / fps;
          await page.evaluate((p) => window.__scenecast.render(p[0], p[1]), [i, t]);
          frameIdx += 1;
          await loc.screenshot({
            path: path.join(framesDir, `${String(frameIdx).padStart(5, "0")}.png`),
            animations: "disabled",
          });
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
