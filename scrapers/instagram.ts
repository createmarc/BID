/**
 * Instagram scraper via Apify's Instagram Hashtag Scraper actor.
 *
 * Uses no Instagram or Facebook account — just an Apify API key.
 *
 * Setup (5 minutes):
 *  1. Sign up at https://apify.com (free — $5 compute credits/month included)
 *  2. Go to https://console.apify.com/account/integrations → copy your API token
 *  3. Set APIFY_API_TOKEN in .env.local
 *
 * The free tier comfortably covers one weekly run (~0.05–0.10 USD per run).
 *
 * Actor docs: https://apify.com/apify/instagram-hashtag-scraper
 */

import { normalizeInstagram, type IgRawPost } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

// Hashtags to search — ordered by relevance to Historic Core LA
const HASHTAGS = [
  "historiccorela",
  "historiccore",
  "historiccoredtla",
  "dtlaevents",
  "downtownlaevents",
  "springstreetdtla",
  "broadwaydtla",
  "happeningindtla",
  "dtla",
];

// For broad tags like #dtla we require at least one event keyword in the caption
const EVENT_KEYWORDS = [
  "event", "join us", "happening", "come out", "pop-up", "popup",
  "opening", "exhibition", "show", "concert", "performance", "market",
  "festival", "workshop", "tour", "walk", "admission", "rsvp", "tickets",
  "doors open", "live music", "art night", "gallery", "free entry",
];
const BROAD_HASHTAGS = new Set(["dtla"]);

const APIFY_BASE = "https://api.apify.com/v2";

// ---------------------------------------------------------------------------
// Apify run helpers
// ---------------------------------------------------------------------------

interface ApifyRunResponse {
  data: { id: string; status: string };
}

interface ApifyDatasetItem {
  id?: string;
  shortCode?: string;
  caption?: string;
  timestamp?: string;
  url?: string;
  displayUrl?: string;
  images?: string[];
  videoUrl?: string;
  ownerUsername?: string;
  locationName?: string;
}

async function startRun(apiToken: string): Promise<string> {
  const res = await fetch(
    `${APIFY_BASE}/acts/apify~instagram-hashtag-scraper/runs?token=${apiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hashtags: HASHTAGS,
        resultsLimit: 30,  // per hashtag
        expandOwners: false,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify start run failed: HTTP ${res.status} — ${body}`);
  }

  const data: ApifyRunResponse = await res.json();
  return data.data.id;
}

async function pollUntilFinished(runId: string, apiToken: string): Promise<void> {
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 5000;        // 5 seconds
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apiToken}`);
    if (!res.ok) continue;

    const data = await res.json() as { data: { status: string } };
    const status = data.data.status;

    if (status === "SUCCEEDED") return;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }

    console.log(`[instagram] Run ${runId} status: ${status} — waiting…`);
  }

  throw new Error("Apify run timed out after 5 minutes");
}

async function fetchDataset(runId: string, apiToken: string): Promise<ApifyDatasetItem[]> {
  const res = await fetch(
    `${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${apiToken}&format=json&clean=true`
  );
  if (!res.ok) throw new Error(`Apify dataset fetch failed: HTTP ${res.status}`);
  return res.json() as Promise<ApifyDatasetItem[]>;
}

// ---------------------------------------------------------------------------
// Map Apify item → IgRawPost
// ---------------------------------------------------------------------------

function toIgRawPost(item: ApifyDatasetItem): IgRawPost | null {
  const id = item.id ?? item.shortCode;
  if (!id || !item.timestamp) return null;

  const permalink =
    item.url ??
    (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : null);
  if (!permalink) return null;

  return {
    id,
    caption: item.caption ?? undefined,
    timestamp: item.timestamp,
    permalink,
    media_url: item.displayUrl ?? item.images?.[0] ?? undefined,
    thumbnail_url: item.videoUrl ? item.displayUrl : undefined,
    username: item.ownerUsername ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchInstagram(
  weekStart: Date,
  weekEnd: Date
): Promise<NormalizedEvent[]> {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    console.warn(
      "[instagram] APIFY_API_TOKEN not set — skipping Instagram.\n" +
      "           Sign up free at https://apify.com and add your token to .env.local"
    );
    return [];
  }

  console.log(`[instagram] Starting Apify run for ${HASHTAGS.length} hashtags…`);

  let runId: string;
  try {
    runId = await startRun(apiToken);
    console.log(`[instagram] Run started: ${runId}`);
    await pollUntilFinished(runId, apiToken);
    console.log(`[instagram] Run completed.`);
  } catch (err) {
    console.error("[instagram] Apify run failed:", err);
    return [];
  }

  let items: ApifyDatasetItem[];
  try {
    items = await fetchDataset(runId, apiToken);
  } catch (err) {
    console.error("[instagram] Failed to fetch dataset:", err);
    return [];
  }

  console.log(`[instagram] Dataset contains ${items.length} posts.`);

  const weekStartTs = Math.floor(weekStart.getTime() / 1000);
  const weekEndTs = Math.floor(weekEnd.getTime() / 1000);
  const lookbackTs = weekStartTs - 14 * 86400; // 2 weeks back for advance posts

  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];

  for (const item of items) {
    const post = toIgRawPost(item);
    if (!post || seen.has(post.id)) continue;

    const postTs = Math.floor(new Date(post.timestamp).getTime() / 1000);
    if (postTs < lookbackTs) continue;

    const caption = (post.caption ?? "").toLowerCase();
    if (caption.length < 30) continue;

    // Determine which hashtag brought this post in (Apify doesn't tag items by hashtag,
    // so check the caption/item for broad-hashtag filtering)
    const isFromBroadHashtag =
      BROAD_HASHTAGS.has("dtla") &&
      !HASHTAGS.slice(0, -1).some((h) => caption.includes(h)); // not from a specific tag
    if (isFromBroadHashtag && !EVENT_KEYWORDS.some((kw) => caption.includes(kw))) {
      continue;
    }

    const normalized = normalizeInstagram(post);
    const dateIsInWeek =
      normalized.start_time >= weekStartTs && normalized.start_time <= weekEndTs;
    const isRecentPost = postTs >= weekStartTs - 7 * 86400 && postTs <= weekEndTs;
    const dateIsFallback = normalized.start_time === postTs;

    if (dateIsInWeek || (isRecentPost && dateIsFallback)) {
      seen.add(post.id);
      results.push(normalized);
    }
  }

  console.log(`[instagram] Kept ${results.length} event posts after filtering.`);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
