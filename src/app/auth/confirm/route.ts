import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "email",
  "email_change",
  "magiclink",
  "signup",
]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && allowedTypes.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/dashboard", url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
}
