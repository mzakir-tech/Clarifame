import { NextRequest } from "next/server";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedUser,
  isUuidValue,
  jsonError,
  jsonOk,
  readSmallJson,
  requestIsSameOrigin,
  STORAGE_BUCKET,
} from "@/lib/video/upload-api";
import { VIDEO_LIMITS } from "@/lib/video/constraints.mjs";
import { inspectMediaFile, MediaValidationError } from "@/lib/video/server-inspection";

export const runtime = "nodejs";
export const maxDuration = 300;

const SIGNED_READ_SECONDS = 15 * 60;

async function downloadToTemporaryFile(url: string, expectedBytes: number) {
  const directory = await mkdtemp(join(tmpdir(), "clariframe-inspect-"));
  const filePath = join(directory, "source-media");
  let byteCount = 0;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error("The uploaded object is not available yet.");
    const responseLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(responseLength) && responseLength > VIDEO_LIMITS.maxBytes) {
      throw new MediaValidationError("invalid-media");
    }

    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteCount += chunk.byteLength;
        if (byteCount > VIDEO_LIMITS.maxBytes || byteCount > expectedBytes) {
          callback(new MediaValidationError("invalid-media"));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as never),
      limit,
      createWriteStream(filePath, { flags: "wx", mode: 0o600 }),
      { signal: AbortSignal.timeout(5 * 60 * 1000) },
    );
    const fileStats = await stat(filePath);
    if (byteCount !== expectedBytes || fileStats.size !== expectedBytes) {
      throw new MediaValidationError("invalid-media");
    }
    return { directory, filePath };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("This upload request could not be verified.", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonError("A valid upload identifier is required.", 415);
  }
  const user = await getAuthenticatedUser();
  if (!user) return jsonError("Sign in before verifying an uploaded video.", 401);

  const body = await readSmallJson(request);
  const uploadId = body?.uploadId;
  if (!isUuidValue(uploadId)) return jsonError("A valid upload identifier is required.", 400);

  try {
    const admin = createAdminClient();
    const lookup = await admin.from("video_uploads")
      .select("id, user_id, object_path, status, expected_size_bytes, inspected_size_bytes, duration_seconds, container_format, video_codec, audio_codec, width, height, expires_at")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookup.error) return jsonError("The private upload could not be verified.", 503);
    const row = lookup.data;
    if (!row) return jsonError("That upload was not found for your account.", 404);
    if (row.status === "verified") {
      return jsonOk({
        uploadId: row.id,
        status: "verified",
        sizeBytes: row.inspected_size_bytes,
        durationSeconds: row.duration_seconds,
        containerFormat: row.container_format,
        videoCodec: row.video_codec,
        audioCodec: row.audio_codec,
        width: row.width,
        height: row.height,
      });
    }
    if (row.status !== "uploading") return jsonError("This upload cannot be verified. Choose the file again to retry.", 409);
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return jsonError("This upload has expired. Choose the file again to start a fresh upload.", 410);
    }

    const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(row.object_path, SIGNED_READ_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      return jsonError("The uploaded file is not complete yet. Retry the upload and try again.", 409);
    }

    let temporary: { directory: string; filePath: string } | null = null;
    try {
      temporary = await downloadToTemporaryFile(signed.data.signedUrl, Number(row.expected_size_bytes));
      const inspected = await inspectMediaFile(temporary.filePath);
      const update = await admin.from("video_uploads").update({
        status: "verified",
        inspected_size_bytes: Number(row.expected_size_bytes),
        duration_seconds: inspected.durationSeconds,
        container_format: inspected.containerFormat,
        video_codec: inspected.videoCodec,
        audio_codec: inspected.audioCodec,
        width: inspected.width,
        height: inspected.height,
        inspected_at: new Date().toISOString(),
        expires_at: null,
      }).eq("id", row.id).eq("user_id", user.id).eq("status", "uploading").select("id").maybeSingle();
      if (update.error) return jsonError("The video passed inspection, but its record could not be saved. Retry verification.", 503);
      if (!update.data) {
        const latest = await admin.from("video_uploads").select("status").eq("id", row.id).eq("user_id", user.id).maybeSingle();
        if (latest.data?.status !== "verified") return jsonError("The upload changed while it was being verified. Retry verification.", 409);
      }

      return jsonOk({
        uploadId: row.id,
        status: "verified",
        sizeBytes: Number(row.expected_size_bytes),
        durationSeconds: inspected.durationSeconds,
        containerFormat: inspected.containerFormat,
        videoCodec: inspected.videoCodec,
        audioCodec: inspected.audioCodec,
        width: inspected.width,
        height: inspected.height,
        contentType: inspected.contentType,
      });
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "inspection-unavailable") {
        return jsonError("FFprobe is not configured on the server. Your private upload is retained temporarily so you can retry after setup.", 503);
      }

      if (error instanceof MediaValidationError) {
        await admin.from("video_uploads").update({ status: "rejected", expires_at: new Date().toISOString() })
          .eq("id", row.id).eq("user_id", user.id).eq("status", "uploading");
        const removed = await admin.storage.from(STORAGE_BUCKET).remove([row.object_path]);
        if (removed.error) {
          return jsonError("The file did not pass server inspection. Its private object is retained for cleanup and cannot be downloaded through this application.", 422);
        }
        const messages: Record<string, string> = {
          "duration-limit": "This video is longer than the 60-second limit. The private upload was rejected.",
          "unsupported-media": "The file uses an unsupported container or video/audio codec. Choose a valid MP4, MOV, or WebM clip.",
          "invalid-media": "The uploaded bytes are malformed, incomplete, or not a supported video. The private upload was rejected.",
        };
        return jsonError(messages[error.code] ?? "The uploaded file could not be verified as a video.", 422);
      }

      return jsonError("Server-side video inspection could not be completed. Retry verification in a moment.", 503);
    } finally {
      if (temporary) await rm(temporary.directory, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch {
    return jsonError("Private video verification is temporarily unavailable.", 503);
  }
}
