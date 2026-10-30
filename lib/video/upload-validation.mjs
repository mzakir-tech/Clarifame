import { VIDEO_LIMITS } from "./constraints.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** The client byte count is bounded for resource safety; MIME hints never decide media validity. */
export function validateUploadIntent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid-request" };
  const { requestId, sizeBytes } = body;
  if (!isUuid(requestId) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return { error: "invalid-request" };
  if (sizeBytes > VIDEO_LIMITS.maxBytes) return { error: "too-large" };
  return { value: { requestId, sizeBytes } };
}

export function parseUploadIntent(body) {
  return validateUploadIntent(body).value ?? null;
}

export function uploadBelongsToUser(record, authenticatedUserId) {
  return Boolean(record && typeof authenticatedUserId === "string" && record.user_id === authenticatedUserId);
}
