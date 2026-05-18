# Deep-Dive

DeepDive is an AI-powered curiosity engine for turning internet content into
structured exploration. The MVP supports YouTube links: it extracts transcript
data with a pre-made Apify actor, analyzes the transcript with AI, and renders
a visual learning experience instead of a chatbot.

## MVP flow

1. Paste a YouTube URL.
2. Apify extracts transcript and metadata.
3. The model generates a structured deep dive.
4. The app displays summary signals, prerequisites, concepts, opposing views,
   source origins, recommendations, and a rabbit hole map.

## Environment

Copy `.env.example` to `.env.local` and add keys:

```bash
cp .env.example .env.local
```

Apify setup:

1. Create an Apify API token in the [Apify console integrations page](https://console.apify.com/account/integrations).
2. Use the [harvestlab/youtube-scraper](https://apify.com/harvestlab/youtube-scraper) store actor.
3. Add these values to `.env.local`:

```bash
APIFY_TOKEN=your_apify_token
APIFY_YOUTUBE_ACTOR_ID=harvestlab/youtube-scraper
APIFY_TRANSCRIPT_LANGUAGES=en,en-US
APIFY_PROXY_GROUPS=RESIDENTIAL
```

That actor currently supports transcript-focused runs with `mode: "transcript"`,
`videoUrls`, `includeTranscripts`, `transcriptLanguages`, and
`proxyConfiguration`. Residential proxy is recommended for YouTube transcript
reliability. If you later switch to another store actor, keep
`APIFY_YOUTUBE_ACTOR_ID` and optionally provide a custom
`APIFY_ACTOR_INPUT_JSON` template.

Without keys, the app runs in preview mode with demo analysis so the UI can be
tested immediately.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Stack

- Next.js
- React
- Tailwind CSS
- TypeScript
- Apify
- Supabase
- OpenAI-compatible model providers

