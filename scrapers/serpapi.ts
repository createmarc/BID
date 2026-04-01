/**
 * SerpApi Google Events scraper.
 * Catches community and independent events not on Ticketmaster.
 *
 * Docs: https://serpapi.com/google-events-api
 * Free trial: https://serpapi.com/ (100 searches)
 *
 * Also compatible with SearchApi.io — set SEARCHAPI_KEY instead of SERPAPI_KEY
 * and the scraper will automatically use that endpoint.
 */

import { normalizeSerpApi } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

interface SerpApiResponse {
  events_results?: unknown[];
  error?: string;
}

export async function fetchSerpApi(
  _weekStart: Date,
  _weekEnd: Date
): Promise<NormalizedEvent[]> {
  const serpKey = process.env.SERPAPI_KEY;
  const searchKey = process.env.SEARCHAPI_KEY;

  if (!serpKey && !searchKey) {
    console.warn("[serpapi] SERPAPI_KEY / SEARCHAPI_KEY not set — skipping.");
    return [];
  }

  const useSearchApi = !serpKey && !!searchKey;
  const apiKey = serpKey ?? searchKey!;
  const baseUrl = useSearchApi
    ? "https://www.searchapi.io/api/v1/search"
    : "https://serpapi.com/search";

  const queries = [
    "events Historic Core Los Angeles",
    "events Downtown Los Angeles this week",
    "events DTLA Historic Core",
  ];

  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];

  for (const q of queries) {
    const params = new URLSearchParams({
      engine: "google_events",
      q,
      location: "Los Angeles, California, United States",
      htichips: "date:week",
      api_key: apiKey,
    });

    const url = `${baseUrl}?${params}`;
    console.log(`[serpapi] Querying: "${q}"`);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`[serpapi] HTTP ${res.status}`);
        continue;
      }

      const data: SerpApiResponse = await res.json();

      if (data.error) {
        console.error(`[serpapi] API error: ${data.error}`);
        continue;
      }

      const raw = (data.events_results ?? []) as unknown[];
      for (const e of raw) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalized = normalizeSerpApi(e as any);
        if (!seen.has(normalized.id)) {
          seen.add(normalized.id);
          results.push(normalized);
        }
      }
    } catch (err) {
      console.error(`[serpapi] Fetch error:`, err);
    }

    // 1s between queries
    await sleep(1000);
  }

  console.log(`[serpapi] Found ${results.length} unique events.`);
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
