export type ResourceType = "video" | "article" | "explainer" | "paper" | "search";
export type ContentType = "youtube" | "webpage";
export type DiveDifficulty = "Beginner Friendly" | "Intermediate" | "Advanced";
export type BestForLabel = "Quick Context" | "Deep Learning" | "Opposing Views";
export type StickyNoteColor =
  | "warm-yellow"
  | "soft-cyan"
  | "sage-green"
  | "lavender"
  | "soft-orange"
  | "off-white";

export type StickyNote = {
  id: string;
  text: string;
  color: StickyNoteColor;
  minimized: boolean;
  x: number;
  y: number;
};

export type DeepDiveResource = {
  title: string;
  type: ResourceType;
  why: string;
  difficulty: DiveDifficulty;
  query?: string;
  url?: string | null;
};

export type DeepDiveNode = {
  id: string;
  label: string;
  type: "main" | "prerequisite" | "related" | "deeper" | "opposing" | "origin";
  description: string;
  depth: number;
  connectsTo: string[];
};

export type DeepDiveResult = {
  source: {
    url: string;
    contentType: ContentType;
    title: string;
    author?: string;
    thumbnail?: string;
    extractedBy: "apify" | "demo";
    durationSeconds?: number;
    transcriptPreview: string;
  };
  summary: {
    headline: string;
    quick: string;
    whyItMatters: string;
    confidence: number;
  };
  difficulty: DiveDifficulty;
  bestFor: BestForLabel[];
  keyConcepts: Array<{
    term: string;
    explanation: string;
    importance: "core" | "supporting" | "advanced";
  }>;
  prerequisites: Array<{
    topic: string;
    reason: string;
    startingPoint: string;
  }>;
  guidedLearningPath: Array<{
    step: number;
    topic: string;
    explanation: string;
    difficulty: DiveDifficulty;
  }>;
  opposingViewpoints: Array<{
    viewpoint: string;
    argument: string;
    whatToCheck: string;
  }>;
  sourceContext: Array<{
    label: string;
    detail: string;
  }>;
  recommendations: DeepDiveResource[];
  rabbitHoleMap: DeepDiveNode[];
  explorationNotes?: StickyNote[];
};
