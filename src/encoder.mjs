// ffmpeg wrappers: encode a frame sequence to mp4/webm/gif, and optionally mux audio.
import { execFileSync } from "node:child_process";
import path from "node:path";

function runFfmpeg(args) {
  try {
    execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
  } catch (e) {
    if (e && e.code === "ENOENT") {
      throw new Error(
        "ffmpeg was not found on PATH. Install it and retry:\n" +
          "  macOS:        brew install ffmpeg\n" +
          "  Debian/Ubuntu: sudo apt install ffmpeg\n" +
          "  Windows:      https://ffmpeg.org/download.html",
      );
    }
    throw e;
  }
}

// Build ffmpeg args by output extension:
//   .mp4  → H.264 (libx264)
//   .webm → VP9 (libvpx-vp9)
//   .gif  → palettegen/paletteuse for accurate colors
// All paths share the same lanczos downscale from the 2x-supersampled frames.
function encodeArgs({ framesDir, output, fps, width, height }) {
  const pattern = path.join(framesDir, "%05d.png");
  const scale = `scale=${width}:${height}:flags=lanczos`;
  const head = ["-y", "-framerate", String(fps), "-i", pattern];
  const ext = path.extname(output).toLowerCase();

  if (ext === ".webm") {
    return [
      ...head,
      "-vf", scale,
      "-c:v", "libvpx-vp9", "-crf", "31", "-b:v", "0",
      "-pix_fmt", "yuv420p", "-r", String(fps),
      output,
    ];
  }

  if (ext === ".gif") {
    // Single pass: generate an optimized palette from the frames, then apply it.
    const fc =
      `[0:v]${scale},split[a][b];` +
      `[a]palettegen=stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
    return [...head, "-filter_complex", fc, "-r", String(fps), output];
  }

  // default: mp4 / H.264
  return [
    ...head,
    "-vf", scale,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium",
    "-pix_fmt", "yuv420p", "-r", String(fps),
    output,
  ];
}

export function encodeFrames({ framesDir, output, fps, width, height }) {
  runFfmpeg(encodeArgs({ framesDir, output, fps, width, height }));
}

export function muxAudio({ video, audio, output }) {
  if (path.resolve(video) === path.resolve(output)) {
    throw new Error(`muxAudio: video and output resolve to the same path: ${output}`);
  }
  runFfmpeg([
    "-y",
    "-i", video,
    "-i", audio,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    output,
  ]);
}
