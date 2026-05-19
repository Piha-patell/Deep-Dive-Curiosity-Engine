"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, ExternalLink, Grip, Minimize2, NotebookPen, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeepDiveNode, DeepDiveResource, DeepDiveResult, StickyNote, StickyNoteColor } from "@/lib/deepdive";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved";

type MapNode = {
  id: string;
  label: string;
  type: DeepDiveNode["type"];
  description: string;
  depth: number;
  connectsTo: string[];
};

export function ResultsView({
  result,
  onSave,
  saveState = "idle",
  onNotesChange,
  onRequireLogin,
}: {
  result: DeepDiveResult;
  onSave?: () => void;
  saveState?: SaveState;
  onNotesChange?: (notes: StickyNote[]) => void;
  onRequireLogin?: () => void;
}) {
  const mapNodes = useMemo(() => buildMapNodes(result), [result]);
  const recommendations = useMemo(
    () =>
      (Array.isArray(result.recommendations) ? result.recommendations : []).filter((resource) =>
        hasDirectResourceUrl(resource),
      ),
    [result.recommendations],
  );
  const rootNode =
    mapNodes.find((node) => node.type === "main") || mapNodes[0] || createFallbackMainNode(result);

  const initialNodes = useMemo(() => {
    const chosen = [rootNode];
    for (const node of mapNodes) {
      if (chosen.length >= 6) break;
      if (!chosen.some((item) => item.id === node.id)) chosen.push(node);
    }
    return chosen.slice(0, 6);
  }, [mapNodes, rootNode]);

  const [selectedNodeId, setSelectedNodeId] = useState(rootNode?.id ?? "");
  const [note, setNote] = useState<StickyNote>(() => result.explorationNotes?.[0] || defaultStickyNote());
  const dragOffset = useRef({ x: 0, y: 0 });

  const selectedNode =
    mapNodes.find((node) => node.id === selectedNodeId) || initialNodes[0] || rootNode;
  const expandedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.connectsTo
      .map((id) => mapNodes.find((node) => node.id === id))
      .filter((node): node is MapNode => Boolean(node))
      .filter((node) => !initialNodes.some((visible) => visible.id === node.id))
      .slice(0, 3);
  }, [initialNodes, mapNodes, selectedNode]);

  const detailResource = pickResourceForNode(recommendations, selectedNode);
  const relatedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.connectsTo
      .map((id) => mapNodes.find((node) => node.id === id))
      .filter((node): node is MapNode => Boolean(node))
      .slice(0, 3);
  }, [mapNodes, selectedNode]);
  const [resourceView, setResourceView] = useState<"watch" | "read">("watch");
  const videoRecommendations = useMemo(
    () => recommendations.filter((resource) => resource.type === "video"),
    [recommendations],
  );
  const readRecommendations = useMemo(
    () => recommendations.filter((resource) => resource.type !== "video"),
    [recommendations],
  );
  const activeResourceView =
    resourceView === "watch" && !videoRecommendations.length && readRecommendations.length
      ? "read"
      : resourceView === "read" && !readRecommendations.length && videoRecommendations.length
        ? "watch"
        : resourceView;
  const filteredRecommendations = useMemo(() => {
    return activeResourceView === "watch" ? videoRecommendations : readRecommendations;
  }, [activeResourceView, readRecommendations, videoRecommendations]);

  useEffect(() => {
    onNotesChange?.([note]);
  }, [note, onNotesChange]);

  return (
    <section
      id="results"
      className="relative border-t border-white/10 bg-[#080b10] px-5 py-16 sm:px-8 lg:px-10"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.08),rgba(255,255,255,0.02)_35%,rgba(14,165,233,0.04))] p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <MetaPill>{labelForContentType(result.source.contentType)}</MetaPill>
                {result.source.durationSeconds ? (
                  <MetaPill>{formatDuration(result.source.durationSeconds)}</MetaPill>
                ) : null}
                <MetaPill>{result.difficulty}</MetaPill>
              </div>
              <h2 className="mt-5 max-w-4xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                {result.source.title}
              </h2>
              <p className="mt-5 max-w-3xl text-pretty text-base leading-7 text-slate-300 sm:text-lg">
                {result.summary.quick}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button
                type="button"
                className="h-12 min-w-48"
                onClick={() =>
                  document.getElementById("curiosity-map")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                <Sparkles className="h-4 w-4" />
                Start Exploring
              </Button>
              <Button
                type="button"
                className="h-12 min-w-48"
                variant={saveState === "saved" ? "secondary" : "ghost"}
                onClick={() => (onSave ? onSave() : onRequireLogin?.())}
                disabled={saveState === "saving"}
              >
                <Save className="h-4 w-4" />
                {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save Dive"}
              </Button>
            </div>
          </div>
        </section>

        <section
          id="curiosity-map"
          className="relative grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_360px] xl:grid-cols-[minmax(0,1.45fr)_390px]"
        >
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/35 backdrop-blur sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-cyan-200/75">
                  Interactive rabbit hole map
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Navigate the idea-space.</h3>
              </div>
              <p className="max-w-sm text-sm leading-6 text-slate-500">
                Start with a branch. The map opens outward as you click.
              </p>
            </div>

            <div className="mt-8 space-y-6">
              <div className="flex justify-center">
                <MapNodeCard
                  node={rootNode}
                  active={selectedNode?.id === rootNode.id}
                  compact={false}
                  onClick={() => setSelectedNodeId(rootNode.id)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {initialNodes
                  .filter((node) => node.id !== rootNode.id)
                  .map((node) => (
                    <MapNodeCard
                      key={node.id}
                      node={node}
                      active={selectedNode?.id === node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                    />
                  ))}
              </div>

              <div
                className={cn(
                  "grid overflow-hidden transition-all duration-500 ease-out",
                  expandedNodes.length ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0">
                  <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Related branches
                      </p>
                      <span className="text-xs text-slate-600">
                        {selectedNode ? `Opened from ${selectedNode.label}` : ""}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {expandedNodes.map((node) => (
                        <MapNodeCard
                          key={node.id}
                          node={node}
                          active={selectedNode?.id === node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[32px] border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/35 backdrop-blur sm:p-6 lg:sticky lg:top-6 lg:self-start">
            {selectedNode ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <NodeTypePill type={selectedNode.type} />
                  <MetaPill>{labelForNodeType(selectedNode.type)}</MetaPill>
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-white">{selectedNode.label}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{selectedNode.description}</p>

                <div className="mt-6 space-y-5">
                  <DetailBlock
                    label="Why it matters"
                    value={whyItMattersForNode(result, selectedNode)}
                  />
                  <DetailBlock
                    label="Related concepts"
                    value={
                      relatedNodes.length ? (
                        <div className="flex flex-wrap gap-2">
                          {relatedNodes.map((node) => (
                            <button
                              key={node.id}
                              type="button"
                              onClick={() => setSelectedNodeId(node.id)}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
                            >
                              {node.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        "This branch is a leaf for now, which makes it a good place to pause or open a next resource."
                      )
                    }
                  />
                  <DetailBlock
                    label="Next click"
                    value={
                      detailResource ? (
                        <a
                          href={safeResourceHref(detailResource) || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.06]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">{detailResource.title}</p>
                              <p className="mt-2 text-sm leading-6 text-slate-400">{detailResource.why}</p>
                            </div>
                            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                          </div>
                        </a>
                      ) : (
                        "No linked resource yet. Use the map to open another branch."
                      )
                    }
                  />
                </div>
              </>
            ) : (
              <EmptyState text="Pick a node to open its branch details." />
            )}
          </aside>

          <StickyNoteCard
            note={note}
            onChange={setNote}
            onDragStart={(event) => {
              dragOffset.current = {
                x: event.clientX - note.x,
                y: event.clientY - note.y,
              };
            }}
            onDragMove={(event) => {
              const noteWidth = 280;
              const minimizedWidth = 172;
              const noteHeight = note.minimized ? 44 : 260;
              const width = note.minimized ? minimizedWidth : noteWidth;

              setNote((current) => ({
                ...current,
                x: Math.max(
                  -width * 0.35,
                  Math.min(event.clientX - dragOffset.current.x, window.innerWidth - width * 0.65),
                ),
                y: Math.max(
                  8,
                  Math.min(event.clientY - dragOffset.current.y, window.innerHeight - noteHeight + 24),
                ),
              }));
            }}
          />
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/35 backdrop-blur sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-cyan-200/75">
                Recommended next resources
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Keep exploring from here.</h3>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              Switch between watch and read paths, then scroll horizontally through the best next clicks.
            </p>
          </div>

          <div className="mt-6">
            <div className="mb-4 inline-flex rounded-full border border-white/10 bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setResourceView("watch")}
                disabled={!videoRecommendations.length}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  activeResourceView === "watch"
                    ? "bg-cyan-300/12 text-cyan-100"
                    : "text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600",
                )}
              >
                Watch
              </button>
              <button
                type="button"
                onClick={() => setResourceView("read")}
                disabled={!readRecommendations.length}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  activeResourceView === "read"
                    ? "bg-cyan-300/12 text-cyan-100"
                    : "text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600",
                )}
              >
                Read
              </button>
            </div>

            {filteredRecommendations.length ? (
              <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filteredRecommendations.map((resource) => (
                  <a
                    key={`${resourceView}-${resource.title}-${resource.query}`}
                    href={safeResourceHref(resource) || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group min-w-[300px] max-w-[340px] snap-start rounded-[26px] border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <ResourceTypePill type={resource.type} />
                      <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-cyan-200" />
                    </div>
                    <p className="mt-4 text-lg font-medium text-white">{resource.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{resource.why}</p>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                text={
                  activeResourceView === "watch"
                    ? "No watch links for this dive yet. Switch to Read for articles and explainers."
                    : "No read links for this dive yet. Switch to Watch for video paths."
                }
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

const NOTE_COLORS: Array<{
  value: StickyNoteColor;
  swatch: string;
  className: string;
}> = [
  {
    value: "warm-yellow",
    swatch: "bg-[#8c7440]",
    className: "border-[#8c7440]/50 bg-[#8c7440]/18 text-[#fff6d9] shadow-[0_14px_40px_rgba(140,116,64,0.22)]",
  },
  {
    value: "soft-cyan",
    swatch: "bg-[#4e7382]",
    className: "border-[#4e7382]/50 bg-[#4e7382]/18 text-[#def8ff] shadow-[0_14px_40px_rgba(78,115,130,0.22)]",
  },
  {
    value: "sage-green",
    swatch: "bg-[#5d7862]",
    className: "border-[#5d7862]/50 bg-[#5d7862]/18 text-[#edf7ee] shadow-[0_14px_40px_rgba(93,120,98,0.22)]",
  },
  {
    value: "lavender",
    swatch: "bg-[#6d6287]",
    className: "border-[#6d6287]/50 bg-[#6d6287]/18 text-[#f0eaff] shadow-[0_14px_40px_rgba(109,98,135,0.22)]",
  },
  {
    value: "soft-orange",
    swatch: "bg-[#8a664b]",
    className: "border-[#8a664b]/50 bg-[#8a664b]/18 text-[#fff0e3] shadow-[0_14px_40px_rgba(138,102,75,0.22)]",
  },
  {
    value: "off-white",
    swatch: "bg-[#8d8f97]",
    className: "border-[#8d8f97]/45 bg-[#8d8f97]/16 text-[#f3f5fb] shadow-[0_14px_40px_rgba(141,143,151,0.2)]",
  },
];

function StickyNoteCard({
  note,
  onChange,
  onDragStart,
  onDragMove,
}: {
  note: StickyNote;
  onChange: React.Dispatch<React.SetStateAction<StickyNote>>;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragMove: (event: PointerEvent) => void;
}) {
  const color = NOTE_COLORS.find((entry) => entry.value === note.color) || NOTE_COLORS[0];

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-note-interactive='true']")) return;
    onDragStart(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointerEvent: PointerEvent) => onDragMove(pointerEvent);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="pointer-events-none fixed z-30 hidden lg:block"
      style={{ left: `${note.x}px`, top: `${note.y}px` }}
    >
      {note.minimized ? (
        <button
          type="button"
          onClick={() => onChange((current) => ({ ...current, minimized: false }))}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-2xl border px-3 py-2 backdrop-blur transition",
            color.className,
          )}
        >
          <NotebookPen className="h-4 w-4" />
          <span className="text-sm font-medium">Exploration Note</span>
        </button>
      ) : (
        <div
          onPointerDown={startDrag}
          className={cn(
            "pointer-events-auto w-[280px] rounded-[24px] border p-4 backdrop-blur transition",
            "cursor-grab active:cursor-grabbing",
            color.className,
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div
              className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] select-none touch-none"
            >
              <Grip className="h-4 w-4" />
              Exploration Notes
            </div>
            <button
              type="button"
              onClick={() => onChange((current) => ({ ...current, minimized: true }))}
              data-note-interactive="true"
              className="rounded-full border border-white/10 p-1.5 text-current/70 transition hover:border-white/20 hover:text-current"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2">
            {NOTE_COLORS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-label={entry.value}
                onClick={() => onChange((current) => ({ ...current, color: entry.value }))}
                data-note-interactive="true"
                className={cn(
                  "h-5 w-5 rounded-full border transition",
                  entry.swatch,
                  note.color === entry.value
                    ? "scale-110 border-white/60 ring-2 ring-white/30"
                    : "border-white/10 hover:border-white/30",
                )}
              />
            ))}
          </div>

          <textarea
            value={note.text}
            onChange={(event) => onChange((current) => ({ ...current, text: event.target.value }))}
            data-note-interactive="true"
            placeholder="Capture what stood out, what felt surprising, or what you want to revisit."
            className="min-h-36 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-current/55"
          />
        </div>
      )}
    </div>
  );
}

function MapNodeCard({
  node,
  active,
  onClick,
  compact = true,
}: {
  node: MapNode;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const accent = nodeAccent(node.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-[26px] border px-4 py-4 text-left transition-all duration-300",
        "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]",
        active ? accent.active : accent.idle,
        compact ? "min-h-[132px]" : "min-h-[148px] max-w-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-white">{node.label}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
            {oneLine(node.description)}
          </p>
        </div>
        <ArrowRight
          className={cn(
            "mt-1 h-4 w-4 shrink-0 transition",
            active ? "translate-x-0 text-white" : "text-slate-600 group-hover:translate-x-0.5 group-hover:text-slate-300",
          )}
        />
      </div>
      <div className="mt-4">
        <NodeTypePill type={node.type} />
      </div>
    </button>
  );
}

function NodeTypePill({ type }: { type: DeepDiveNode["type"] }) {
  const accent = nodeAccent(type);
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
        accent.pill,
      )}
    >
      {shortTypeLabel(type)}
    </span>
  );
}

function ResourceTypePill({ type }: { type: DeepDiveResource["type"] }) {
  const styles =
    type === "video"
      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
      : type === "paper"
        ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
        : type === "explainer"
          ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
          : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
        styles,
      )}
    >
      {labelForResourceType(type)}
    </span>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className="mt-3 text-sm leading-7 text-slate-300">{value}</div>
    </div>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function defaultStickyNote(): StickyNote {
  return {
    id: "exploration-note",
    text: "",
    color: "warm-yellow",
    minimized: false,
    x: 980,
    y: 220,
  };
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-slate-500">
      {text}
    </div>
  );
}

function buildMapNodes(result: DeepDiveResult): MapNode[] {
  const sourceNodes = Array.isArray(result.rabbitHoleMap) ? result.rabbitHoleMap : [];
  if (sourceNodes.length) return sourceNodes;

  const fallback: MapNode[] = [
    createFallbackMainNode(result),
    ...(result.prerequisites || []).slice(0, 2).map((item, index) => ({
      id: `prereq-${index}`,
      label: item.topic,
      type: "prerequisite" as const,
      description: item.reason,
      depth: 1,
      connectsTo: ["main-topic"],
    })),
    ...(result.keyConcepts || []).slice(0, 2).map((item, index) => ({
      id: `concept-${index}`,
      label: item.term,
      type: "related" as const,
      description: item.explanation,
      depth: 1,
      connectsTo: ["main-topic"],
    })),
    ...(result.opposingViewpoints || []).slice(0, 1).map((item, index) => ({
      id: `opposing-${index}`,
      label: item.viewpoint,
      type: "opposing" as const,
      description: item.argument,
      depth: 1,
      connectsTo: ["main-topic"],
    })),
  ];

  return fallback.slice(0, 6);
}

function createFallbackMainNode(result: DeepDiveResult): MapNode {
  return {
    id: "main-topic",
    label: result.summary.headline || result.source.title,
    type: "main",
    description: result.summary.quick,
    depth: 0,
    connectsTo: [],
  };
}

function whyItMattersForNode(result: DeepDiveResult, node: MapNode) {
  if (node.type === "main") return result.summary.whyItMatters;
  if (node.type === "prerequisite") {
    return "This is part of the background layer. If you understand it first, the rest of the topic unlocks faster.";
  }
  if (node.type === "opposing") {
    return "This branch keeps the dive honest. It helps you spot where the framing could be overstated or incomplete.";
  }
  if (node.type === "origin") {
    return "This gives the topic lineage. Knowing where an idea came from changes how much weight you should give it.";
  }
  if (node.type === "deeper") {
    return "This is where the rabbit hole meaningfully opens. It is useful once the main idea already makes sense.";
  }
  return "This branch gives the main topic more shape and helps you see how the surrounding concepts connect.";
}

function pickResourceForNode(
  resources: DeepDiveResource[],
  node: MapNode | undefined,
) {
  if (!node) return resources[0];

  const byType = resources.find((resource) => resourceTypeToNodeType(resource.type) === node.type);
  if (byType) return byType;

  const byLabel = resources.find((resource) =>
    `${resource.title} ${resource.why}`.toLowerCase().includes(node.label.toLowerCase()),
  );
  return byLabel || resources[0];
}

function resourceTypeToNodeType(type: DeepDiveResource["type"]): DeepDiveNode["type"] {
  if (type === "paper") return "origin";
  if (type === "explainer") return "prerequisite";
  if (type === "search") return "deeper";
  return "related";
}

function nodeAccent(type: DeepDiveNode["type"]) {
  const accents: Record<
    DeepDiveNode["type"],
    { idle: string; active: string; pill: string }
  > = {
    main: {
      idle: "border-cyan-300/20 shadow-[0_0_0_rgba(34,211,238,0)] hover:border-cyan-300/35 hover:shadow-[0_0_28px_rgba(34,211,238,0.14)]",
      active:
        "border-cyan-300/40 bg-cyan-300/[0.08] shadow-[0_0_34px_rgba(34,211,238,0.18)]",
      pill: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
    },
    related: {
      idle: "border-cyan-300/15 hover:border-cyan-300/30 hover:shadow-[0_0_22px_rgba(34,211,238,0.12)]",
      active:
        "border-cyan-300/35 bg-cyan-300/[0.06] shadow-[0_0_28px_rgba(34,211,238,0.14)]",
      pill: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    },
    prerequisite: {
      idle: "border-emerald-300/15 hover:border-emerald-300/30 hover:shadow-[0_0_22px_rgba(74,222,128,0.12)]",
      active:
        "border-emerald-300/35 bg-emerald-300/[0.06] shadow-[0_0_28px_rgba(74,222,128,0.14)]",
      pill: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    },
    deeper: {
      idle: "border-amber-300/15 hover:border-amber-300/30 hover:shadow-[0_0_22px_rgba(251,191,36,0.12)]",
      active:
        "border-amber-300/35 bg-amber-300/[0.06] shadow-[0_0_28px_rgba(251,191,36,0.14)]",
      pill: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    },
    opposing: {
      idle: "border-rose-300/15 hover:border-rose-300/30 hover:shadow-[0_0_22px_rgba(251,113,133,0.12)]",
      active:
        "border-rose-300/35 bg-rose-300/[0.06] shadow-[0_0_28px_rgba(251,113,133,0.14)]",
      pill: "border-rose-300/20 bg-rose-300/10 text-rose-100",
    },
    origin: {
      idle: "border-violet-300/15 hover:border-violet-300/30 hover:shadow-[0_0_22px_rgba(196,181,253,0.12)]",
      active:
        "border-violet-300/35 bg-violet-300/[0.06] shadow-[0_0_28px_rgba(196,181,253,0.14)]",
      pill: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    },
  };

  return accents[type];
}

function oneLine(text: string) {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return firstSentence.length > 72 ? `${firstSentence.slice(0, 69)}...` : firstSentence;
}

function formatDuration(durationSeconds: number) {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function labelForContentType(contentType: DeepDiveResult["source"]["contentType"]) {
  return contentType === "youtube" ? "YouTube video" : "Web page";
}

function labelForResourceType(type: DeepDiveResource["type"]) {
  if (type === "video") return "Video";
  if (type === "paper") return "Paper";
  if (type === "explainer") return "Explainer";
  return "Article";
}

function labelForNodeType(type: DeepDiveNode["type"]) {
  const labels: Record<DeepDiveNode["type"], string> = {
    main: "Main topic",
    prerequisite: "Prerequisite knowledge",
    related: "Core concept",
    deeper: "Deeper path",
    opposing: "Skeptical angle",
    origin: "Source origin",
  };

  return labels[type];
}

function shortTypeLabel(type: DeepDiveNode["type"]) {
  const labels: Record<DeepDiveNode["type"], string> = {
    main: "Core",
    prerequisite: "Prerequisite",
    related: "Concept",
    deeper: "Deeper",
    opposing: "Skeptical",
    origin: "Origin",
  };

  return labels[type];
}

function safeResourceHref(resource: DeepDiveResource) {
  if (resource.url) {
    try {
      const parsed = new URL(resource.url);
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !["google.com", "www.google.com", "duckduckgo.com", "www.duckduckgo.com"].includes(
          parsed.hostname.toLowerCase(),
        )
      ) {
        return parsed.toString();
      }
    } catch {
      return null;
    }
  }

  return null;
}

function hasDirectResourceUrl(resource: DeepDiveResource) {
  return Boolean(safeResourceHref(resource));
}
