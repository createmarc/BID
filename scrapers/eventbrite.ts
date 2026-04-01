/**
 * Eventbrite scraper.
 *
 * Eventbrite's public search page embeds a `__NEXT_DATA__` JSON blob in a
 * <script> tag. We extract that JSON to get structured event data without
 * needing an API key.
 *
 * This is inherently fragile — if Eventbrite changes their page structure,
 * this scraper will fail silently (log a warning, return empty array).
 */

import * as cheerio from "cheerio";
import { normalizeEventbrite } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function fetchEventbrite(
  weekStart: Date,
  weekEnd: Date
): Promise<NormalizedEvent[]> {
  const startStr = fmtDate(weekStart);
  const endStr = fmtDate(weekEnd);

  const urls = [
    `https://www.eventbrite.com/d/ca--los-angeles/downtown-los-angeles/?start_date=${startStr}&end_date=${endStr}`,
    `https://www.eventbrite.com/d/ca--los-angeles/historic-core-los-angeles/?start_date=${startStr}&end_date=${endStr}`,
  ];

  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];

  for (const url of urls) {
    console.log(`[eventbrite] Scraping: ${url}`);
    try {
      const events = await scrapeUrl(url);
      for (const e of events) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          results.push(e);
        }
      }
    } catch (err) {
      console.warn(`[eventbrite] Failed to scrape ${url}:`, err);
    }
    await sleep(1000);
  }

  console.log(`[eventbrite] Found ${results.length} unique events.`);
  return results;
}

async function scrapeUrl(url: string): Promise<NormalizedEvent[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.warn(`[eventbrite] HTTP ${res.status} for ${url}`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Strategy 1: Extract __NEXT_DATA__ JSON blob
  const nextDataScript = $("script#__NEXT_DATA__").html();
  if (nextDataScript) {
    return parseNextData(nextDataScript);
  }

  // Strategy 2: Extract window.__SERVER_DATA__ or similar patterns
  const serverDataMatch = html.match(/window\.__SERVER_DATA__\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
  if (serverDataMatch) {
    try {
      const data = JSON.parse(serverDataMatch[1]);
      return extractFromServerData(data);
    } catch {
      console.warn("[eventbrite] Could not parse __SERVER_DATA__");
    }
  }

  // Strategy 3: Parse visible event cards as fallback
  return parseEventCards($, url);
}

function parseNextData(json: string): NormalizedEvent[] {
  try {
    const data = JSON.parse(json);
    // Navigate the Next.js data structure to find events
    const events: unknown[] = findEventsInObject(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return events.map((e) => normalizeEventbrite(e as any));
  } catch (err) {
    console.warn("[eventbrite] Failed to parse __NEXT_DATA__:", err);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findEventsInObject(obj: any, depth = 0): unknown[] {
  if (depth > 8 || !obj || typeof obj !== "object") return [];

  // Look for arrays of objects that look like events
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && typeof obj[0] === "object" && "name" in obj[0] && "url" in obj[0]) {
      return obj;
    }
    return obj.flatMap((item) => findEventsInObject(item, depth + 1));
  }

  // Check for known Eventbrite response shapes
  if ("events" in obj && Array.isArray(obj.events)) return obj.events;
  if ("search_data" in obj) return findEventsInObject(obj.search_data, depth + 1);
  if ("pageProps" in obj) return findEventsInObject(obj.pageProps, depth + 1);
  if ("props" in obj) return findEventsInObject(obj.props, depth + 1);

  return Object.values(obj).flatMap((v) => findEventsInObject(v, depth + 1));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromServerData(data: any): NormalizedEvent[] {
  try {
    const events = findEventsInObject(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return events.map((e) => normalizeEventbrite(e as any));
  } catch {
    return [];
  }
}

function parseEventCards($: cheerio.CheerioAPI, pageUrl: string): NormalizedEvent[] {
  const results: NormalizedEvent[] = [];
  const baseUrl = new URL(pageUrl).origin;

  // Eventbrite event cards typically have data-event-id attributes
  $("[data-event-id], article.search-event-card-wrapper, .eds-event-card-content").each((_, el) => {
    const $el = $(el);
    const title = $el.find("h2, h3, .eds-event-card__formatted-name").first().text().trim();
    if (!title) return;

    const href = $el.find("a[href*='/e/']").first().attr("href");
    const url = href ? (href.startsWith("http") ? href : `${baseUrl}${href}`) : null;

    const dateText = $el.find("time, .eds-event-card-content__sub-title").first().text().trim();
    const imgSrc = $el.find("img").first().attr("src") ?? null;
    const description = $el.find(".eds-event-card__description, p").first().text().trim() || null;

    results.push({
      id: `eb-${Buffer.from(title + dateText).toString("base64").slice(0, 16)}`,
      source: "eventbrite",
      title,
      description,
      start_time: parseFlexibleDate(dateText),
      end_time: null,
      venue_name: null,
      address: null,
      url,
      image_url: imgSrc,
      price_range: null,
      fetched_at: Math.floor(Date.now() / 1000),
    });
  });

  return results;
}

function parseFlexibleDate(text: string): number {
  const d = new Date(text);
  return isNaN(d.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(d.getTime() / 1000);
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
