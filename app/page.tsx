import { HomeExperience } from "@/app/home-experience";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type StoredUpload = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  containerFormat: string;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  let userEmail: string | null = null;
  let userId: string | null = null;
  let accountState: "signed-in" | "signed-out" | "not-configured" | "unavailable" = "not-configured";
  let storedUploads: StoredUpload[] = [];
  let uploadLibraryReady = false;

  if (hasSupabaseConfig()) {
    accountState = "signed-out";
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) accountState = "unavailable";
      else if (data.user) {
        accountState = "signed-in";
        userId = data.user.id;
        userEmail = data.user.email ?? null;
        const uploads = await supabase.from("video_uploads")
          .select("id, created_at, inspected_size_bytes, duration_seconds, width, height, video_codec, container_format")
          .eq("user_id", data.user.id)
          .eq("status", "verified")
          .order("created_at", { ascending: false });
        if (!uploads.error) {
          uploadLibraryReady = true;
          storedUploads = (uploads.data ?? []).map((upload) => ({
            id: upload.id,
            createdAt: upload.created_at,
            sizeBytes: Number(upload.inspected_size_bytes),
            durationSeconds: Number(upload.duration_seconds),
            width: Number(upload.width),
            height: Number(upload.height),
            videoCodec: upload.video_codec,
            containerFormat: upload.container_format,
          }));
        }
      }
    } catch {
      accountState = "unavailable";
    }
  }

  const confirmation = typeof params.confirmation === "string" ? params.confirmation : undefined;
  const authNotice = params.auth === "signout-failed"
    ? "We couldn’t end your session. Refresh and try signing out again."
    : confirmation === "success"
      ? accountState === "signed-in" ? "Your email is confirmed and your account is active." : "Your email is confirmed. You can sign in below."
      : confirmation === "failed"
        ? "That confirmation link could not be verified or has expired. Request a new one and try again."
        : undefined;

  return <HomeExperience accountState={accountState} userEmail={userEmail} userId={userId} authNotice={authNotice} initialUploads={storedUploads} uploadLibraryReady={uploadLibraryReady} />;
}
