#!/usr/bin/env tsx
/**
 * Fetch events from all sources and store them in the SQLite database.
 *
 * Usage:
 *   npm run fetch                     # current week
 *   npm run fetch -- --weeks=4        # next 4 weeks
 *   npm run fetch -- --date=2025-01-06 # specific week starting on that date
 *
 * Run this manually, via cron (every Monday morning), or via the /api/refresh endpoint.
 */

import "dotenv/config";
import { fetchTicketmaster } from "../scrapers/ticketmaster";
import { fetchSerpApi } from "../scrapers/serpapi";
import { fetchEventbrite } from "../scrapers/eventbrite";
import { fetchHistoricCore } from "../scrapers/historiccore";
import { upsertEvents, countEvents } from "../lib/db";
import { getWeekStart, getWeekEnd, shiftWeek } from "../lib/weeks";

async function main() {
  const args = process.argv.slice(2);

  // Parse --weeks=N
  const weeksArg = args.find((a) => a.startsWith("--weeks="));
  const numWeeks = weeksArg ? parseInt(weeksArg.split("=")[1], 10) : 1;

  // Parse --date=YYYY-MM-DD
  const dateArg = args.find((a) => a.startsWith("--date="));
  const baseDate = dateArg ? new Date(dateArg.split("=")[1]) : new Date();

  const monday = getWeekStart(baseDate);

  console.log(`\n=== Historic Core Events Fetcher ===`);
  console.log(`Fetching ${numWeeks} week(s) starting ${monday.toDateString()}\n`);

  for (let i = 0; i < numWeeks; i++) {
    const weekStart = shiftWeek(monday, i);
    const weekEnd = getWeekEnd(weekStart);

    console.log(`\n--- Week ${i + 1}: ${weekStart.toDateString()} → ${weekEnd.toDateString()} ---\n`);

    const results = await Promise.allSettled([
      fetchTicketmaster(weekStart, weekEnd),
      fetchSerpApi(weekStart, weekEnd),
      fetchEventbrite(weekStart, weekEnd),
      fetchHistoricCore(weekStart, weekEnd),
    ]);

    const allEvents = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : (console.error("Scraper failed:", r.reason), [])
    );

    console.log(`\nTotal events fetched: ${allEvents.length}`);

    if (allEvents.length > 0) {
      upsertEvents(allEvents);
      console.log(`Upserted ${allEvents.length} events to database.`);
    }
  }

  const total = countEvents();
  console.log(`\nDatabase now contains ${total} total events.`);
  console.log("Done.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
