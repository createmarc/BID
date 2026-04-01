import { NextRequest, NextResponse } from "next/server";
import { fetchTicketmaster } from "@/scrapers/ticketmaster";
import { fetchSerpApi } from "@/scrapers/serpapi";
import { fetchEventbrite } from "@/scrapers/eventbrite";
import { fetchHistoricCore } from "@/scrapers/historiccore";
import { fetchInstagram } from "@/scrapers/instagram";
import { upsertEvents } from "@/lib/db";
import { getWeekStart, getWeekEnd } from "@/lib/weeks";

export async function POST(req: NextRequest) {
  // Verify secret token
  const secret = process.env.REFRESH_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const monday = getWeekStart(new Date());
  const weekEnd = getWeekEnd(monday);

  const results = await Promise.allSettled([
    fetchTicketmaster(monday, weekEnd),
    fetchSerpApi(monday, weekEnd),
    fetchEventbrite(monday, weekEnd),
    fetchHistoricCore(monday, weekEnd),
    fetchInstagram(monday, weekEnd),
  ]);

  const allEvents = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  upsertEvents(allEvents);

  const counts = {
    ticketmaster: results[0].status === "fulfilled" ? results[0].value.length : 0,
    serpapi: results[1].status === "fulfilled" ? results[1].value.length : 0,
    eventbrite: results[2].status === "fulfilled" ? results[2].value.length : 0,
    historiccore: results[3].status === "fulfilled" ? results[3].value.length : 0,
    instagram: results[4].status === "fulfilled" ? results[4].value.length : 0,
  };

  return NextResponse.json({
    ok: true,
    week: monday.toISOString().split("T")[0],
    counts,
    total: allEvents.length,
  });
}

// GET: simple browser-accessible refresh with secret in query param
export async function GET(req: NextRequest) {
  const secret = process.env.REFRESH_SECRET;
  if (secret) {
    const token = req.nextUrl.searchParams.get("secret") ?? "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Reuse POST logic
  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: secret ? new Headers({ authorization: `Bearer ${secret}` }) : new Headers(),
    })
  );
}
