import type { WeeklyEvents } from "@/lib/types";
import EventCard from "./EventCard";

export default function WeeklyCalendar({ weekly }: { weekly: WeeklyEvents }) {
  const totalEvents = weekly.days.reduce((sum, d) => sum + d.events.length, 0);

  return (
    <div>
      <p className="text-sm text-gray-500 mb-6">
        {totalEvents} event{totalEvents !== 1 ? "s" : ""} this week
      </p>

      {/* Desktop: 7-column grid */}
      <div className="hidden lg:grid lg:grid-cols-7 gap-3">
        {weekly.days.map((day) => (
          <div key={day.label}>
            <div className="mb-2 text-center">
              <span
                className={`text-sm font-semibold ${
                  day.events.length > 0 ? "text-gray-800" : "text-gray-400"
                }`}
              >
                {day.label}
              </span>
              {day.events.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-[#C9A84C] text-white font-bold">
                  {day.events.length}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {day.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
              {day.events.length === 0 && (
                <div className="h-24 rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300">
                  No events
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: vertical list grouped by day */}
      <div className="lg:hidden space-y-8">
        {weekly.days
          .filter((day) => day.events.length > 0)
          .map((day) => (
            <section key={day.label}>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 border-b border-gray-200 pb-1">
                {day.label}
                <span className="ml-2 text-[#C9A84C]">({day.events.length})</span>
              </h3>
              <div className="space-y-3">
                {day.events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
