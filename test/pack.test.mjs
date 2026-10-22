// Guards the npm publish surface: the package must not carry generated media
// (e.g. demo.mp4) and must include the runnable demo + source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("npm pack: no .mp4 in package, includes src + demo.gif + README", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  // npm <= 11 prints an array of package reports; npm 12 prints an object keyed by package name.
  const report = JSON.parse(out);
  const [pkg] = Array.isArray(report) ? report : Object.values(report);
  const files = pkg.files.map((f) => f.path);
  const mp4s = files.filter((f) => f.endsWith(".mp4"));
  assert.deepEqual(mp4s, [], `package must not contain .mp4 files, found: ${mp4s.join(", ")}`);
  assert.ok(files.includes("demo/demo.gif"), "demo/demo.gif should be packaged");
  assert.ok(files.includes("src/index.mjs"), "src should be packaged");
  assert.ok(files.includes("README.md"), "README.md should be packaged");
});
