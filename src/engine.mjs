// Scene animation engine — runs INSIDE the browser page.
//
// `installSceneEngine` is self-contained (no imports / no outer-scope refs) so it
// can be passed straight to Playwright's page.evaluate(). It reads declarative
// `data-anim` attributes off the HTML, so any deck can drive motion without JS.
//
// It exposes window.__scenecast with:
//   count      number of scenes found
//   init(i)    preprocess scene i and paint its t=0 frame
//   render(i,t) paint scene i at virtual time t (seconds, scene-local)
//
// Animation is seek-based: render(i, t) is a pure function of t, so frame capture
// is deterministic and reproducible. No CSS transitions are used.

export function installSceneEngine(sceneSelector) {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, e) => a + (b - a) * e;
  const num = (v, d) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };

  const EASES = {
    linear: (p) => p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    outBack: (p) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
  };

  // Preset name -> animated channels. Distances are defaults, overridable by
  // data-anim-distance. count/draw/color are resolved per element at prep time.
  const PRESETS = {
    fade: { opacity: [0, 1] },
    "fade-up": { opacity: [0, 1], y: [28, 0] },
    "fade-down": { opacity: [0, 1], y: [-28, 0] },
    "fade-left": { opacity: [0, 1], x: [-56, 0] },
    "fade-right": { opacity: [0, 1], x: [56, 0] },
    "zoom-in": { opacity: [0, 1], scale: [0.6, 1] },
    "count-up": { count: true },
    draw: { draw: true },
    highlight: { color: true },
  };

  const warnings = [];

  // Accepts rgb()/rgba() (comma or modern space syntax) and #rgb / #rrggbb.
  const parseColor = (str) => {
    if (!str) return null;
    const s = str.trim();
    const rgb = s.match(/rgba?\(([^)]+)\)/i);
    if (rgb) {
      const parts = rgb[1].split(/[\s,/]+/).map(parseFloat).filter((n) => !Number.isNaN(n));
      if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
      return null;
    }
    const hex = s.replace("#", "");
    if (hex.length === 3 || hex.length === 6) {
      const step = hex.length / 3;
      const out = [0, 1, 2].map((i) => {
        const part = hex.substr(i * step, step);
        return parseInt(step === 1 ? part + part : part, 16);
      });
      return out.some(Number.isNaN) ? null : out; // invalid hex -> null (so highlight warns / no-ops)
    }
    return null;
  };

  const specOf = (el) => {
    const preset = PRESETS[el.dataset.anim] || {};
    const spec = { ...preset };
    spec.delay = Math.max(0, num(el.dataset.animDelay, 0));
    spec.dur = num(el.dataset.animDuration, 0.6); // <= 0 handled at render time (instant)
    spec.ease = el.dataset.animEase || "outCubic";
    spec.base = el.dataset.animBase || "";
    if (el.dataset.animDistance != null) {
      const d = num(el.dataset.animDistance, 0);
      if (spec.x) spec.x = [Math.sign(spec.x[0]) * d, 0];
      if (spec.y) spec.y = [Math.sign(spec.y[0]) * d, 0];
    }
    return spec;
  };

  // Per-element preprocessed data (count targets, line length, color endpoints).
  const meta = new Map();

  const prepEl = (el, spec) => {
    if (spec.count) {
      const raw = (el.textContent || "").trim();
      // optional non-digit prefix (non-greedy), signed integer/decimal, trailing unit
      const m = raw.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
      if (m) {
        const numStr = m[2].replace(/,/g, "");
        const dot = numStr.indexOf(".");
        meta.set(el, {
          prefix: m[1],
          target: parseFloat(numStr),
          decimals: dot >= 0 ? numStr.length - dot - 1 : 0,
          suffix: m[3],
        });
      } else {
        // no number to count: leave text untouched
        meta.set(el, { prefix: raw, target: 0, decimals: 0, suffix: "", static: true });
      }
    }
    if (spec.draw && typeof el.getTotalLength === "function") {
      meta.set(el, { len: el.getTotalLength() });
    }
    if (spec.color) {
      const to = parseColor(el.dataset.animColor);
      if (to) {
        meta.set(el, { from: parseColor(getComputedStyle(el).color) || [0, 0, 0], to });
      } else {
        spec.color = false; // no/invalid target color -> nothing to animate
      }
    }
  };

  const applyEl = (el, spec, e) => {
    if (spec.opacity) el.style.opacity = String(lerp(spec.opacity[0], spec.opacity[1], e));
    const tf = [];
    if (spec.base) tf.push(spec.base);
    if (spec.x || spec.y) {
      const x = spec.x ? lerp(spec.x[0], spec.x[1], e) : 0;
      const y = spec.y ? lerp(spec.y[0], spec.y[1], e) : 0;
      tf.push(`translate(${x}px, ${y}px)`);
    }
    if (spec.scale) tf.push(`scale(${lerp(spec.scale[0], spec.scale[1], e)})`);
    if (spec.rotate) tf.push(`rotate(${lerp(spec.rotate[0], spec.rotate[1], e)}deg)`);
    if (tf.length) {
      // transforms have no effect on inline elements; promote to inline-block.
      // NOTE: this can change wrapping/baseline — see README "inline elements".
      if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
      el.style.transform = tf.join(" ");
    }
    if (spec.color) {
      const m = meta.get(el);
      if (m && m.from && m.to) {
        const r = Math.round(lerp(m.from[0], m.to[0], e));
        const g = Math.round(lerp(m.from[1], m.to[1], e));
        const b = Math.round(lerp(m.from[2], m.to[2], e));
        el.style.color = `rgb(${r}, ${g}, ${b})`;
      }
    }
    if (spec.count) {
      const m = meta.get(el);
      if (m && !m.static) {
        const v = lerp(0, m.target, e);
        el.textContent = `${m.prefix}${v.toFixed(m.decimals)}${m.suffix}`;
      }
    }
    if (spec.draw) {
      const m = meta.get(el);
      if (m) {
        el.style.strokeDasharray = String(m.len);
        el.style.strokeDashoffset = String(m.len * (1 - e));
      }
    }
  };

  // Collect animated items in a scene, expanding data-anim-stagger containers
  // (each DIRECT child gets an incremental offset, shared by that child and any
  // [data-anim] inside it — so a card and its count-up move as one staggered unit).
  // Nested stagger containers: the outer one wins; inner is ignored (see README).
  const collectItems = (scene) => {
    const items = [];
    const staggered = new Set();
    for (const container of scene.querySelectorAll("[data-anim-stagger]")) {
      const step = num(container.dataset.animStagger, 0.1);
      [...container.children].forEach((child, i) => {
        const targets = [];
        if (child.matches("[data-anim]")) targets.push(child);
        targets.push(...child.querySelectorAll("[data-anim]"));
        for (const el of targets) {
          if (staggered.has(el)) continue;
          staggered.add(el);
          const spec = specOf(el);
          spec.delay += i * step;
          items.push({ el, spec });
        }
      });
    }
    for (const el of scene.querySelectorAll("[data-anim]")) {
      if (staggered.has(el)) continue;
      items.push({ el, spec: specOf(el) });
    }
    return items;
  };

  const scenes = [...document.querySelectorAll(sceneSelector)];
  const itemsByScene = new Map();

  const renderScene = (scene, t) => {
    const items = itemsByScene.get(scene) || [];
    for (const { el, spec } of items) {
      const start = spec.delay;
      // dur <= 0 => instant: fully applied once t reaches start
      const p = spec.dur > 0 ? clamp01((t - start) / spec.dur) : (t >= start ? 1 : 0);
      const e = (EASES[spec.ease] || EASES.outCubic)(p);
      applyEl(el, spec, e);
    }
  };

  // Up-front validation scan so typos surface as warnings (returned to the host).
  for (const scene of scenes) {
    for (const el of scene.querySelectorAll("[data-anim]")) {
      if (!PRESETS[el.dataset.anim]) warnings.push(`unknown data-anim="${el.dataset.anim}"`);
      if (el.dataset.animEase && !EASES[el.dataset.animEase]) {
        warnings.push(`unknown data-anim-ease="${el.dataset.animEase}" (falling back to outCubic)`);
      }
      if (el.dataset.anim === "highlight" && !parseColor(el.dataset.animColor)) {
        warnings.push(`highlight without a valid data-anim-color is a no-op`);
      }
    }
  }

  window.__scenecast = {
    count: scenes.length,
    init: (i) => {
      const scene = scenes[i];
      if (!scene) return;
      const items = collectItems(scene);
      for (const { el, spec } of items) prepEl(el, spec);
      itemsByScene.set(scene, items);
      renderScene(scene, 0);
    },
    render: (i, t) => {
      const scene = scenes[i];
      if (scene) renderScene(scene, t);
    },
  };

  return { scenes: scenes.length, warnings };
}
