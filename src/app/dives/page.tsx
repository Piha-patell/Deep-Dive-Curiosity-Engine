"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import type { SavedDive } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth-provider";

export default function MyDivesPage() {
  const supabase = createSupabaseBrowserClient();
  const { isLoading, openAuthModal, user } = useAuth();
  const [dives, setDives] = useState<SavedDive[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoading) return;
    if (!user || !supabase) return;

    supabase
      .from("dives")
      .select("id, user_id, title, source_url, content_type, summary, full_analysis_json, created_at, updated_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(queryError.message);
        } else {
          setDives((data as SavedDive[]) || []);
        }
      });
  }, [isLoading, supabase, user]);

  const isFetching = isLoading || (!!user && !!supabase && dives === null && !error);

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:46px_46px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.16),transparent_34%),linear-gradient(180deg,rgba(5,7,10,0)_0%,#05070a_76%)]" />

      <section className="relative mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <TopNav />

        <div className="mt-14">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Library</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">My Dives</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            Reopen the dives worth keeping, without digging back through links or rerunning the whole analysis.
          </p>
        </div>

        {isLoading || isFetching ? (
          <div className="mt-10 flex min-h-72 items-center justify-center rounded-[28px] border border-white/10 bg-white/[0.04]">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-200" />
          </div>
        ) : !user ? (
          <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
            <h2 className="text-2xl font-semibold text-white">Log in to keep a personal trail of dives.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Saving and revisiting dives is available once you have an account.
            </p>
            <div className="mt-6 flex gap-3">
              <Button type="button" onClick={() => openAuthModal("login")}>
                Login
              </Button>
              <Button type="button" variant="secondary" onClick={() => openAuthModal("signup")}>
                Sign up
              </Button>
            </div>
          </div>
        ) : error ? (
          <div className="mt-10 rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : (dives?.length || 0) === 0 ? (
          <div className="mt-10 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-10">
            <h2 className="text-2xl font-semibold text-white">No saved dives yet.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
              Run a DeepDive from the homepage, then save the ones you want to revisit.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-cyan-300 px-5 text-sm font-medium text-slate-950 shadow-[0_0_28px_rgba(103,232,249,0.22)] transition hover:bg-cyan-200"
            >
              Go to homepage
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-4">
            {(dives || []).map((dive) => (
              <article
                key={dive.id}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-white/10 px-2.5 py-1 uppercase tracking-[0.2em]">
                        {dive.content_type === "youtube" ? "Video" : "Article"}
                      </span>
                      <span>{new Date(dive.created_at).toLocaleDateString()}</span>
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{dive.title}</h2>
                    <a
                      href={dive.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-cyan-200 transition hover:text-cyan-100"
                    >
                      {dive.source_url}
                    </a>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{dive.summary}</p>
                  </div>
                  <Link
                    href={`/dives/${dive.id}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-medium text-slate-950 shadow-[0_0_28px_rgba(103,232,249,0.22)] transition hover:bg-cyan-200"
                  >
                    Reopen dive
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
