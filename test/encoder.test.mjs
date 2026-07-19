import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSupportedOutputExtension, buildEncodeArgs } from "../src/encoder.mjs";

const common = {
  framesDir: "frames",
  fps: 24,
  width: 1280,
  height: 720,
};

test("mp4 output selects H.264", () => {
  const args = buildEncodeArgs({ ...common, output: "movie.mp4" });
  assert.ok(args.includes("libx264"));
  assert.equal(args.at(-1), "movie.mp4");
});

test("webm output selects VP9", () => {
  const args = buildEncodeArgs({ ...common, output: "movie.WEBM" });
  assert.ok(args.includes("libvpx-vp9"));
  assert.equal(args.at(-1), "movie.WEBM");
});

test("gif output selects the palette filter", () => {
  const args = buildEncodeArgs({ ...common, output: "movie.gif" });
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert.match(filter, /palettegen/);
  assert.match(filter, /paletteuse/);
});

test("unknown and missing output extensions fail explicitly", () => {
  assert.throws(() => assertSupportedOutputExtension("movie.avi"), /expected \.mp4, \.webm, or \.gif/);
  assert.throws(() => assertSupportedOutputExtension("movie"), /\(none\)/);
});
