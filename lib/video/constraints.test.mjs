import assert from "node:assert/strict";
import test from "node:test";
import { isValidVideoDuration, VIDEO_LIMITS, validateVideoFile } from "./constraints.mjs";

test("configured video formats are accepted", () => {
  for (const { mime } of VIDEO_LIMITS.formats) {
    assert.equal(validateVideoFile(mime, 1024), null);
  }
});

test("unconfigured media types are rejected", () => {
  assert.equal(validateVideoFile("image/png", 1024), "unsupported-type");
  assert.equal(validateVideoFile("", 1024), "unsupported-type");
});

test("the exact local preview byte limit is accepted", () => {
  assert.equal(validateVideoFile("video/mp4", VIDEO_LIMITS.maxBytes), null);
});

test("files larger than the limit are rejected", () => {
  assert.equal(validateVideoFile("video/mp4", VIDEO_LIMITS.maxBytes + 1), "too-large");
});

test("empty and invalid byte counts are rejected", () => {
  assert.equal(validateVideoFile("video/mp4", 0), "invalid-size");
  assert.equal(validateVideoFile("video/mp4", Number.NaN), "invalid-size");
  assert.equal(validateVideoFile("video/mp4", -1), "invalid-size");
});

test("positive finite video durations through 60 seconds are accepted", () => {
  assert.equal(isValidVideoDuration(0.1), true);
  assert.equal(isValidVideoDuration(VIDEO_LIMITS.maxDurationSeconds), true);
});

test("zero, invalid, and over-limit durations are rejected", () => {
  assert.equal(isValidVideoDuration(0), false);
  assert.equal(isValidVideoDuration(-1), false);
  assert.equal(isValidVideoDuration(60.01), false);
  assert.equal(isValidVideoDuration(Number.NaN), false);
  assert.equal(isValidVideoDuration(Number.POSITIVE_INFINITY), false);
});
