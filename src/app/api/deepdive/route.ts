import { ApifyClient } from "apify-client";
import { load } from "cheerio";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { fetchTranscript } from "youtube-transcript";
import type { ContentType, DeepDiveResource, DeepDiveResult } from "@/lib/deepdive";

export const runtime = "nodejs";
export const maxDuration = 60;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const TRANSCRIPT_CACHE = new Map<string, { value: ExtractedContent; expiresAt: number }>();
const RESULT_CACHE = new Map<string, { value: DeepDiveResult; expiresAt: number }>();

type ExtractedContent = {
  url: string;
  contentType: ContentType;
  title: string;
  author?: string;
  thumbnail?: string;
  durationSeconds?: number;
  transcript: string;
  extractedBy: "apify" | "youtube-transcript" | "webpage" | "metadata" | "demo";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "Paste a YouTube URL to explore." }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "That does not look like a valid URL." }, { status: 400 });
    }

    const cacheKey = getContentCacheKey(url);
    const cachedResult = getCachedValue(RESULT_CACHE, cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    const extracted = isYouTubeUrl(parsed)
      ? await extractYouTube(url)
      : await extractWebpage(url);
    const result = await analyzeContent(extracted);
    setCachedValue(RESULT_CACHE, cacheKey, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    if (error instanceof Error) {
      return NextResponse.json({ error: friendlyErrorMessage(error.message) }, { status: 500 });
    }

    return NextResponse.json(
      { error: "DeepDive hit a processing snag with that link. Try another link or retry in a moment." },
      { status: 500 },
    );
  }
}

function isYouTubeUrl(url: URL) {
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
    url.hostname,
  );
}

async function extractYouTube(url: string): Promise<ExtractedContent> {
  const cacheKey = getContentCacheKey(url);
  const cachedTranscript = getCachedValue(TRANSCRIPT_CACHE, cacheKey);
  if (cachedTranscript) return cachedTranscript;

  let apifyError: unknown = null;

  if (process.env.APIFY_TOKEN) {
    try {
      const extracted = await extractYouTubeWithApify(url);
      setCachedValue(TRANSCRIPT_CACHE, cacheKey, extracted);
      return extracted;
    } catch (error) {
      apifyError = error;
      console.error("Apify transcript extraction failed, trying fallback extractor.", error);
    }
  }

  try {
    const fallback = await extractYouTubeWithFallback(url);
    setCachedValue(TRANSCRIPT_CACHE, cacheKey, fallback);
    return fallback;
  } catch (fallbackError) {
    console.error("Fallback transcript extraction failed.", fallbackError);

    if (apifyError instanceof Error) {
      throw apifyError;
    }

    if (fallbackError instanceof Error) {
      throw fallbackError;
    }
  }

  const metadataFallback = await extractYouTubeMetadataFallback(url);
  setCachedValue(TRANSCRIPT_CACHE, cacheKey, metadataFallback);
  return metadataFallback;
}

async function extractYouTubeWithApify(url: string): Promise<ExtractedContent> {
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const actorId = process.env.APIFY_YOUTUBE_ACTOR_ID || "harvestlab/youtube-scraper";
  const input = buildApifyInput(url);
  const run = await withRetry(
    () => client.actor(actorId).call(input),
    "Apify transcript actor is rate limited right now.",
  );
  const { items } = await withRetry(
    () => client.dataset(run.defaultDatasetId).listItems({ limit: 10 }),
    "Apify transcript dataset is rate limited right now.",
  );
  const item = items.find((candidate) => extractTranscript(candidate).length > 80) || items[0];

  if (!item) {
    throw new Error("Apify returned no dataset items.");
  }

  const transcript = extractTranscript(item);

  if (!transcript) {
    throw new Error("Apify did not return a transcript for this video.");
  }

  const extracted: ExtractedContent = {
    url,
    contentType: "youtube",
    title: stringFrom(item, ["title", "videoTitle", "name"]) || "Untitled YouTube video",
    author: stringFrom(item, ["channelTitle", "channelName", "author", "channel"]),
    thumbnail: stringFrom(item, ["thumbnail", "thumbnailUrl", "image"]),
    durationSeconds: extractDurationSeconds(item),
    transcript,
    extractedBy: "apify",
  };

  return extracted;
}

