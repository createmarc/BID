import type { EventSource } from "@/lib/types";

const SOURCE_CONFIG: Record<EventSource, { label: string; color: string }> = {
  ticketmaster: { label: "Ticketmaster", color: "bg-blue-100 text-blue-700" },
  serpapi: { label: "Google Events", color: "bg-green-100 text-green-700" },
  eventbrite: { label: "Eventbrite", color: "bg-orange-100 text-orange-700" },
  historiccore: { label: "Historic Core", color: "bg-yellow-100 text-yellow-800" },
};

export default function SourceBadge({ source }: { source: EventSource }) {
  const cfg = SOURCE_CONFIG[source] ?? { label: source, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
