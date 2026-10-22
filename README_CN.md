# scenecast

> 把分页 HTML 渲染成元素级动效视频。HTML 始终是唯一视觉源——不套模板、不绑前端框架。

> **状态：** 稳定 · 低频维护 · 2026-10 最后核验。

![scenecast demo](demo/demo.gif)

## 为什么

市面上的「HTML 转视频」要么像幻灯片整页翻，要么把你绑进某个模板系统、视频长得不是你的 HTML。**scenecast 让你自己的海报逐元素动起来**——你写的 HTML 就是唯一视觉源，视频和你的页面长得一模一样，只是动了。

- **你的 HTML 即真相源**——配色、排版、字体全部继承。
- **声明式**——用 `data-anim` 属性描述动画，不写一行 JS。
- **确定性**——基于 seek 的逐帧渲染，帧级精确、可复现。
- **无前端框架**——不要 GSAP、不要 React，只有你的 HTML 和一个小引擎。

## 原理

scenecast 用 Playwright 起 headless Chromium 打开你的 HTML，注入一个零依赖的 seek 动画引擎（读你的 `data-anim` 属性），按虚拟时钟逐帧定格、截下每个 scene，再用 ffmpeg 把帧序列编码成 MP4、WebM 或 GIF（由输出文件扩展名决定）。

## 安装

```bash
git clone https://github.com/AliceLJY/scenecast.git && cd scenecast
npm install                       # 装上 package-lock.json 锁定的 Playwright 1.61.1
npx playwright install chromium   # 一次性下载浏览器
```

> **本地 clone 运行**——npm 上的 `scenecast` 是别人的无关包，不要 `npm i scenecast`。想要短命令 `scenecast`？在仓库目录里跑一次 `npm link`（否则用 `node src/cli.mjs`）。

还需要 `PATH` 上有 **ffmpeg**：

- macOS：`brew install ffmpeg`
- Debian/Ubuntu：`sudo apt install ffmpeg`
- Windows：<https://ffmpeg.org/download.html>

Playwright 是唯一的运行时依赖，以 peer 依赖声明（`>=1.40.0`），想用别的版本可以自己装；在 clone 里直接 `npm install` 拿到的是锁定的 1.61.1。默认先尝试 Playwright 自带的 Chromium；若浏览器二进制未安装，则自动改用系统 Chrome。想明确指定系统 Chrome，可加 `--channel chrome`。

## 快速开始

每一页用 `data-scene` 标记，给想动的元素加 `data-anim`：

```html
<section data-scene data-scene-duration="4">
  <h1 data-anim="fade-left" data-anim-delay="0.1">Hello</h1>
  <span data-anim="count-up" data-anim-delay="0.6">128</span>
</section>
<section data-scene>
  <p data-anim="fade-up">你写的 HTML 就是唯一视觉源。</p>
</section>
```

渲染（在 clone 的仓库目录里；`npm link` 之后可直接用 `scenecast render …`）：

```bash
node src/cli.mjs render deck.html -o out.mp4
```

或在 Node 里：

```js
import { renderHtmlToVideo } from "./src/index.mjs"; // clone 仓库内的相对路径

await renderHtmlToVideo({ input: "deck.html", output: "out.mp4" });
```

## 声明式动画

### 场景（scene）

| 属性 | 含义 |
| --- | --- |
| `data-scene` | 把一个元素标记为一个 scene（一页 / 一个镜头） |
| `data-scene-duration="5"` | 这个 scene 持续几秒（覆盖 `--scene-duration`） |

### 元素动画

给 scene 内任意元素加 `data-anim`：

| `data-anim` | 效果 |
| --- | --- |
| `fade` | 淡入 |
| `fade-up` / `fade-down` | 淡入 + 垂直滑入 |
| `fade-left` / `fade-right` | 淡入 + 水平滑入 |
| `zoom-in` | 淡入 + 放大 |
| `count-up` | 数字从 0 滚动到元素的最终值 |
| `draw` | SVG `line` / `path` 描边绘制 |
| `highlight` | 文字颜色渐变到 `data-anim-color` |

