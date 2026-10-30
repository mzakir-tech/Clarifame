import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, validateUploadIntent } from "@/lib/video/upload-validation.mjs";

export const STORAGE_BUCKET = "clariframe-private";
const JSON_BODY_LIMIT = 4 * 1024;

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function requestIsSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!origin || !configuredSiteUrl) return false;
  try {
    return new URL(origin).origin === new URL(configuredSiteUrl).origin;
  } catch {
    return false;
  }
}

export async function readSmallJson(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > JSON_BODY_LIMIT) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > JSON_BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function isUuidValue(value: unknown): value is string {
  return isUuid(value);
}

export async function getAuthenticatedUser() {
  try {
    const client = await createUserClient();
    const { data, error } = await client.auth.getUser();
    return error || !data.user ? null : data.user;
  } catch {
    return null;
  }
}

export function validateIntentBody(body: Record<string, unknown>) {
  return validateUploadIntent(body);
}

export async function purgeExpiredUploads(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("video_uploads")
    .select("id, object_path")
    .eq("user_id", userId)
    .in("status", ["uploading", "deleting", "rejected"])
    .lt("expires_at", new Date().toISOString())
    .limit(5);
  if (error || !data?.length) return;

  for (const item of data) {
    const removed = await admin.storage.from(STORAGE_BUCKET).remove([item.object_path]);
    if (removed.error) continue;
    await admin.from("video_uploads").delete().eq("id", item.id).eq("user_id", userId);
  }
}

