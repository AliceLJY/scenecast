// CLI argument-handling tests. Pure Node — no browser / ffmpeg needed, because
// every case fails during argument parsing, before any render is attempted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.mjs");

async function run(args) {
  try {
    const { stdout, stderr } = await execFileP("node", [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

test("no args prints help and exits non-zero", async () => {
  const r = await run([]);
  assert.notEqual(r.code, 0);
  assert.match(r.stdout + r.stderr, /Usage:/);
});

test("unknown command exits 2", async () => {
  const r = await run(["frobnicate"]);
  assert.equal(r.code, 2);
});

test("render without --output fails on output", async () => {
  const r = await run(["render", "deck.html"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /output/);
});

test("render without input fails on input", async () => {
  const r = await run(["render", "-o", "out.mp4"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /input/);
});

test("option missing its value fails", async () => {
  const r = await run(["render", "deck.html", "-o", "out.mp4", "--fps"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /needs a value/);
});

test("non-positive --fps fails", async () => {
  const r = await run(["render", "deck.html", "-o", "out.mp4", "--fps", "0"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--fps must be a finite positive number/);
});

test("infinite numeric options fail before rendering", async () => {
  const r = await run(["render", "deck.html", "-o", "out.mp4", "--fps", "Infinity"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--fps must be a finite positive number/);
});

test("negative --width fails", async () => {
  const r = await run(["render", "deck.html", "-o", "out.mp4", "--width", "-100"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /needs a value|positive number/);
});

test("unknown option fails", async () => {
  const r = await run(["render", "deck.html", "-o", "out.mp4", "--bogus"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /unknown option/);
});

test("extra positional args fail", async () => {
  const r = await run(["render", "a.html", "b.html", "-o", "out.mp4"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /extra arguments/);
});
