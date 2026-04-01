/**
 * Ticketmaster Discovery API scraper.
 * Searches for events within 0.5 miles of the Historic Core center.
 *
 * Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 * Free API key: https://developer.ticketmaster.com/
 */

import { normalizeTm } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

// Historic Core center: Spring St & 5th St, Downtown LA
const LAT = 34.0455;
const LNG = -118.2476;
const RADIUS_MILES = "1";

interface TmResponse {
  _embedded?: {
    events?: unknown[];
  };
  page?: {
    totalPages: number;
    totalElements: number;
    number: number;
    size: number;
  };
}

export async function fetchTicketmaster(
  weekStart: Date,
  weekEnd: Date
): Promise<NormalizedEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.warn("[ticketmaster] TICKETMASTER_API_KEY not set — skipping.");
    return [];
  }

  const events: NormalizedEvent[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const params = new URLSearchParams({
      apikey: apiKey,
      latlong: `${LAT},${LNG}`,
      radius: RADIUS_MILES,
      unit: "miles",
      startDateTime: toIso(weekStart),
      endDateTime: toIso(weekEnd),
      size: "200",
      page: String(page),
      sort: "date,asc",
    });

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    console.log(`[ticketmaster] Fetching page ${page + 1}/${totalPages}…`);

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[ticketmaster] HTTP ${res.status}: ${await res.text()}`);
      break;
    }

    const data: TmResponse = await res.json();
    const raw = (data._embedded?.events ?? []) as unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of raw) events.push(normalizeTm(e as any));

    totalPages = data.page?.totalPages ?? 1;
    page++;

    // Be polite — 200ms between pages
    if (page < totalPages) await sleep(200);
  }

  console.log(`[ticketmaster] Found ${events.length} events.`);
  return events;
}

function toIso(d: Date): string {
  return d.toISOString().replace(".000Z", "Z");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
