"use client";

import { use } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ResultsView } from "@/components/results-view";
import { TopNav } from "@/components/top-nav";
import type { SavedDive } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth-provider";

export default function SavedDiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createSupabaseBrowserClient();
  const { isLoading, openAuthModal, user } = useAuth();
  const [dive, setDive] = useState<SavedDive | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || isLoading) return;
    if (!user || !supabase) return;

    supabase
      .from("dives")
      .select("id, user_id, title, source_url, content_type, summary, full_analysis_json, created_at, updated_at")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(queryError.message);
        } else if (!data) {
          setError("We could not find that saved dive.");
        } else {
          setDive(data as SavedDive);
        }
      });
  }, [id, isLoading, supabase, user]);

  const isFetching = isLoading || (!!user && !!supabase && !dive && !error);

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:46px_46px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.16),transparent_34%),linear-gradient(180deg,rgba(5,7,10,0)_0%,#05070a_76%)]" />

      <section className="relative mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <TopNav />
        <div className="mt-10">
          <Link
            href="/dives"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Dives
          </Link>
        </div>
      </section>

      {isLoading || isFetching ? (
        <section className="relative px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto flex min-h-72 max-w-7xl items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04]">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-200" />
          </div>
        </section>
      ) : !user ? (
        <section className="relative px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
            <h1 className="text-2xl font-semibold text-white">Log in to open saved dives.</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Saved analysis is private to your account.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="mt-6 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 transition hover:border-cyan-300/35"
            >
              Login
            </button>
          </div>
        </section>
      ) : error ? (
        <section className="relative px-5 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        </section>
      ) : dive ? (
        <ResultsView result={dive.full_analysis_json} saveState="saved" onSave={() => undefined} />
      ) : null}
    </main>
  );
}
