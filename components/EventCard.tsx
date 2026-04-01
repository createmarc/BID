import { format } from "date-fns";
import type { NormalizedEvent } from "@/lib/types";
import SourceBadge from "./SourceBadge";

export default function EventCard({ event }: { event: NormalizedEvent }) {
  const startDate = new Date(event.start_time * 1000);
  const timeStr = format(startDate, "h:mm a");
  const endStr = event.end_time ? format(new Date(event.end_time * 1000), "h:mm a") : null;

  return (
    <article className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
      {event.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-36 object-cover"
          loading="lazy"
        />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <SourceBadge source={event.source} />
          {event.price_range && (
            <span className="text-xs font-medium text-gray-500 shrink-0">{event.price_range}</span>
          )}
        </div>

        <h3 className="font-semibold text-gray-900 leading-snug mb-1 line-clamp-2">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#C9A84C] transition-colors"
            >
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </h3>

        <p className="text-xs text-gray-500 mb-1">
          {timeStr}
          {endStr ? ` – ${endStr}` : ""}
        </p>

        {event.venue_name && (
          <p className="text-xs text-gray-500 truncate">{event.venue_name}</p>
        )}

        {event.address && !event.venue_name && (
          <p className="text-xs text-gray-500 truncate">{event.address}</p>
        )}

        {event.description && (
          <p className="text-xs text-gray-600 mt-2 line-clamp-2">{event.description}</p>
        )}
      </div>
    </article>
  );
}
