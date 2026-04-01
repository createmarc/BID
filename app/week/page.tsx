import { Suspense } from "react";
import { getEventsForWeek } from "@/lib/db";
import { getWeekStart, getWeekEnd, parseWeekParam, groupByDay, formatWeekParam, shiftWeek } from "@/lib/weeks";
import WeeklyCalendar from "@/components/WeeklyCalendar";
import WeekNav from "@/components/WeekNav";
import { format } from "date-fns";

interface Props {
  searchParams: Promise<{ w?: string }>;
}

export default async function WeekPage({ searchParams }: Props) {
  const params = await searchParams;
  const monday = params.w ? parseWeekParam(params.w) : getWeekStart(new Date());
  const weekEnd = getWeekEnd(monday);

  const events = getEventsForWeek(monday, weekEnd);
  const weekly = groupByDay(events, monday);

  const prevWeek = formatWeekParam(shiftWeek(monday, -1));
  const nextWeek = formatWeekParam(shiftWeek(monday, 1));

  const label = `${format(monday, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  return (
    <div>
      <WeekNav prevWeek={prevWeek} nextWeek={nextWeek} label={label} />

      {events.length === 0 ? (
        <EmptyState />
      ) : (
        <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading events…</div>}>
          <WeeklyCalendar weekly={weekly} />
        </Suspense>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 text-gray-500">
      <p className="text-2xl font-semibold mb-2">No events found for this week</p>
      <p className="text-sm">
        Run{" "}
        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-mono text-xs">
          npm run fetch
        </code>{" "}
        to pull the latest events, or{" "}
        <a href="/api/refresh" className="text-[#C9A84C] hover:underline">
          trigger a refresh
        </a>
        .
      </p>
    </div>
  );
}