async function extractYouTubeWithFallback(url: string): Promise<ExtractedContent> {
  const transcriptLanguages = (process.env.APIFY_TRANSCRIPT_LANGUAGES || "en,en-US")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const preferredLanguage = transcriptLanguages[0];
  const transcriptItems = await withRetry(
    () => fetchTranscript(url, preferredLanguage ? { lang: preferredLanguage } : undefined),
    "The YouTube transcript fallback is rate limited right now.",
  );

  if (!transcriptItems.length) {
    throw new Error("The fallback extractor did not return any transcript segments.");
  }

  const metadata = await fetchYouTubeOEmbed(url);
  const transcript = transcriptItems.map((item) => item.text.trim()).filter(Boolean).join(" ");

  if (!transcript) {
    throw new Error("The fallback extractor returned an empty transcript.");
  }

  return {
    url,
    contentType: "youtube",
    title: metadata.title || "Untitled YouTube video",
    author: metadata.author,
    thumbnail: metadata.thumbnail,
    durationSeconds: undefined,
    transcript,
    extractedBy: "youtube-transcript",
  };
}

async function fetchYouTubeOEmbed(url: string) {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    {
      headers: {
        "User-Agent": "DeepDiveBot/1.0",
      },
      next: { revalidate: 60 * 60 * 24 },
    },
  );

  if (!response.ok) {
    return { title: "", author: "", thumbnail: "" };
  }

  const data = (await response.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };

  return {
    title: data.title?.trim() || "",
    author: data.author_name?.trim() || "",
    thumbnail: data.thumbnail_url?.trim() || "",
  };
}

async function extractYouTubeMetadataFallback(url: string): Promise<ExtractedContent> {
  const metadata = await fetchYouTubeOEmbed(url);
  const parsed = new URL(url);
  const videoId =
    parsed.hostname === "youtu.be"
      ? parsed.pathname.replaceAll("/", "")
      : parsed.searchParams.get("v") || "";
  const title = metadata.title || "Untitled YouTube video";
  const author = metadata.author || "Unknown creator";
  const transcript = [
    `Title: ${title}.`,
    `Creator: ${author}.`,
    videoId ? `Video ID: ${videoId}.` : "",
    "This DeepDive was created from video metadata because transcript extraction was unavailable.",
    "Keep the analysis cautious, focus on the likely topic, and treat fine-grained claims as lower confidence.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    url,
    contentType: "youtube",
    title,
    author,
    thumbnail: metadata.thumbnail,
    durationSeconds: undefined,
    transcript,
    extractedBy: "metadata",
  };
}

async function extractWebpage(url: string): Promise<ExtractedContent> {
  const cacheKey = getContentCacheKey(url);
  const cachedContent = getCachedValue(TRANSCRIPT_CACHE, cacheKey);
  if (cachedContent) return cachedContent;

  let extracted: ExtractedContent;

  try {
    const response = await withRetry(
      () =>
        fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; DeepDiveBot/1.0; +https://deepdive.local)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
          },
        }),
      "The webpage is rate limited right now.",
    );

    if (!response.ok) {
      throw new Error(`Webpage fetch failed with status ${response.status}.`);
    }

    const html = await response.text();
    extracted = extractWebpageFromHtml(response.url || url, html);
  } catch (error) {
    console.error("Webpage extraction failed, falling back to metadata-only extraction.", error);
    extracted = extractUrlMetadataFallback(url);
  }

  setCachedValue(TRANSCRIPT_CACHE, cacheKey, extracted);
  return extracted;
}

