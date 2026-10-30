import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code && hasSupabaseConfig()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/?confirmation=success#account", request.url));
    } catch {
      // Keep provider/network details out of the browser response.
    }
  }

  return NextResponse.redirect(new URL("/?confirmation=failed#account", request.url));
}
