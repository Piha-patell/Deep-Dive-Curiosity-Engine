"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { ResultsView } from "@/components/results-view";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import type { DeepDiveResult, StickyNote } from "@/lib/deepdive";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth-provider";

const exampleUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const FREE_DIVE_LIMIT = 6;
const FREE_DIVE_STORAGE_KEY = "deepdive.freeDiveCount";
const LOADING_STAGES = [
  {
    title: "Extracting the source",
    detail: "Pulling transcript and metadata from the link.",
  },
  {
    title: "Mapping the ideas",
    detail: "Finding the concepts, tensions, and branching paths.",
  },
  {
    title: "Shaping the rabbit hole",
    detail: "Turning the analysis into a guided curiosity map.",
  },
] as const;

type AppStatus = {
  apifyConfigured: boolean;
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
};

export default function Home() {
  const supabase = createSupabaseBrowserClient();
  const { openAuthModal, user } = useAuth();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<DeepDiveResult | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [freeDiveCount, setFreeDiveCount] = useState(0);
  const [hasHydratedUsage, setHasHydratedUsage] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loadingStage, setLoadingStage] = useState(0);

  const freeDivesLeft = Math.max(FREE_DIVE_LIMIT - freeDiveCount, 0);
  const isGuestLocked = !user && freeDivesLeft <= 0;

  useEffect(() => {
    const hydrateUsage = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FREE_DIVE_STORAGE_KEY);
      setFreeDiveCount(stored ? Number(stored) || 0 : 0);
      setHasHydratedUsage(true);
    }, 0);

    fetch("/api/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus(null));

    return () => window.clearTimeout(hydrateUsage);
  }, []);

  useEffect(() => {
    if (!isLoading) return;

    const interval = window.setInterval(() => {
      setLoadingStage((current) => (current + 1) % LOADING_STAGES.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isGuestLocked) {
      openAuthModal("signup", "You’ve used all 6 free DeepDives. Create an account to keep exploring.");
      return;
    }

    setError("");
    setSaveState("idle");
    setLoadingStage(0);
    setIsLoading(true);

    try {
      const response = await fetch("/api/deepdive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url || exampleUrl }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Unable to process that link.");
        return;
      }

      setResult(payload);
      setNotes(payload.explorationNotes ?? []);

      if (!user) {
        const nextCount = freeDiveCount + 1;
        setFreeDiveCount(nextCount);
        window.localStorage.setItem(FREE_DIVE_STORAGE_KEY, String(nextCount));
      }

      setTimeout(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setError("DeepDive could not reach the analyzer. Check the dev server and try again.");
    } finally {
      setIsLoading(false);
      setLoadingStage(0);
    }
  }

  async function saveDive() {
    if (!result) return;

    if (!user) {
      openAuthModal("signup", "Create an account to save this dive and revisit it later.");
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured yet, so saving is unavailable.");
      return;
    }

    setSaveState("saving");

    const { data, error: saveError } = await supabase
      .from("dives")
      .upsert(
        {
          user_id: user.id,
          title: result.source.title,
          source_url: result.source.url,
          content_type: result.source.contentType,
          summary: result.summary.quick,
          full_analysis_json: {
            ...result,
            explorationNotes: notes,
          },
        },
        { onConflict: "user_id,source_url" },
      )
      .select("id")
      .single();

    if (saveError) {
      setError(saveError.message);
      setSaveState("idle");
      return;
    }

    setSaveState("saved");
    if (data?.id) {
      setError("");
    }
  }

  const heroNote = useMemo(() => {
    if (user) return "Signed in. Save dives and revisit them from My Dives.";
    if (!hasHydratedUsage) return "Free preview available";
    if (isGuestLocked) return "You’ve used all 6 free DeepDives. Sign up to keep exploring.";
    return `${freeDivesLeft} free dive${freeDivesLeft === 1 ? "" : "s"} left`;
  }, [freeDivesLeft, hasHydratedUsage, isGuestLocked, user]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070a] text-slate-100">
      <Backdrop />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <TopNav />

        <div className="flex flex-1 items-center justify-center py-14 sm:py-20">
          <div className="w-full max-w-5xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-1.5 text-sm text-cyan-100">
                Guided curiosity for videos and articles
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <HeroSignal
                  title="Clarity first"
                  text="Clean structure instead of a crowded dashboard."
                />
                <HeroSignal
                  title="Worth saving"
                  text="Keep the dives you want to come back to."
                />
              </div>
              <h1 className="mt-7 text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-7xl">
                Understand the link, then know where to go next.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
                DeepDive turns a link into a clean exploration path with key concepts,
                missing context, skeptical views, and the next best resources to open.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-4xl rounded-[28px] border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-black/40 backdrop-blur">
              <form onSubmit={analyze} className="flex flex-col gap-3 md:flex-row">
                <label className="sr-only" htmlFor="url">
                  Link to analyze
                </label>
                <div className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl bg-black/20 px-4">
                  <Search className="h-5 w-5 shrink-0 text-slate-500" />
                  <input
                    id="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="Paste a YouTube, article, blog post, or thread link"
                    className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500 sm:text-base"
                  />
                </div>
                <Button type="submit" className="h-14 px-6" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Analyze
                </Button>
              </form>

              <div className="mt-4 flex flex-col gap-3 border-t border-white/10 px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">{heroNote}</div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setUrl(exampleUrl)}
                    className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-cyan-300/35 hover:text-cyan-100"
                  >
                    Try sample link
                  </button>
                  <span className="rounded-full border border-white/10 px-3 py-1.5">
                    YouTube first. Articles and threads next.
                  </span>
                </div>
              </div>
            </div>

            {status && (!status.apifyConfigured || !status.openaiConfigured) ? (
              <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Real analysis needs{" "}
                {!status.apifyConfigured && !status.openaiConfigured
                  ? "APIFY_TOKEN and OPENAI_API_KEY or GROQ_API_KEY"
                  : !status.apifyConfigured
                    ? "APIFY_TOKEN"
                    : "OPENAI_API_KEY or GROQ_API_KEY"}{" "}
                in <span className="font-mono text-amber-50">.env.local</span>. Until then,
                DeepDive runs in preview mode.
              </div>
            ) : null}

            {error ? (
              <p className="mx-auto mt-5 max-w-3xl rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            ) : null}

            {isGuestLocked ? (
              <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-sm leading-6 text-cyan-50">
                You’ve used the free preview. Create an account to keep generating dives and save the
                ones worth revisiting.
              </div>
            ) : null}
          </div>
        </div>

      </section>

      {result ? (
        <ResultsView
          key={`${result.source.url}-${result.source.title}`}
          result={{ ...result, explorationNotes: notes }}
          onSave={saveDive}
          saveState={saveState}
          onNotesChange={setNotes}
          onRequireLogin={() =>
            openAuthModal("signup", "Create an account to save this dive and keep it in My Dives.")
          }
        />
      ) : (
        <PreviewPanel isLoading={isLoading} loadingStage={loadingStage} />
      )}
    </main>
  );
}

function Backdrop() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:46px_46px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(103,232,249,0.16),transparent_34%),linear-gradient(180deg,rgba(5,7,10,0)_0%,#05070a_76%)]" />
    </>
  );
}

