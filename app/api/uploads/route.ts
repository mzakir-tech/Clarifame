import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedUser,
  jsonError,
  jsonOk,
  purgeExpiredUploads,
  readSmallJson,
  requestIsSameOrigin,
  STORAGE_BUCKET,
  validateIntentBody,
} from "@/lib/video/upload-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("This upload request could not be verified.", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonError("A valid upload request is required.", 415);
  }

  const user = await getAuthenticatedUser();
  if (!user) return jsonError("Sign in before uploading a video.", 401);

  const body = await readSmallJson(request);
  const validation = body && validateIntentBody(body);
  if (!validation?.value) {
    if (validation?.error === "too-large") return jsonError("This video exceeds the 500 MiB upload limit.", 413);
    return jsonError("A valid upload request is required.", 400);
  }
  const intent = validation.value;

  try {
    const admin = createAdminClient();
    await purgeExpiredUploads(admin, user.id);

    let row: { id: string; user_id: string; request_id: string; object_path: string; status: string; expected_size_bytes: number } | null = null;
    let alreadyUploaded = false;
    const previous = await admin.from("video_uploads")
      .select("id, user_id, request_id, object_path, status, expected_size_bytes")
      .eq("user_id", user.id)
      .eq("request_id", intent.requestId)
      .maybeSingle();
    if (previous.error) return jsonError("Private uploads are temporarily unavailable.", 503);

    if (previous.data) {
      row = previous.data;
      if (row.expected_size_bytes !== intent.sizeBytes) {
        return jsonError("This upload request has already been used. Choose the file again to start a fresh upload.", 409);
      }
      if (row.status === "verified") return jsonOk({ uploadId: row.id, alreadyUploaded: true });
      if (row.status !== "uploading") return jsonError("This upload request has already been used. Choose the file again to start a fresh upload.", 409);
      const object = await admin.storage.from(STORAGE_BUCKET).info(row.object_path);
      alreadyUploaded = !object.error && Boolean(object.data);
    } else {
      const id = randomUUID();
      const objectPath = `${user.id}/${id}/source`;
      const inserted = await admin.from("video_uploads").insert({
        id,
        request_id: intent.requestId,
        user_id: user.id,
        object_path: objectPath,
        status: "uploading",
        expected_size_bytes: intent.sizeBytes,
      }).select("id, user_id, request_id, object_path, status, expected_size_bytes").single();
      if (inserted.error || !inserted.data) return jsonError("A private upload could not be prepared. Please try again.", 503);
      row = inserted.data;
    }

    if (alreadyUploaded) return jsonOk({ uploadId: row.id, alreadyUploaded: true });

    const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUploadUrl(row.object_path, { upsert: false });
    if (signed.error || !signed.data) {
      if (row.status === "uploading") {
        await admin.from("video_uploads").delete().eq("id", row.id).eq("user_id", user.id).eq("status", "uploading");
      }
      return jsonError("A secure upload could not be prepared. Please try again.", 503);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return jsonError("Private uploads are not configured.", 503);
    return jsonOk({
      uploadId: row.id,
      bucket: STORAGE_BUCKET,
      objectPath: row.object_path,
      token: signed.data.token,
      endpoint: `${new URL(supabaseUrl).origin}/storage/v1/upload/resumable`,
    });
  } catch {
    return jsonError("Private uploads are temporarily unavailable.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return jsonError("This upload request could not be verified.", 403);
  const user = await getAuthenticatedUser();
  if (!user) return jsonError("Sign in before managing uploaded videos.", 401);
  const body = await readSmallJson(request);
  const uploadId = body?.uploadId;
  if (typeof uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
    return jsonError("A valid upload identifier is required.", 400);
  }

  try {
    const admin = createAdminClient();
    const found = await admin.from("video_uploads")
      .select("id, user_id, object_path, status, expires_at")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (found.error) return jsonError("The private upload could not be verified.", 503);
    if (!found.data) return jsonError("That upload was not found for your account.", 404);
    if (found.data.status === "uploading" && new Date(found.data.expires_at).getTime() > Date.now()) {
      return jsonError("Wait for the upload to finish before removing it.", 409);
    }

    const marked = await admin.from("video_uploads").update({ status: "deleting", expires_at: new Date().toISOString() }).eq("id", uploadId).eq("user_id", user.id);
    if (marked.error) return jsonError("The private file could not be prepared for removal. Try again.", 503);
    const removed = await admin.storage.from(STORAGE_BUCKET).remove([found.data.object_path]);
    if (removed.error) return jsonError("The private file could not be removed yet. Try again.", 503);
    const deleted = await admin.from("video_uploads").delete().eq("id", uploadId).eq("user_id", user.id);
    if (deleted.error) return jsonError("The file was removed, but its record could not be cleared. Try again.", 503);
    return jsonOk({ deleted: true });
  } catch {
    return jsonError("The private file could not be removed yet. Try again.", 503);
  }
}
