import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk, STORAGE_BUCKET } from "@/lib/video/upload-api";

export const runtime = "nodejs";
export const maxDuration = 300;

function validCronAuthorization(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request)) return jsonError("Not found.", 404);

  try {
    const admin = createAdminClient();
    const { data: expired, error } = await admin.from("video_uploads")
      .select("id, user_id, object_path")
      .in("status", ["uploading", "deleting", "rejected"])
      .lt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(25);
    if (error) return jsonError("Cleanup could not be completed.", 503);

    let removed = 0;
    let retained = 0;
    for (const row of expired ?? []) {
      const result = await admin.storage.from(STORAGE_BUCKET).remove([row.object_path]);
      if (result.error) {
        retained += 1;
        continue;
      }
      const deleted = await admin.from("video_uploads").delete()
        .eq("id", row.id)
        .eq("user_id", row.user_id)
        .eq("object_path", row.object_path);
      if (deleted.error) retained += 1;
      else removed += 1;
    }

    return jsonOk({ inspected: expired?.length ?? 0, removed, retained });
  } catch {
    return jsonError("Cleanup could not be completed.", 503);
  }
}
