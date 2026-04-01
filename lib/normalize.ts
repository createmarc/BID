import { createHash } from "crypto";
import type { NormalizedEvent, EventSource } from "./types";

function makeId(source: EventSource, title: string, startTime: number): string {
  const dateStr = new Date(startTime * 1000).toDateString();
  return createHash("sha256")
    .update(`${source}:${title.toLowerCase().trim()}:${dateStr}`)
    .digest("hex")
    .slice(0, 16);
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Ticketmaster
// ---------------------------------------------------------------------------

interface TmEvent {
  name: string;
  url: string;
  dates: {
    start: { dateTime?: string; localDate?: string; localTime?: string };
    end?: { dateTime?: string };
  };
  info?: string;
  priceRanges?: Array<{ min: number; max: number; currency: string }>;
  images?: Array<{ url: string; width: number }>;
  _embedded?: {
    venues?: Array<{
      name: string;
      address?: { line1?: string };
      city?: { name: string };
      state?: { stateCode: string };
    }>;
  };
}

export function normalizeTm(raw: TmEvent): NormalizedEvent {
  const venue = raw._embedded?.venues?.[0];
  const venueName = venue?.name ?? null;
  const addressParts = [
    venue?.address?.line1,
    venue?.city?.name,
    venue?.state?.stateCode,
  ].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : null;

  const startIso = raw.dates.start.dateTime ?? raw.dates.start.localDate;
  const startTime = startIso ? Math.floor(new Date(startIso).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const endIso = raw.dates.end?.dateTime;
  const endTime = endIso ? Math.floor(new Date(endIso).getTime() / 1000) : null;

  const bestImage = raw.images
    ?.sort((a, b) => b.width - a.width)
    .find((img) => img.url)?.url ?? null;

  const pr = raw.priceRanges?.[0];
  const priceRange = pr
    ? pr.min === pr.max
      ? `$${pr.min}`
      : `$${pr.min}–$${pr.max}`
    : null;

  return {
    id: makeId("ticketmaster", raw.name, startTime),
    source: "ticketmaster",
    title: raw.name,
    description: raw.info ?? null,
    start_time: startTime,
    end_time: endTime,
    venue_name: venueName,
    address,
    url: raw.url,
    image_url: bestImage,
    price_range: priceRange,
    fetched_at: now(),
  };
}

// ---------------------------------------------------------------------------
// SerpApi Google Events
// ---------------------------------------------------------------------------

interface SerpEvent {
  title: string;
  date: { start_date?: string; when?: string };
  address?: string[];
  link?: string;
  ticket_info?: Array<{ link?: string }>;
  thumbnail?: string;
  description?: string;
}

export function normalizeSerpApi(raw: SerpEvent): NormalizedEvent {
  const startTime = raw.date.start_date
    ? Math.floor(new Date(raw.date.start_date).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const address = raw.address?.join(", ") ?? null;
  const url = raw.link ?? raw.ticket_info?.[0]?.link ?? null;

  return {
    id: makeId("serpapi", raw.title, startTime),
    source: "serpapi",
    title: raw.title,
    description: raw.description ?? raw.date.when ?? null,
    start_time: startTime,
    end_time: null,
    venue_name: raw.address?.[0] ?? null,
    address,
    url,
    image_url: raw.thumbnail ?? null,
    price_range: null,
    fetched_at: now(),
  };
}

// ---------------------------------------------------------------------------
// Eventbrite (scraped __NEXT_DATA__)
// ---------------------------------------------------------------------------

interface EbEvent {
  name: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  url?: string;
  image?: { url: string };
  primary_venue?: { name?: string; address?: { localized_address_display?: string } };
  summary?: string;
  is_free?: boolean;
  ticket_availability?: { minimum_ticket_price?: { major_value?: string }; maximum_ticket_price?: { major_value?: string } };
}

export function normalizeEventbrite(raw: EbEvent): NormalizedEvent {
  const startIso = raw.start_date
    ? `${raw.start_date}${raw.start_time ? "T" + raw.start_time : ""}`
    : null;
  const startTime = startIso ? Math.floor(new Date(startIso).getTime() / 1000) : Math.floor(Date.now() / 1000);

  const endIso = raw.end_date
    ? `${raw.end_date}${raw.end_time ? "T" + raw.end_time : ""}`
    : null;
  const endTime = endIso ? Math.floor(new Date(endIso).getTime() / 1000) : null;

  const ta = raw.ticket_availability;
  let priceRange: string | null = null;
  if (raw.is_free) {
    priceRange = "Free";
  } else if (ta?.minimum_ticket_price?.major_value) {
    const min = ta.minimum_ticket_price.major_value;
    const max = ta.maximum_ticket_price?.major_value;
    priceRange = max && max !== min ? `$${min}–$${max}` : `$${min}`;
  }

  return {
    id: makeId("eventbrite", raw.name, startTime),
    source: "eventbrite",
    title: raw.name,
    description: raw.summary ?? null,
    start_time: startTime,
    end_time: endTime,
    venue_name: raw.primary_venue?.name ?? null,
    address: raw.primary_venue?.address?.localized_address_display ?? null,
    url: raw.url ?? null,
    image_url: raw.image?.url ?? null,
    price_range: priceRange,
    fetched_at: now(),
  };
}

// ---------------------------------------------------------------------------
// historiccore.com
// ---------------------------------------------------------------------------

export interface HcRawEvent {
  title: string;
  dateText: string;
  url: string | null;
  description: string | null;
  imageUrl: string | null;
}

export function normalizeHistoricCore(raw: HcRawEvent): NormalizedEvent {
  const startTime = parseHcDate(raw.dateText);

  return {
    id: makeId("historiccore", raw.title, startTime),
    source: "historiccore",
    title: raw.title,
    description: raw.description,
    start_time: startTime,
    end_time: null,
    venue_name: "Historic Core",
    address: "Historic Core, Downtown Los Angeles, CA",
    url: raw.url,
    image_url: raw.imageUrl,
    price_range: null,
    fetched_at: now(),
  };
}

function parseHcDate(text: string): number {
  // Try direct parse first
  const d = new Date(text);
  if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  // Fallback to now
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export interface IgRawPost {
  id: string;
  caption?: string;
  timestamp: string;      // ISO 8601 — when the post was published
  permalink: string;
  media_url?: string;
  thumbnail_url?: string; // for VIDEO posts
  username?: string;
}

/**
 * Parse an Instagram post into a NormalizedEvent.
 * Since IG posts don't have structured event fields, we attempt to extract
 * date/time from the caption text using common posting patterns.
 * Falls back to the post's publish timestamp if nothing parseable is found.
 */
export function normalizeInstagram(raw: IgRawPost): NormalizedEvent {
  const caption = raw.caption ?? "";
  const title = extractIgTitle(caption) ?? `Event posted by @${raw.username ?? "historiccore"}`;
  const { startTime, endTime } = parseIgDateTime(caption, raw.timestamp);
  const location = extractIgLocation(caption);
  const price = extractIgPrice(caption);
  const imageUrl = raw.thumbnail_url ?? raw.media_url ?? null;

  return {
    id: makeId("instagram", raw.id, startTime),
    source: "instagram",
    title,
    description: caption.slice(0, 500) || null,
    start_time: startTime,
    end_time: endTime,
    venue_name: location?.venueName ?? null,
    address: location?.address ?? null,
    url: raw.permalink,
    image_url: imageUrl,
    price_range: price,
    fetched_at: now(),
  };
}

/**
 * Extract a title from an Instagram caption.
 * Looks for the first substantive line (after stripping emoji-only lines).
 */
function extractIgTitle(caption: string): string | null {
  const lines = caption.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip lines that are just hashtags, emoji, or very short
    const stripped = line.replace(/#\w+/g, "").replace(/[^\w\s.,!?'"()-]/g, "").trim();
    if (stripped.length >= 10) return stripped.slice(0, 100);
  }
  return null;
}

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Try to parse a date + time from a caption.
 * Supports common patterns found in LA event posts:
 *   📅 Saturday, April 5th
 *   April 5 | 7pm – 10pm
 *   4/5 at 7:00 PM
 *   this Saturday at 6pm
 */
function parseIgDateTime(
  caption: string,
  fallbackIso: string
): { startTime: number; endTime: number | null } {
  const fallback = Math.floor(new Date(fallbackIso).getTime() / 1000);
  const text = caption.toLowerCase().replace(/[📅🗓️]/g, "");
  const currentYear = new Date().getFullYear();

  // Pattern 1: "April 5" or "April 5th" optionally followed by time
  for (const [month, monthIdx] of Object.entries(MONTHS)) {
    const re = new RegExp(
      `\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)))?`,
      "i"
    );
    const m = text.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      const d = new Date(currentYear, monthIdx, day);
      if (!isNaN(d.getTime())) {
        if (m[2]) applyTimeStr(d, m[2]);
        const startTime = Math.floor(d.getTime() / 1000);
        const endTime = extractEndTime(text, d);
        return { startTime, endTime };
      }
    }
  }

  // Pattern 2: MM/DD or MM-DD optionally followed by time
  const slashDate = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/);
  if (slashDate) {
    const d = new Date(currentYear, parseInt(slashDate[1], 10) - 1, parseInt(slashDate[2], 10));
    if (!isNaN(d.getTime())) {
      const timeAfter = text.slice(text.indexOf(slashDate[0]) + slashDate[0].length);
      const timeM = timeAfter.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
      if (timeM) applyTimeStr(d, timeM[1]);
      return { startTime: Math.floor(d.getTime() / 1000), endTime: extractEndTime(text, d) };
    }
  }

  // Pattern 3: "this saturday", "next friday" etc.
  const relDay = text.match(/\b(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (relDay) {
    const d = relativeDay(relDay[1], relDay[2]);
    if (d) {
      const timeM = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
      if (timeM) applyTimeStr(d, timeM[1]);
      return { startTime: Math.floor(d.getTime() / 1000), endTime: extractEndTime(text, d) };
    }
  }

  return { startTime: fallback, endTime: null };
}

function applyTimeStr(d: Date, timeStr: string): void {
  const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return;
  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  d.setHours(hours, minutes, 0, 0);
}

function extractEndTime(text: string, startDate: Date): number | null {
  // Look for "– 10pm", "to 10pm", "- 10:00 PM"
  const m = text.match(/(?:–|-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (!m) return null;
  const end = new Date(startDate.getTime());
  applyTimeStr(end, m[1]);
  // If end is before start, it's midnight-crossing — add a day
  if (end.getTime() <= startDate.getTime()) end.setDate(end.getDate() + 1);
  return Math.floor(end.getTime() / 1000);
}

function relativeDay(rel: string, dayName: string): Date | null {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = days.indexOf(dayName.toLowerCase());
  if (target === -1) return null;
  const today = new Date();
  const todayDay = today.getDay();
  let diff = target - todayDay;
  if (rel.toLowerCase() === "next" || diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

function extractIgLocation(caption: string): { venueName: string | null; address: string | null } | null {
  // Look for 📍 emoji followed by location text
  const m = caption.match(/📍\s*(.+?)(?:\n|$)/);
  if (m) {
    const loc = m[1].trim();
    // If it contains a street address, use it as address; otherwise venue name
    const hasStreet = /\d+\s+\w+\s+(st|ave|blvd|dr|ln|rd|way|pl)\b/i.test(loc);
    return {
      venueName: hasStreet ? null : loc.slice(0, 80),
      address: hasStreet ? loc.slice(0, 120) : null,
    };
  }
  return null;
}

function extractIgPrice(caption: string): string | null {
  const lower = caption.toLowerCase();
  if (/\bfree\b/.test(lower) && /\badmission\b|\bentry\b|\bevent\b/.test(lower)) return "Free";
  if (/\bfree admission\b|\bfree entry\b/.test(lower)) return "Free";
  const priceM = caption.match(/\$(\d+(?:\.\d{2})?)/);
  if (priceM) return `$${priceM[1]}`;
  return null;
}
