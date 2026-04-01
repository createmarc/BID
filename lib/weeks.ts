import { startOfWeek, endOfWeek, addWeeks, format, eachDayOfInterval } from "date-fns";
import type { WeeklyEvents, DayEvents } from "./types";
import type { NormalizedEvent } from "./types";

/** Returns the Monday at 00:00:00 local time for the week containing `date`. */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Returns the Sunday at 23:59:59 local time for the week containing `date`. */
export function getWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 });
}

/** Navigate weeks relative to a given Monday. */
export function shiftWeek(monday: Date, delta: number): Date {
  return addWeeks(monday, delta);
}

/** Format a Monday date as YYYY-MM-DD for use in URL query params. */
export function formatWeekParam(monday: Date): string {
  return format(monday, "yyyy-MM-dd");
}

/** Parse a YYYY-MM-DD string to a Date (UTC midnight → local Monday). */
export function parseWeekParam(param: string): Date {
  // Parse as local date to avoid timezone shifts
  const [year, month, day] = param.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Group a flat list of events into a WeeklyEvents structure. */
export function groupByDay(events: NormalizedEvent[], weekStart: Date): WeeklyEvents {
  const weekEnd = getWeekEnd(weekStart);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const dayMap = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    const d = new Date(event.start_time * 1000);
    const key = format(d, "yyyy-MM-dd");
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(event);
  }

  const dayEvents: DayEvents[] = days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    return {
      date: day,
      label: format(day, "EEE MMM d"),
      events: dayMap.get(key) ?? [],
    };
  });

  return { weekStart, weekEnd, days: dayEvents };
}
