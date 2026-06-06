// Locate a usable Playwright module without forcing a particular install layout.
// Resolution order:
//   1. SCENECAST_PLAYWRIGHT / PLAYWRIGHT_MODULE_PATH env override
//   2. node_modules/playwright beside this package
//   3. node_modules/playwright in the current working directory
//   4. global npm root
//   5. a normal require("playwright")
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function npmGlobalPlaywrightPath() {
  try {
    const root = execFileSync("npm", ["root", "-g"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root ? path.join(root, "playwright") : "";
  } catch {
    return "";
  }
}

function packageExists(candidate) {
  return fs.existsSync(path.join(candidate, "package.json")) || fs.existsSync(path.join(candidate, "index.js"));
}

function tryRequire(candidate) {
  try {
    const module = require(candidate);
    if (module && module.chromium) return { module, source: candidate };
  } catch {
    return null;
  }
  return null;
}

export function loadPlaywright() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = unique([
    process.env.SCENECAST_PLAYWRIGHT,
    process.env.PLAYWRIGHT_MODULE_PATH,
    path.join(here, "..", "node_modules", "playwright"),
    path.join(process.cwd(), "node_modules", "playwright"),
    npmGlobalPlaywrightPath(),
    "/opt/homebrew/lib/node_modules/playwright",
    "/usr/local/lib/node_modules/playwright",
  ]);

  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    if (!packageExists(absolute)) continue;
    const loaded = tryRequire(absolute);
    if (loaded) return loaded;
  }

  const globalLoaded = tryRequire("playwright");
  if (globalLoaded) return globalLoaded;

  throw new Error(
    [
      "Playwright was not found.",
      "Install it as a peer dependency:",
      "  npm install playwright && npx playwright install chromium",
      "Or point scenecast at an existing install:",
      "  export SCENECAST_PLAYWRIGHT=/path/to/node_modules/playwright",
      "Checked:",
      ...candidates.map((c) => `  - ${path.resolve(c)}`),
      '  - require("playwright")',
    ].join("\n"),
  );
}
