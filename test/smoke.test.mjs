// End-to-end smoke test: render a minimal two-scene deck and assert the mp4 is
// produced with the expected scene/frame counts. Skipped automatically when
// Playwright (with a browser) or ffmpeg is unavailable.
//
// On a machine that uses system Chrome instead of Playwright's bundled Chromium,
// set SCENECAST_TEST_CHANNEL=chrome (and SCENECAST_PLAYWRIGHT if needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadPlaywright } from "../src/playwright-loader.mjs";
import { renderHtmlToVideo } from "../src/index.mjs";

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasPlaywright() {
  try {
    loadPlaywright();
    return true;
  } catch {
    return false;
  }
}

const MINI_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  .s { width: 400px; height: 225px; background: #fff; position: relative; padding: 20px; }
</style></head><body>
  <section class="s" data-scene data-scene-duration="1">
    <h1 data-anim="fade-up" data-anim-delay="0">Hello</h1>
    <b data-anim="count-up" data-anim-delay="0.1">42</b>
  </section>
  <section class="s" data-scene data-scene-duration="1" data-anim="fade-left" data-anim-delay="0">
    <p>World</p>
  </section>
</body></html>`;

const ONE_SCENE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  .s { width: 400px; height: 225px; background: #fff; }
</style></head><body>
  <section class="s" data-scene data-scene-duration="0.1"><p>One frame</p></section>
</body></html>`;

const skip = (!hasPlaywright() || !hasFfmpeg()) && "needs Playwright (+browser) and ffmpeg";

test("smoke: render a minimal deck to mp4", { skip }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scenecast-smoke-"));
  try {
    const input = path.join(dir, "deck.html");
    const output = path.join(dir, "out.mp4");
    await fs.writeFile(input, MINI_HTML);

    const r = await renderHtmlToVideo({
      input,
      output,
      deckWidth: 400,
      deckHeight: 225,
      width: 640,
      height: 360,
      fps: 10,
      sceneDuration: 1,
      channel: process.env.SCENECAST_TEST_CHANNEL || "",
    });

    assert.equal(r.scenes, 2);
    assert.equal(r.frames, 20); // 2 scenes x 1s x 10fps
    assert.deepEqual(r.warnings, []); // also proves scene-root data-anim is executed
    const stat = await fs.stat(output);
    assert.ok(stat.size > 0, "output mp4 should be non-empty");
    const leftovers = (await fs.readdir(dir)).filter((name) => name.startsWith(".scenecast-"));
    assert.deepEqual(leftovers, [], "successful renders should remove generated work directories");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("failed post-capture work removes frames from a caller work directory", { skip }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scenecast-failure-"));
  try {
    const input = path.join(dir, "deck.html");
    const output = path.join(dir, "out.mp4");
    const voiceover = path.join(dir, "not-audio.txt");
    const workDir = path.join(dir, "caller-work");
    await fs.writeFile(input, ONE_SCENE_HTML);
    await fs.writeFile(voiceover, "not audio");

    await assert.rejects(
      renderHtmlToVideo({
        input,
        output,
        voiceover,
        workDir,
        deckWidth: 400,
        deckHeight: 225,
        width: 640,
        height: 360,
        fps: 2,
        sceneDuration: 0.1,
        channel: process.env.SCENECAST_TEST_CHANNEL || "",
      }),
    );

    await assert.rejects(fs.access(path.join(workDir, "frames")), { code: "ENOENT" });
    await fs.access(workDir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