function extractWebpageFromHtml(url: string, html: string): ExtractedContent {
  const $ = load(html);
  $("script, style, noscript, iframe, svg, form, nav, footer, header, aside").remove();

  const title =
    pickFirstText([
      $('meta[property="og:title"]').attr("content"),
      $('meta[name="twitter:title"]').attr("content"),
      $("title").first().text(),
      $("h1").first().text(),
    ]) || "Untitled webpage";

  const description = pickFirstText([
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content"),
  ]);

  const author = pickFirstText([
    $('meta[name="author"]').attr("content"),
    $('meta[property="article:author"]').attr("content"),
    $('[rel="author"]').first().text(),
  ]);

  const thumbnail = pickFirstText([
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
  ]);

  const articleRoot = $("article").first();
  const paragraphSource = articleRoot.length ? articleRoot : $("main").first().length ? $("main").first() : $("body");

  const textSegments = paragraphSource
    .find("h1, h2, h3, p, li, blockquote")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((text) => text.length > 35)
    .slice(0, 80);

  const transcript = buildWebTranscript(title, description, textSegments);

  if (transcript.length < 160) {
    throw new Error("The webpage did not expose enough readable text to analyze.");
  }

  return {
    url,
    contentType: "webpage",
    title,
    author,
    thumbnail,
    transcript,
    extractedBy: "webpage",
  };
}

function buildWebTranscript(title: string, description: string, textSegments: string[]) {
  return [title, description, ...textSegments]
    .map((text) => normalizeWhitespace(text))
    .filter(Boolean)
    .join(" ")
    .slice(0, 24000);
}

function extractUrlMetadataFallback(url: string): ExtractedContent {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment).replace(/[-_]+/g, " ").trim())
    .filter(Boolean);
  const title =
    pathSegments[pathSegments.length - 1]
      ?.replace(/\b\w/g, (letter) => letter.toUpperCase()) || parsed.hostname;
  const transcript = [
    `Title or slug: ${title}.`,
    `Domain: ${parsed.hostname}.`,
    pathSegments.length ? `Path context: ${pathSegments.join(" / ")}.` : "",
    "This DeepDive used URL metadata fallback because the full page text was unavailable.",
    "Treat the analysis as directional rather than authoritative, and use it to decide what to open next.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    url,
    contentType: "webpage",
    title,
    author: parsed.hostname,
    thumbnail: undefined,
    transcript,
    extractedBy: "metadata",
  };
}

function normalizeWhitespace(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function pickFirstText(values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (normalized) return normalized;
  }
  return "";
}

function buildApifyInput(url: string) {
  if (process.env.APIFY_ACTOR_INPUT_JSON) {
    return JSON.parse(process.env.APIFY_ACTOR_INPUT_JSON.replaceAll("{{url}}", url));
  }

  const transcriptLanguages = (process.env.APIFY_TRANSCRIPT_LANGUAGES || "en,en-US")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    mode: "transcript",
    videoUrls: [url],
    transcriptLanguages,
    includeTranscripts: true,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: (process.env.APIFY_PROXY_GROUPS || "RESIDENTIAL")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  };
}

function friendlyErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("no dataset items")) {
    return "We could not extract anything usable from that video. It may be blocked, unavailable, or unsupported by the transcript source.";
  }

  if (normalized.includes("did not return a transcript")) {
    return "That video does not appear to have a usable transcript right now, so DeepDive cannot analyze it yet.";
  }

  if (
    normalized.includes("fallback extractor did not return any transcript") ||
    normalized.includes("fallback extractor returned an empty transcript") ||
    normalized.includes("transcript is disabled")
  ) {
    return "This video is available, but its transcript could not be extracted right now. Try another video or retry in a few minutes.";
  }

  if (normalized.includes("did not expose enough readable text")) {
    return "That page loaded, but it did not expose enough readable text for a useful DeepDive yet.";
  }

  if (normalized.includes("webpage fetch failed")) {
    return "DeepDive could not read that page directly. It may block automated readers or require sign-in.";
  }

  if (normalized.includes("video unavailable")) {
    return "That YouTube video is unavailable, private, or blocked from transcript retrieval.";
  }

  if (normalized.includes("fetch failed") || normalized.includes("network")) {
    return "DeepDive ran into a network issue while fetching the video or recommendations. Please try again.";
  }

  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return "DeepDive is temporarily hitting a rate limit. Please wait a moment and try again.";
  }

  return "DeepDive hit a processing snag with that link. Try another video or retry in a moment.";
}

