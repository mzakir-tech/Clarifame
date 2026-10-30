"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export type AuthState = { error?: string; notice?: string };

async function authenticate(emailValue: FormDataEntryValue | null, passwordValue: FormDataEntryValue | null, createAccount: boolean): Promise<AuthState> {
  const email = String(emailValue ?? "").trim();
  const password = String(passwordValue ?? "");

  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "Enter a valid email address to continue." };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: "Your password must be between 8 and 128 characters." };
  }
  if (!hasSupabaseConfig()) {
    return { error: "Account access isn’t configured yet. Add the Supabase project URL and publishable key, then restart the app." };
  }

  try {
    const supabase = await createClient();
    if (createAccount) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: new URL("/auth/confirm", siteUrl).toString() },
      });
      if (error) return { error: "We couldn’t create your account. Check your details and try again." };
      if (!data.session) return { notice: "Check your inbox for a confirmation link before signing in." };
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: "Those sign-in details didn’t work. Check them and try again." };
    }
  } catch {
    return { error: "We couldn’t reach the account service. Please try again in a moment." };
  }

  redirect("/");
}

export async function signInAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  return authenticate(formData.get("email"), formData.get("password"), false);
}

export async function signUpAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  return authenticate(formData.get("email"), formData.get("password"), true);
}

export async function signOutAction() {
  if (!hasSupabaseConfig()) redirect("/");
  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  redirect(failed ? "/?auth=signout-failed#account" : "/#top");
}
