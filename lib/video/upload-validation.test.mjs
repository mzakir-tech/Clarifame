import assert from "node:assert/strict";
import test from "node:test";
import { VIDEO_LIMITS } from "./constraints.mjs";
import { isUuid, parseUploadIntent, uploadBelongsToUser, validateUploadIntent } from "./upload-validation.mjs";

const requestId = "4e6dba8d-1015-492d-bd8b-7fbd8e34aa20";

test("upload intent accepts the existing byte boundary without relying on a MIME claim", () => {
  assert.deepEqual(parseUploadIntent({ requestId, sizeBytes: VIDEO_LIMITS.maxBytes, mimeType: "video/mp4" }), {
    requestId,
    sizeBytes: VIDEO_LIMITS.maxBytes,
  });
});

test("upload intent rejects malformed and oversized claims while leaving MIME verification to FFprobe", () => {
  assert.equal(parseUploadIntent(null), null);
  assert.equal(parseUploadIntent({ requestId: "bad", sizeBytes: 10, mimeType: "video/mp4" }), null);
  assert.equal(parseUploadIntent({ requestId, sizeBytes: 0, mimeType: "video/mp4" }), null);
  assert.equal(parseUploadIntent({ requestId, sizeBytes: VIDEO_LIMITS.maxBytes + 1, mimeType: "video/mp4" }), null);
  assert.notEqual(parseUploadIntent({ requestId, sizeBytes: 20, mimeType: "image/png" }), null);
  assert.equal(isUuid("4e6dba8d-1015-492d-bd8b-7fbd8e34aa20"), true);
  assert.equal(isUuid("not-an-id"), false);
  assert.equal(validateUploadIntent({ requestId, sizeBytes: VIDEO_LIMITS.maxBytes + 1, mimeType: "video/mp4" }).error, "too-large");
  assert.notEqual(validateUploadIntent({ requestId, sizeBytes: 20, mimeType: "image/png" }).value, undefined);
});

test("ownership comparison never accepts another user's upload row", () => {
  const record = { id: requestId, user_id: "owner-123" };
  assert.equal(uploadBelongsToUser(record, "owner-123"), true);
  assert.equal(uploadBelongsToUser(record, "other-user"), false);
  assert.equal(uploadBelongsToUser(null, "owner-123"), false);
});

test("migration declares owner-only reads, no client writes, a private bucket, and restrictive storage access", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const migrationPath = fileURLToPath(new URL("../../supabase/migrations/202610200001_video_uploads.sql", import.meta.url));
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /values\s*\(\s*'clariframe-private',\s*'clariframe-private',\s*false,\s*524288000/is);
  assert.match(sql, /alter table public\.video_uploads enable row level security/i);
  assert.match(sql, /grant select on public\.video_uploads to authenticated/i);
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /on storage\.objects as restrictive[\s\S]*using \(bucket_id <> 'clariframe-private'\)[\s\S]*with check \(bucket_id <> 'clariframe-private'\)/i);
});
