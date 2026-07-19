import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtmlToVideo } from "../src/index.mjs";

test("programmatic API rejects infinite numeric options before touching files", async () => {
  await assert.rejects(
    renderHtmlToVideo({ input: "unused.html", output: "unused.mp4", fps: Infinity }),
    /fps must be finite and > 0/,
  );
});

test("programmatic API rejects unsupported output extensions before touching files", async () => {
  await assert.rejects(
    renderHtmlToVideo({ input: "unused.html", output: "unused.avi" }),
    /unsupported output extension.*\.avi/,
  );
});
