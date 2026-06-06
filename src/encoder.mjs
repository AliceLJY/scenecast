// ffmpeg wrappers: encode a frame sequence to mp4, and optionally mux audio.
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

export function encodeFrames({ framesDir, output, fps, width, height }) {
  runFfmpeg([
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "%05d.png"),
    "-vf", `scale=${width}:${height}:flags=lanczos`,
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    output,
  ]);
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
