/**
 * historiccore.com events scraper.
 *
 * Scrapes the Historic Core BID's own events page at:
 * https://www.historiccore.com/events-historic-core-district
 *
 * Uses Cheerio for HTML parsing. Falls back gracefully if the page structure
 * changes or the site returns a non-200 response.
 */

import * as cheerio from "cheerio";
import { normalizeHistoricCore, type HcRawEvent } from "../lib/normalize";
import type { NormalizedEvent } from "../lib/types";

const EVENTS_URL = "https://www.historiccore.com/events-historic-core-district";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://www.historiccore.com/",
};

export async function fetchHistoricCore(
  weekStart: Date,
  weekEnd: Date
): Promise<NormalizedEvent[]> {
  console.log(`[historiccore] Scraping ${EVENTS_URL}`);

  let html: string;
  try {
    const res = await fetch(EVENTS_URL, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`[historiccore] HTTP ${res.status} — skipping.`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.warn("[historiccore] Fetch failed:", err);
    return [];
  }

  const $ = cheerio.load(html);
  const rawEvents: HcRawEvent[] = [];

  // Squarespace event blocks — try multiple selectors
  const selectors = [
    ".eventlist-event",
    "article.eventlist-event",
    ".summary-item",
    "article[data-date]",
    ".event-card",
  ];

  let found = false;
  for (const selector of selectors) {
    if ($(selector).length > 0) {
      $(selector).each((_, el) => {
        const raw = extractEventFromEl($, el);
        if (raw) rawEvents.push(raw);
      });
      found = true;
      break;
    }
  }

  if (!found) {
    // Generic fallback: look for anything with a date and a title
    $("article, .event, [class*='event']").each((_, el) => {
      const raw = extractEventFromEl($, el);
      if (raw) rawEvents.push(raw);
    });
  }

  // Filter to events within the requested week (best-effort — date parsing may be imprecise)
  const weekStartTs = Math.floor(weekStart.getTime() / 1000);
  const weekEndTs = Math.floor(weekEnd.getTime() / 1000);

  const normalized = rawEvents
    .map(normalizeHistoricCore)
    .filter((e) => {
      // Keep events that fall within the week, or if we couldn't parse the date
      // (start_time falls back to now), keep them anyway
      return e.start_time >= weekStartTs - 86400 && e.start_time <= weekEndTs + 86400;
    });

  console.log(`[historiccore] Found ${normalized.length} events.`);
  return normalized;
}

function extractEventFromEl(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any
): HcRawEvent | null {
  const $el = $(el);

  // Title
  const title =
    $el.find(".eventlist-title, .summary-title, h1, h2, h3").first().text().trim() ||
    $el.find("a").first().text().trim();

  if (!title || title.length < 3) return null;

  // Date text
  const dateText =
    $el.find("time").first().attr("datetime") ||
    $el.find("time").first().text().trim() ||
    $el.find(".eventlist-datetag, .summary-metadata--primary, [class*='date']").first().text().trim() ||
    $el.attr("data-date") ||
    "";

  // URL
  const href =
    $el.find("a").first().attr("href") ||
    $el.find(".eventlist-title a, .summary-title a").first().attr("href");
  const url = href
    ? href.startsWith("http")
      ? href
      : `https://www.historiccore.com${href}`
    : null;

  // Description
  const description =
    $el.find(".eventlist-description, .summary-excerpt, p").first().text().trim() || null;

  // Image
  const imgSrc =
    $el.find("img").first().attr("src") ||
    $el.find("img").first().attr("data-src") ||
    null;

  return { title, dateText, url, description, imageUrl: imgSrc ?? null };
}
