import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  }

  return browserClient;
}
