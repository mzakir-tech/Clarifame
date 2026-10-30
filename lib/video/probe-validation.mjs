import { VIDEO_LIMITS } from "./constraints.mjs";

export class ProbeValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProbeValidationError";
    this.code = code;
  }
}

function finitePositive(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

/** Validates container and stream fields produced by FFprobe. */
export function parseProbeOutput(output) {
  let document;
  try {
    document = JSON.parse(output);
  } catch {
    throw new ProbeValidationError("invalid-media");
  }

  const formatNames = typeof document.format?.format_name === "string"
    ? document.format.format_name.toLowerCase().split(",")
    : [];
  const isIsoBmff = formatNames.some((name) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(name));
  const isWebm = formatNames.includes("webm");
  if (!isIsoBmff && !isWebm) throw new ProbeValidationError("unsupported-media");

  const streams = Array.isArray(document.streams) ? document.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  if (!videoStreams.length) throw new ProbeValidationError("unsupported-media");

  const videoCodecs = new Set(isWebm ? ["vp8", "vp9", "av1"] : ["h264", "hevc", "av1", "mpeg4"]);
  const audioCodecs = new Set(isWebm ? ["opus", "vorbis"] : ["aac", "mp3", "alac"]);
  const videoCodec = typeof videoStreams[0].codec_name === "string" ? videoStreams[0].codec_name.toLowerCase() : "";
  if (!videoCodecs.has(videoCodec) || videoStreams.some((stream) => {
    const codec = typeof stream.codec_name === "string" ? stream.codec_name.toLowerCase() : "";
    return !videoCodecs.has(codec) || !finitePositive(stream.width) || !finitePositive(stream.height);
  })) {
    throw new ProbeValidationError("unsupported-media");
  }

  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const audioCodec = audioStreams.length && typeof audioStreams[0].codec_name === "string"
    ? audioStreams[0].codec_name.toLowerCase()
    : null;
  if (audioStreams.some((stream) => {
    const codec = typeof stream.codec_name === "string" ? stream.codec_name.toLowerCase() : "";
    return !audioCodecs.has(codec);
  })) {
    throw new ProbeValidationError("unsupported-media");
  }

  const durations = [finitePositive(document.format?.duration), ...streams.map((stream) => finitePositive(stream.duration))]
    .filter((duration) => duration !== null);
  const durationSeconds = durations.length ? Math.max(...durations) : null;
  if (durationSeconds === null) throw new ProbeValidationError("invalid-media");
  if (durationSeconds > VIDEO_LIMITS.maxDurationSeconds) throw new ProbeValidationError("duration-limit");

  return {
    durationSeconds,
    containerFormat: isWebm ? "webm" : "iso-bmff",
    videoCodec,
    audioCodec,
    width: Number(videoStreams[0].width),
    height: Number(videoStreams[0].height),
    contentType: isWebm ? "video/webm" : "video/mp4",
  };
}