function extractTranscript(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  const direct = stringFrom(record, [
    "transcript_llm",
    "transcript_text",
    "transcriptText",
    "transcriptPlainText",
    "text",
  ]);

  if (direct) return direct;

  const segments = record.transcript || record.transcript_segments || record.segments;
  if (Array.isArray(segments)) {
    return segments
      .map((segment) =>
        typeof segment === "string"
          ? segment
          : stringFrom(segment, ["text", "caption", "value"]),
      )
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function stringFrom(item: unknown, keys: string[]) {
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberFrom(item: unknown, keys: string[]) {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;

    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return null;
}

function extractDurationSeconds(item: unknown) {
  const numericDuration = numberFrom(item, [
    "durationSeconds",
    "lengthSeconds",
    "durationInSeconds",
    "videoDurationSeconds",
  ]);

  if (numericDuration) return Math.round(numericDuration);

  const rawDuration = stringFrom(item, ["duration", "durationText", "lengthText", "videoDuration"]);
  if (!rawDuration) return undefined;

  const isoMatch = rawDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (isoMatch) {
    const hours = Number(isoMatch[1] || 0);
    const minutes = Number(isoMatch[2] || 0);
    const seconds = Number(isoMatch[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const parts = rawDuration
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2 && parts.every((part) => /^\d+$/.test(part))) {
    return parts.reduce((total, part) => total * 60 + Number(part), 0);
  }

  return undefined;
}

async function analyzeContent(content: ExtractedContent): Promise<DeepDiveResult> {
  const cacheKey = getContentCacheKey(content.url);
  const cachedResult = getCachedValue(RESULT_CACHE, cacheKey);
  if (cachedResult) return cachedResult;

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (!openAiKey && !groqKey && !geminiKey) {
    return demoAnalysis(content);
  }

  const provider = openAiKey ? "openai" : groqKey ? "groq" : "gemini";
  const openai = new OpenAI({
    apiKey: openAiKey || groqKey || geminiKey,
    baseURL:
      provider === "groq"
        ? "https://api.groq.com/openai/v1"
        : provider === "gemini"
          ? "https://generativelanguage.googleapis.com/v1beta/openai/"
          : undefined,
  });

  const completion = await withRetry(
    () =>
      openai.chat.completions.create({
    model: resolveModel(provider),
    temperature: 0.45,
    reasoning_effort: provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are DeepDive, an AI curiosity engine. Return only valid JSON matching the requested shape. Focus on structured learning, context building, and next-step exploration. Be concise, concrete, and avoid hype.",
      },
      {
        role: "user",
        content: `Analyze this source as a clean guided learning experience.

Return JSON with this exact top-level shape:
{
  "summary": {"headline": string, "quick": string, "whyItMatters": string, "confidence": number},
  "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced",
  "bestFor": Array<"Quick Context" | "Deep Learning" | "Opposing Views">,
  "keyConcepts": [{"term": string, "explanation": string, "importance": "core"|"supporting"|"advanced"}],
  "prerequisites": [{"topic": string, "reason": string, "startingPoint": string}],
  "guidedLearningPath": [
    {"step": 1, "topic": string, "explanation": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced"},
    {"step": 2, "topic": string, "explanation": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced"},
    {"step": 3, "topic": string, "explanation": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced"},
    {"step": 4, "topic": string, "explanation": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced"},
    {"step": 5, "topic": string, "explanation": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced"}
  ],
  "opposingViewpoints": [{"viewpoint": string, "argument": string, "whatToCheck": string}],
  "sourceContext": [{"label": string, "detail": string}],
  "recommendations": [{"title": string, "type": "video"|"article"|"explainer"|"paper"|"search", "why": string, "difficulty": "Beginner Friendly" | "Intermediate" | "Advanced", "query": string, "url": string}],
  "rabbitHoleMap": [{"id": string, "label": string, "type": "main"|"prerequisite"|"related"|"deeper"|"opposing"|"origin", "description": string, "depth": number, "connectsTo": string[]}]
}

Rules:
- Keep the summary under 3 sentences.
- Keep all card copy compact and scannable.
- Recommendations should be real next steps, not generic placeholders.
- Rabbit hole map should stay small: 1 main node plus 3 to 5 meaningful branches.
- Recommendations must use direct, readable destinations with full https URLs. Prefer official pages, YouTube watch URLs, publisher pages, papers, or explainers.
- Never return Google search URLs or generic search result pages.
- If you are not highly confident in a direct URL, omit that recommendation instead of guessing.

Title: ${content.title}
Channel/author: ${content.author || "Unknown"}
Transcript:
${content.transcript.slice(0, 18000)}`,
      },
    ],
      }),
    `${provider} is rate limited right now.`,
  );

  const parsed = JSON.parse(completion.choices[0]?.message.content || "{}") as Omit<
    DeepDiveResult,
    "source"
  >;

  const result = {
    source: {
      url: content.url,
      contentType: content.contentType,
      title: content.title,
      author: content.author,
      thumbnail: content.thumbnail,
      extractedBy: content.extractedBy,
      durationSeconds: content.durationSeconds,
      transcriptPreview: content.transcript.slice(0, 360),
    },
    ...parsed,
    recommendations: await finalizeRecommendations(content, parsed),
  };

  setCachedValue(RESULT_CACHE, cacheKey, result);
  return result;
}

function getContentCacheKey(url: string) {
  try {
    const parsed = new URL(url);
    const videoId =
      parsed.hostname === "youtu.be"
        ? parsed.pathname.replaceAll("/", "")
        : parsed.searchParams.get("v");

    if (videoId) return `youtube:${videoId}`;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function getCachedValue<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function withRetry<T>(fn: () => Promise<T>, rateLimitMessage: string, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === retries) {
        break;
      }

      await sleep(1200 * (attempt + 1));
    }
  }

  if (lastError instanceof Error && isRateLimitError(lastError)) {
    throw new Error(rateLimitMessage);
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown request failure.");
}

function isRateLimitError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("429") || message.includes("rate limit") || message.includes("quota");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveModel(provider: "openai" | "groq" | "gemini") {
  if (provider === "openai") {
    return process.env.OPENAI_MODEL || "gpt-4.1-mini";
  }

  if (provider === "groq") {
    return process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  }

  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

async function sanitizeRecommendations(recommendations: DeepDiveResult["recommendations"]) {
  const cleaned = recommendations
    .map(normalizeRecommendation)
    .filter((resource) => {
      if (!resource?.url) return false;

      try {
        const parsed = new URL(resource.url);
        if (!["http:", "https:"].includes(parsed.protocol)) return false;
        const blockedHosts = ["www.google.com", "google.com", "duckduckgo.com", "www.duckduckgo.com"];
        if (blockedHosts.includes(parsed.hostname.toLowerCase())) return false;
        return true;
      } catch {
        return false;
      }
    });

  const reachable = await Promise.all(
    cleaned.map(async (resource) => {
      const isReachable = await verifyRecommendationUrl(resource);
      return isReachable ? resource : null;
    }),
  );

  return reachable.filter((resource): resource is DeepDiveResult["recommendations"][number] => Boolean(resource));
}

function normalizeRecommendation(
  resource: DeepDiveResult["recommendations"][number],
): DeepDiveResource {
  if (!resource.url) return resource;

  try {
    const parsed = new URL(resource.url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(hostname)) {
      return { ...resource, type: "video" as const };
    }

    if (hostname === "www.ted.com" || hostname === "ted.com") {
      if (pathname.startsWith("/talks")) {
        return { ...resource, type: "video" as const };
      }

      if (pathname.startsWith("/topics")) {
        return { ...resource, type: "article" as const };
      }
    }

    if (hostname === "ed.ted.com" || pathname.endsWith(".pdf")) {
      return {
        ...resource,
        type: resource.type === "paper" || pathname.endsWith(".pdf") ? "paper" : "explainer",
      };
    }
  } catch {
    return resource;
  }

  return resource;
}

async function finalizeRecommendations(
  content: ExtractedContent,
  parsed: Omit<DeepDiveResult, "source">,
) {
  const sanitized = await sanitizeRecommendations(parsed.recommendations || []);
  const fallbackPool = buildCuratedFallbackRecommendations(content, parsed);
  const fallbackSanitized = await sanitizeRecommendations(fallbackPool);

  const merged = [...sanitized];
  for (const resource of fallbackSanitized) {
    if (!merged.some((item) => item.url === resource.url || item.title === resource.title)) {
      merged.push(resource);
    }
  }

  return pickBalancedRecommendations(merged);
}

function pickBalancedRecommendations(recommendations: DeepDiveResult["recommendations"]) {
  const watch = recommendations.filter((resource) => resource.type === "video");
  const read = recommendations.filter((resource) => resource.type !== "video");
  const chosen: DeepDiveResult["recommendations"] = [];

  if (watch.length) chosen.push(watch[0]);
  if (read.length) chosen.push(read[0]);

  for (const resource of recommendations) {
    if (chosen.length >= 3) break;
    if (!chosen.some((item) => item.url === resource.url || item.title === resource.title)) {
      chosen.push(resource);
    }
  }

  return chosen.slice(0, 3);
}

async function verifyRecommendationUrl(resource: DeepDiveResult["recommendations"][number]) {
  const url = resource.url!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "DeepDiveBot/1.0",
      },
    });

    if (headResponse.ok) {
      return verifyVideoDestination(resource, url);
    }

    if ([403, 405].includes(headResponse.status)) {
      const getResponse = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "DeepDiveBot/1.0",
        },
      });
      if (!getResponse.ok) return false;
      return verifyVideoDestination(resource, getResponse.url || url);
    }

    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyVideoDestination(
  resource: DeepDiveResult["recommendations"][number],
  resolvedUrl: string,
) {
  if (resource.type !== "video") return true;

  try {
    const parsed = new URL(resolvedUrl);
    const hostname = parsed.hostname.toLowerCase();

    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(hostname)) {
      if (hostname === "youtu.be" || parsed.pathname === "/watch") {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(resolvedUrl)}&format=json`,
          {
            headers: { "User-Agent": "DeepDiveBot/1.0" },
          },
        );
        return oembed.ok;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function buildCuratedFallbackRecommendations(
  content: ExtractedContent,
  parsed: Omit<DeepDiveResult, "source">,
): DeepDiveResult["recommendations"] {
  const haystack = `${content.title} ${content.transcript} ${parsed.summary?.quick || ""}`.toLowerCase();
  const resources: DeepDiveResult["recommendations"] = [];

  const add = (resource: DeepDiveResult["recommendations"][number]) => {
    if (!resources.some((item) => item.url === resource.url || item.title === resource.title)) {
      resources.push(resource);
    }
  };

  if (haystack.includes("motivat") || haystack.includes("stuck") || haystack.includes("goal")) {
    add({
      title: "TED-Ed YouTube Channel",
      type: "video",
      why: "A reliable watch path if you want more short, well-produced explainers in the same educational style.",
      difficulty: "Beginner Friendly",
      query: "TED-Ed YouTube channel motivation",
      url: "https://www.youtube.com/@TEDEd",
    });
    add({
      title: "TED YouTube Channel",
      type: "video",
      why: "A strong next watch source for adjacent motivation, psychology, and self-direction talks.",
      difficulty: "Beginner Friendly",
      query: "TED YouTube channel motivation talks",
      url: "https://www.youtube.com/@TED",
    });
    add({
      title: "Why you feel stuck — and how to get motivated",
      type: "explainer",
      why: "The official TED-Ed lesson page for the exact talk, with a stable canonical destination instead of a repost.",
      difficulty: "Beginner Friendly",
      query: "TED why you feel stuck and how to get motivated",
      url: "https://ed.ted.com/lessons/why-you-feel-stuck-and-how-to-get-motivated-shannon-odell",
    });
    add({
      title: "Ideas about Motivation",
      type: "article",
      why: "A curated TED collection that stays tightly relevant if you want adjacent talks instead of generic search results.",
      difficulty: "Beginner Friendly",
      query: "TED motivation topic",
      url: "https://www.ted.com/topics/motivation",
    });
    add({
      title: "Locke’s Goal-Setting Theory",
      type: "article",
      why: "A practical explanation of goal-setting mechanics that directly complements the motivation and sub-goal ideas in the source.",
      difficulty: "Intermediate",
      query: "Locke goal setting theory MindTools",
      url: "https://www.mindtools.com/azazlu3/lockes-goal-setting-theory/",
    });
  }

  if (haystack.includes("procrastinat")) {
    add({
      title: "Need to stop procrastinating? Try this.",
      type: "article",
      why: "Useful if the user’s next question is less about motivation in theory and more about getting unstuck in practice.",
      difficulty: "Beginner Friendly",
      query: "TED-Ed procrastination try this",
      url: "https://ed.ted.com/blog/2019/08/05/need-to-stop-procrastinating-try-this",
    });
  }

  return resources;
}

function demoAnalysis(content: ExtractedContent): DeepDiveResult {
  return {
    source: {
      url: content.url,
      contentType: "youtube",
      title: content.title,
      author: content.author,
      thumbnail: content.thumbnail,
      extractedBy: content.extractedBy,
      durationSeconds: content.durationSeconds,
      transcriptPreview: content.transcript.slice(0, 360),
    },
    summary: {
      headline: "This is really about turning passive content into an intentional learning path.",
      quick:
        "The source argues that the best way to understand internet content is to surface prerequisite ideas, competing explanations, and source context instead of stopping at a summary. It reframes curiosity as a structured process for deciding what to learn next.",
      whyItMatters:
        "That shift helps people build durable understanding instead of collecting disconnected takes.",
      confidence: 0.82,
    },
    difficulty: "Intermediate",
    bestFor: ["Quick Context", "Deep Learning"],
    keyConcepts: [
      {
        term: "Active exploration",
        explanation: "Treating content as the start of an investigation rather than the end of it.",
        importance: "core",
      },
      {
        term: "Prerequisite knowledge",
        explanation: "The background concepts you need before the main argument becomes clear.",
        importance: "core",
      },
      {
        term: "Source tracing",
        explanation: "Following a claim back to its origin to see how solid it actually is.",
        importance: "supporting",
      },
      {
        term: "Question-driven learning",
        explanation: "Using better follow-up questions to shape what you study next.",
        importance: "advanced",
      },
    ],
    prerequisites: [
      {
        topic: "Media literacy",
        reason: "You need a basic feel for how claims spread online and why framing matters.",
        startingPoint: "Learn how summaries and clips can strip away context.",
      },
      {
        topic: "Learning loops",
        reason: "The source assumes that reflection and synthesis improve retention.",
        startingPoint: "Understand why retrieval and elaboration deepen comprehension.",
      },
      {
        topic: "Evidence vs assertion",
        reason: "The framework depends on distinguishing confident language from real support.",
        startingPoint: "Practice asking what evidence a claim actually rests on.",
      },
    ],
    guidedLearningPath: [
      {
        step: 1,
        topic: "Prerequisites",
        explanation: "Start by grounding the background ideas the speaker assumes you already know.",
        difficulty: "Beginner Friendly",
      },
      {
        step: 2,
        topic: "Core concepts",
        explanation: "Identify the main claims so you understand the shape of the argument.",
        difficulty: "Intermediate",
      },
      {
        step: 3,
        topic: "Missing context",
        explanation: "Notice what examples, evidence, or historical background would sharpen the picture.",
        difficulty: "Intermediate",
      },
      {
        step: 4,
        topic: "Opposing perspectives",
        explanation: "Pressure-test the argument by looking at where the framing may overreach.",
        difficulty: "Advanced",
      },
      {
        step: 5,
        topic: "Where to go next",
        explanation: "Use the map to choose whether you want broader context, deeper theory, or skeptical review.",
        difficulty: "Intermediate",
      },
    ],
    opposingViewpoints: [
      {
        viewpoint: "Structured maps can oversimplify the messiness of real learning",
        argument:
          "A clean exploration path can create the illusion that understanding grows linearly, when real expertise is often recursive and uncertain.",
        whatToCheck: "Look for where the source collapses disagreements or unresolved evidence into one neat flow.",
      },
      {
        viewpoint: "AI-generated exploration can sound more authoritative than it is",
        argument:
          "If the map is built from partial transcript evidence, some of the strongest-looking guidance may actually be weak inference.",
        whatToCheck: "Verify whether the recommendations and source framing are grounded in what was actually said.",
      },
    ],
    sourceContext: [
      {
        label: "Origin",
        detail: "The framing comes from learning science and media literacy, where structure is used to improve retention and judgment.",
      },
      {
        label: "Why it lands now",
        detail: "People are overwhelmed by feeds and clips, so products that help turn content into next steps feel especially useful.",
      },
      {
        label: "What to watch for",
        detail: "The source is strongest as a learning framework and weaker when it implies every topic can be mapped cleanly.",
      },
    ],
    recommendations: [
      {
        title: "How to Read a Paper",
        type: "article",
        why: "Useful if you want a practical method for turning dense material into a structured reading path.",
        difficulty: "Beginner Friendly",
        query: "how to read a paper article structured reading",
        url: "https://web.stanford.edu/class/ee384m/Handouts/HowtoReadPaper.pdf",
      },
      {
        title: "Make It Stick overview",
        type: "explainer",
        why: "Helpful for connecting the video’s curiosity framework to actual learning science.",
        difficulty: "Intermediate",
        query: "Make It Stick overview retrieval practice explainer",
        url: null,
      },
      {
        title: "Media literacy and source evaluation",
        type: "video",
        why: "Good next step if you want a skeptical lens for checking source origins and evidence quality.",
        difficulty: "Beginner Friendly",
        query: "media literacy source evaluation video",
        url: null,
      },
      {
        title: "Information foraging theory",
        type: "paper",
        why: "A deeper branch if you want theory behind how people decide what information trail to follow next.",
        difficulty: "Advanced",
        query: "information foraging theory paper",
        url: null,
      },
    ],
    rabbitHoleMap: [
      {
        id: "curiosity-system",
        label: "Curiosity system",
        type: "main",
        description: "The core idea: treat content as an entry point into a structured learning path.",
        depth: 0,
        connectsTo: ["prereqs", "source-tracing", "skeptical-lens", "next-questions"],
      },
      {
        id: "prereqs",
        label: "Prerequisites",
        type: "prerequisite",
        description: "Background concepts that make the main idea legible instead of fuzzy.",
        depth: 1,
        connectsTo: ["curiosity-system"],
      },
      {
        id: "source-tracing",
        label: "Source tracing",
        type: "origin",
        description: "Following claims back to origins, evidence, and framing choices.",
        depth: 1,
        connectsTo: ["curiosity-system"],
      },
      {
        id: "skeptical-lens",
        label: "Skeptical lens",
        type: "opposing",
        description: "Pressure-testing whether a neat map is hiding uncertainty or weak evidence.",
        depth: 1,
        connectsTo: ["curiosity-system"],
      },
      {
        id: "next-questions",
        label: "Next questions",
        type: "deeper",
        description: "The deeper branches that turn one video into an ongoing research path.",
        depth: 1,
        connectsTo: ["curiosity-system"],
      },
    ],
  };
}
