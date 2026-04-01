/**
 * Instagram Graph API scraper.
 *
 * Searches relevant hashtags for event posts in the Historic Core neighborhood.
 * Uses the official Instagram Graph API hashtag search endpoint.
 *
 * Setup:
 *  1. Create a Meta Developer app at https://developers.facebook.com/
 *  2. Add the Instagram product and connect an Instagram Business/Creator account
 *  3. Generate a long-lived User Access Token (valid 60 days — store and refresh it)
 *  4. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in .env.local
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search
 *
 * Rate limits:
 *  - 30 UNIQUE hashtag searches per 7-day rolling window per account
 *  - Hashtag IDs are stable and cacheable — we store them in data/hashtag-cache.json
 *    so we only consume the 30/week budget once per hashtag (not on every run)
 *  - 200 API calls per hour
 */

import fs from "fs";
import path from "path";
import { normalizeInstagram, type IgRawPost } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

// ---------------------------------------------------------------------------
// Hashtags to search — ordered by relevance to Historic Core LA events
// We search up to 10 per run; caching means the 30/week limit isn't a concern
// after the first run.
// ---------------------------------------------------------------------------
const HASHTAGS = [
  "historiccorela",      // most specific
  "historiccore",        // BID's own tag
  "historiccorebtd",     // sometimes used by the BID
  "dtlaevents",          // broad DTLA events
  "downtownlaevents",
  "dtla",                // very broad, filter aggressively by caption
  "historiccoredtla",
  "springstreetdtla",
  "broadwaydtla",
  "happeningindtla",
];

// Only posts whose captions contain at least one of these keywords are kept
// when searching broad hashtags (like #dtla).
const EVENT_KEYWORDS = [
  "event", "join us", "happening", "come out", "pop-up", "popup",
  "opening", "exhibition", "show", "concert", "performance", "market",
  "festival", "workshop", "tour", "walk", "admission", "rsvp", "tickets",
  "doors open", "live music", "art night", "gallery", "free entry",
];

const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

// ---------------------------------------------------------------------------
// Hashtag ID cache — persisted to disk so we don't burn through the 30/week limit
// ---------------------------------------------------------------------------

const CACHE_PATH = path.resolve(process.env.DATABASE_PATH ?? "./data/events.db", "../hashtag-cache.json");

interface HashtagCache {
  [hashtag: string]: { id: string; cachedAt: number };
}

function loadCache(): HashtagCache {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as HashtagCache;
    }
  } catch { /* ignore */ }
  return {};
}

function saveCache(cache: HashtagCache): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn("[instagram] Could not save hashtag cache:", err);
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getHashtagId(
  hashtag: string,
  accountId: string,
  accessToken: string,
  cache: HashtagCache
): Promise<string | null> {
  // Return from cache if available (no expiry — hashtag IDs are stable)
  if (cache[hashtag]) {
    return cache[hashtag].id;
  }

  const params = new URLSearchParams({
    user_id: accountId,
    q: hashtag,
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_API_BASE}/ig_hashtag_search?${params}`);
  if (!res.ok) {
    const body = await res.text();
    console.warn(`[instagram] Could not get ID for #${hashtag}: HTTP ${res.status} — ${body}`);
    return null;
  }

  const data = await res.json() as { data?: Array<{ id: string }>; error?: { message: string } };
  if (data.error) {
    console.warn(`[instagram] API error for #${hashtag}: ${data.error.message}`);
    return null;
  }

  const id = data.data?.[0]?.id;
  if (!id) return null;

  cache[hashtag] = { id, cachedAt: Date.now() };
  return id;
}

interface IgMediaResponse {
  data?: Array<{
    id: string;
    caption?: string;
    timestamp: string;
    permalink: string;
    media_url?: string;
    thumbnail_url?: string;
    username?: string;
  }>;
  paging?: { next?: string };
  error?: { message: string };
}

async function getRecentMedia(
  hashtagId: string,
  accountId: string,
  accessToken: string
): Promise<IgRawPost[]> {
  const params = new URLSearchParams({
    user_id: accountId,
    fields: "id,caption,timestamp,permalink,media_url,thumbnail_url,username",
    access_token: accessToken,
    limit: "50",
  });

  const url = `${GRAPH_API_BASE}/${hashtagId}/recent_media?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.warn(`[instagram] recent_media HTTP ${res.status}`);
    return [];
  }

  const data: IgMediaResponse = await res.json();
  if (data.error) {
    console.warn(`[instagram] recent_media error: ${data.error.message}`);
    return [];
  }

  return (data.data ?? []) as IgRawPost[];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchInstagram(
  weekStart: Date,
  weekEnd: Date
): Promise<NormalizedEvent[]> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    console.warn(
      "[instagram] INSTAGRAM_ACCESS_TOKEN and/or INSTAGRAM_BUSINESS_ACCOUNT_ID not set — skipping.\n" +
      "           See scrapers/instagram.ts for setup instructions."
    );
    return [];
  }

  const cache = loadCache();
  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];

  const weekStartTs = Math.floor(weekStart.getTime() / 1000);
  const weekEndTs = Math.floor(weekEnd.getTime() / 1000);
  // Look back 14 days for posts — event posts often appear before the event
  const lookbackTs = weekStartTs - 14 * 86400;

  for (const hashtag of HASHTAGS) {
    console.log(`[instagram] Searching #${hashtag}…`);

    const hashtagId = await getHashtagId(hashtag, accountId, accessToken, cache);
    if (!hashtagId) {
      await sleep(500);
      continue;
    }

    const posts = await getRecentMedia(hashtagId, accountId, accessToken);

    // For broad hashtags, filter by event keywords
    const isBroadHashtag = ["dtla"].includes(hashtag);

    for (const post of posts) {
      if (seen.has(post.id)) continue;

      const postTs = Math.floor(new Date(post.timestamp).getTime() / 1000);

      // Only look at posts published within the lookback window
      if (postTs < lookbackTs) continue;

      const caption = (post.caption ?? "").toLowerCase();

      // Skip posts with no caption or very short captions (ads, selfies, etc.)
      if (caption.length < 30) continue;

      // For broad hashtags, require event keywords
      if (isBroadHashtag && !EVENT_KEYWORDS.some((kw) => caption.includes(kw))) {
        continue;
      }

      const normalized = normalizeInstagram(post);

      // Keep events whose parsed date falls in the week, or posts from the last 7 days
      // if we couldn't parse a date (start_time fell back to post timestamp)
      const dateIsInWeek = normalized.start_time >= weekStartTs && normalized.start_time <= weekEndTs;
      const isRecentPost = postTs >= weekStartTs - 7 * 86400 && postTs <= weekEndTs;
      const dateIsFallback = normalized.start_time === postTs; // we didn't parse a real date

      if (dateIsInWeek || (isRecentPost && dateIsFallback)) {
        seen.add(post.id);
        results.push(normalized);
      }
    }

    // Save cache after each successful hashtag lookup
    saveCache(cache);
    await sleep(300);
  }

  console.log(`[instagram] Found ${results.length} event posts.`);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