function HeroSignal({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-left shadow-[0_0_24px_rgba(251,191,36,0.08)]">
      <p className="text-xs font-medium text-amber-100">{title}</p>
      <p className="text-[11px] leading-4 text-amber-200/75">{text}</p>
    </div>
  );
}

function PreviewPanel({
  isLoading,
  loadingStage,
}: {
  isLoading: boolean;
  loadingStage: number;
}) {
  const stage = LOADING_STAGES[loadingStage] || LOADING_STAGES[0];

  return (
    <section className="relative border-t border-white/10 bg-[#080b10] px-5 py-16 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        {isLoading ? (
          <LoadingExperience stage={stage} loadingStage={loadingStage} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Result flow</p>
              <h2 className="mt-3 text-3xl font-semibold text-white">A cleaner curiosity engine.</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                The results view now leads with a short explanation, then moves into concepts,
                prerequisites, a guided path, and a smaller rabbit hole map. The goal is simple:
                know where to start in under ten seconds.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Key Concepts", "Prerequisites", "Learning Path", "Next Resources"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="font-medium text-white">{item}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Compact, scannable cards with progressive detail instead of walls of text.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LoadingExperience({
  stage,
  loadingStage,
}: {
  stage: (typeof LOADING_STAGES)[number];
  loadingStage: number;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-center">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-200/80">Building your deep dive</p>
        <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">{stage.title}</h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{stage.detail}</p>

        <div className="mt-6 flex gap-2">
          {LOADING_STAGES.map((item, index) => (
            <div
              key={item.title}
              className={`h-2 rounded-full transition-all duration-500 ${
                index === loadingStage
                  ? "w-16 bg-cyan-300 shadow-[0_0_20px_rgba(103,232,249,0.45)]"
                  : "w-8 bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.16),transparent_58%)]" />
        <div className="relative mx-auto flex min-h-[240px] max-w-md items-center justify-center">
          <div className="relative w-full max-w-[360px]">
            <div className="absolute left-8 right-8 top-[56%] h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
            <div className="flex items-center justify-between gap-3">
              <LoadingStageNode
                label="Source"
                delay="0ms"
                active={loadingStage >= 0}
              />
              <LoadingStageNode
                label="Concepts"
                delay="180ms"
                active={loadingStage >= 1}
              />
              <LoadingStageNode
                label="Map"
                delay="360ms"
                active
                featured
              />
              <LoadingStageNode
                label="Next"
                delay="720ms"
                active={loadingStage >= 2}
              />
            </div>
            <div className="mt-8 flex justify-center">
              <LoadingStageNode
                label="Tensions"
                delay="540ms"
                active={loadingStage >= 1}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingStageNode({
  label,
  delay,
  active,
  featured = false,
}: {
  label: string;
  delay: string;
  active: boolean;
  featured?: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] transition-all ${
          featured
            ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-50 shadow-[0_0_34px_rgba(103,232,249,0.24)]"
            : active
              ? "border-cyan-300/28 bg-cyan-300/8 text-cyan-100 shadow-[0_0_24px_rgba(103,232,249,0.16)]"
              : "border-white/10 bg-white/[0.03] text-slate-500"
        } animate-pulse`}
        style={{ animationDelay: delay }}
      >
        {label}
      </div>
    </div>
  );
}
