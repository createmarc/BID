export type EventSource = "ticketmaster" | "serpapi" | "eventbrite" | "historiccore";

export interface NormalizedEvent {
  /** SHA-256 hash of (source + title.toLowerCase() + toDateString(start_time)) */
  id: string;
  source: EventSource;
  title: string;
  description: string | null;
  /** Unix timestamp in seconds */
  start_time: number;
  /** Unix timestamp in seconds, nullable */
  end_time: number | null;
  venue_name: string | null;
  address: string | null;
  url: string | null;
  image_url: string | null;
  price_range: string | null;
  /** Unix timestamp when this record was fetched */
  fetched_at: number;
}

export interface WeeklyEvents {
  weekStart: Date;
  weekEnd: Date;
  days: DayEvents[];
}

export interface DayEvents {
  date: Date;
  label: string;
  events: NormalizedEvent[];
}
