import assert from "node:assert/strict";
import test from "node:test";
import { ProbeValidationError, parseProbeOutput } from "./probe-validation.mjs";

const mp4 = (duration = "12.5", extras = {}) => JSON.stringify({
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration },
  streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, duration }, ...extras.streams ?? []],
});

test("accepts valid MP4 metadata and returns normalized inspection fields", () => {
  assert.deepEqual(parseProbeOutput(mp4("12.5")), {
    durationSeconds: 12.5,
    containerFormat: "iso-bmff",
    videoCodec: "h264",
    audioCodec: null,
    width: 1920,
    height: 1080,
    contentType: "video/mp4",
  });
});

test("accepts the exact 60-second boundary and rejects longer media", () => {
  assert.equal(parseProbeOutput(mp4("60")).durationSeconds, 60);
  assert.throws(() => parseProbeOutput(mp4("60.01")), (error) => error instanceof ProbeValidationError && error.code === "duration-limit");
});

test("uses the longest reported stream or container duration", () => {
  const output = JSON.stringify({
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "30" },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 640, height: 480, duration: "61" },
      { codec_type: "audio", codec_name: "aac", duration: "30" },
    ],
  });
  assert.throws(() => parseProbeOutput(output), (error) => error.code === "duration-limit");
});

test("rejects missing video streams, malformed bytes, and unsupported containers", () => {
  assert.throws(() => parseProbeOutput("not-json"), (error) => error.code === "invalid-media");
  assert.throws(() => parseProbeOutput(JSON.stringify({ format: { format_name: "avi", duration: "4" }, streams: [] })), (error) => error.code === "unsupported-media");
  assert.throws(() => parseProbeOutput(JSON.stringify({ format: { format_name: "mp4", duration: "4" }, streams: [{ codec_type: "audio", codec_name: "aac" }] })), (error) => error.code === "unsupported-media");
});

test("rejects unsupported video and audio codecs or missing dimensions", () => {
  assert.throws(() => parseProbeOutput(mp4("4", { streams: [{ codec_type: "video", codec_name: "prores", width: 1920, height: 1080 }] })), (error) => error.code === "unsupported-media");
  assert.throws(() => parseProbeOutput(mp4("4", { streams: [{ codec_type: "audio", codec_name: "pcm_s24le" }] })), (error) => error.code === "unsupported-media");
  assert.throws(() => parseProbeOutput(JSON.stringify({ format: { format_name: "webm", duration: "4" }, streams: [{ codec_type: "video", codec_name: "vp9", width: 0, height: 720 }] })), (error) => error.code === "unsupported-media");
});

test("accepts supported WebM streams", () => {
  const output = JSON.stringify({
    format: { format_name: "matroska,webm", duration: "4" },
    streams: [
      { codec_type: "video", codec_name: "vp9", width: 1280, height: 720, duration: "4" },
      { codec_type: "audio", codec_name: "opus", duration: "4" },
    ],
  });
  assert.equal(parseProbeOutput(output).contentType, "video/webm");
});