修饰属性（都可选）：

| 属性 | 默认 | 含义 |
| --- | --- | --- |
| `data-anim-delay` | `0` | scene 内的起始时间（秒） |
| `data-anim-duration` | `0.6` | 动画时长（秒） |
| `data-anim-ease` | `outCubic` | `linear` / `outQuad` / `outCubic` / `outQuint` / `outBack` |
| `data-anim-distance` | 预设值 | `fade-*` 的滑入距离（px） |
| `data-anim-rotate` | — | 额外旋转（度），`"from to"` 如 `"9 -1.6"`（可叠加在任意预设上） |
| `data-anim-scale` | — | 缩放端点，`"from"`（到 `1`）或 `"from to"` |
| `data-anim-color` | — | `highlight` 的目标颜色（hex 或 `rgb()`） |
| `data-anim-base` | — | 要保留的 transform，例如 `translateX(-50%)` |

### 错时入场（stagger）

在容器上加 `data-anim-stagger`，它的**直接子元素**会依次入场，每个按给定步长（秒）错开。一个子元素和它内部的动画元素作为一组一起动：

```html
<div class="cards" data-anim-stagger="0.15">
  <div class="card" data-anim="fade-up">…</div>
  <div class="card" data-anim="fade-up">…</div>
  <div class="card" data-anim="fade-up">…</div>
</div>
```

## CLI

```
scenecast render <input.html> -o <output.mp4|.webm|.gif> [options]
```

| 选项 | 默认 | |
| --- | --- | --- |
| `-o, --output` | — | 输出文件；编码由扩展名决定：.mp4 / .webm / .gif（必填） |
| `--scene-selector` | `[data-scene]` | 哪些元素算 scene |
| `--scene-duration` | `5` | 每个 scene 几秒 |
| `--fps` | `30` | 帧率 |
| `--width` / `--height` | `1920` / `1080` | 输出尺寸 |
| `--deck-width` / `--deck-height` | `1200` / `675` | 你 HTML 每个 scene 的设计尺寸 |
| `--scale` | `2` | 截图缩放因子（文字更锐利） |
| `--channel` | 自带 Chromium | 例如 `chrome` 用系统 Chrome |
| `--voiceover` | — | 音频文件；额外输出 `*-voiceover.mp4`（仅 mp4 输出） |
| `--keep-frames` | 关 | 保留中间的 PNG 帧 |

可运行示例见 [`demo/demo.html`](demo/demo.html)，`npm run demo` 即可渲染。

## 注意事项与限制

- **只渲染你信任的 HTML。** scenecast 用真实浏览器打开你的 HTML 并执行其脚本、允许联网。不要喂不可信的页面。
- **你已有的 CSS 动画 / 过渡不会被录进去。** 帧是 seek 驱动、用 `animations: "disabled"` 截取；动效来自 `data-anim`，不是 CSS keyframes。
- **inline 元素的 transform 动画**（`fade-*`、`zoom-in`）会把它提升成 `inline-block`，可能改变换行和基线。优先给块级 / inline-block 元素加动画，行内文字用 `highlight`（只变色）。
- **嵌套 `data-anim-stagger` 不支持**——最外层容器生效。
- **死帧告警。** 某个场景声明了 `data-anim`，但截下的所有帧完全相同时，scenecast 会打印警告（「动画可能没在跑」），而不是悄悄交出一段静止视频。
- **`data-anim-base` 是手动的。** 元素若已有想保留的 CSS transform，在这里重复一遍。
- **count-up** 读元素的最终文本，支持整数、小数和前导单位 / 符号，但不处理任意格式；计数时千分位逗号会被去掉。

## 依赖要求

- Node ≥ 18
- Playwright（peer 依赖）+ 浏览器（`npx playwright install chromium`）
- `PATH` 上有 ffmpeg

## 许可

MIT © AliceLJY
