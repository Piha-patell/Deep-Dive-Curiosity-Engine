import { NextResponse } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    apifyConfigured: Boolean(process.env.APIFY_TOKEN),
    openaiConfigured: Boolean(
      process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY,
    ),
    supabaseConfigured: Boolean(getSupabaseUrl() && getSupabasePublishableKey()),
  });
}
