import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/";
  const redirectTo = request.nextUrl.clone();

  redirectTo.pathname = next;
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  redirectTo.searchParams.delete("next");

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();

    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (!error) {
        return NextResponse.redirect(redirectTo);
      }
    }
  }

  redirectTo.pathname = "/";
  redirectTo.searchParams.set("auth", "error");
  return NextResponse.redirect(redirectTo);
}
