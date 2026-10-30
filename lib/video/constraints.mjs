export const VIDEO_LIMITS = {
  maxBytes: 500 * 1024 * 1024,
  maxDurationSeconds: 60,
  formats: [
    { mime: "video/mp4", label: "MP4" },
    { mime: "video/quicktime", label: "MOV" },
    { mime: "video/webm", label: "WebM" },
  ],
};

export function validateVideoFile(type, size) {
  if (!VIDEO_LIMITS.formats.some((format) => format.mime === type)) return "unsupported-type";
  if (!Number.isFinite(size) || size <= 0) return "invalid-size";
  if (size > VIDEO_LIMITS.maxBytes) return "too-large";
  return null;
}

export function isValidVideoDuration(duration) {
  return Number.isFinite(duration) && duration > 0 && duration <= VIDEO_LIMITS.maxDurationSeconds;
}
