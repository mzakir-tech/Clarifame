import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseProbeOutput, ProbeValidationError } from "@/lib/video/probe-validation.mjs";

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 12_000;
const PROBE_MAX_BUFFER = 256 * 1024;
const PROBE_SIZE_BYTES = 20 * 1024 * 1024;
const ANALYZE_DURATION_MICROSECONDS = 5_000_000;

export type InspectedMedia = {
  durationSeconds: number;
  containerFormat: "iso-bmff" | "webm";
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  contentType: "video/mp4" | "video/quicktime" | "video/webm";
};

export class MediaValidationError extends Error {
  constructor(readonly code: "invalid-media" | "unsupported-media" | "duration-limit" | "inspection-unavailable") {
    super(code);
    this.name = "MediaValidationError";
  }
}

/** Runs FFprobe without a shell, with bounded time, output, input protocols and probe size. */
export async function inspectMediaFile(filePath: string): Promise<InspectedMedia> {
  const binary = process.env.FFPROBE_PATH?.trim() || (process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  try {
    const { stdout } = await execFileAsync(binary, [
      "-v", "error",
      "-protocol_whitelist", "file,pipe",
      "-probesize", String(PROBE_SIZE_BYTES),
      "-analyzeduration", String(ANALYZE_DURATION_MICROSECONDS),
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,duration",
      "-of", "json",
      filePath,
    ], {
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: PROBE_MAX_BUFFER,
      windowsHide: true,
    });
    return parseProbeOutput(stdout) as InspectedMedia;
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    if (error instanceof ProbeValidationError) {
      throw new MediaValidationError(error.code as MediaValidationError["code"]);
    }
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code === "ENOENT") throw new MediaValidationError("inspection-unavailable");
    if (code === "ETIMEDOUT" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new MediaValidationError("invalid-media");
    }
    throw new MediaValidationError("invalid-media");
  }
}
