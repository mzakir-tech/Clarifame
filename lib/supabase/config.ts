export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey || publishableKey.length < 20) return null;

  try {
    const parsedUrl = new URL(url);
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
    const secureProtocol = parsedUrl.protocol === "https:" || (localHost && parsedUrl.protocol === "http:");
    if (!secureProtocol || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || parsedUrl.hostname === "your-project.supabase.co") return null;
    return { url: parsedUrl.origin, publishableKey };
  } catch {
    return null;
  }
}

export function hasSupabaseConfig() {
  return getSupabaseConfig() !== null;
}
