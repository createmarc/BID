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
