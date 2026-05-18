## DeepDive

DeepDive is an AI-powered curiosity engine for turning internet content into
structured exploration. The MVP supports YouTube links: it extracts transcript
data with a pre-made Apify actor, analyzes the transcript with OpenAI, and
renders a visual learning dashboard instead of a chatbot.

### MVP flow

1. Paste a YouTube URL.
2. Apify extracts transcript and metadata.
3. OpenAI generates a structured deep dive.
4. The app displays summary signals, prerequisites, concepts, opposing views,
   source origins, recommendations, and a rabbit hole map.

### Environment

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
`videoUrls`, `includeTranscripts`, `transcriptLanguages`, and `proxyConfiguration`.
Residential proxy is recommended for YouTube transcript reliability. If you later
switch to another store actor, keep `APIFY_YOUTUBE_ACTOR_ID` and optionally
provide a custom `APIFY_ACTOR_INPUT_JSON` template.

Without keys, the app runs in preview mode with demo analysis so the UI can be
tested immediately.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
