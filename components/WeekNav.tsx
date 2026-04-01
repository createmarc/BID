import Link from "next/link";

interface Props {
  prevWeek: string;
  nextWeek: string;
  label: string;
}

export default function WeekNav({ prevWeek, nextWeek, label }: Props) {
  return (
    <div className="flex items-center justify-between mb-8">
      <Link
        href={`/week?w=${prevWeek}`}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Previous
      </Link>

      <h2 className="text-lg font-semibold text-gray-800">{label}</h2>

      <Link
        href={`/week?w=${nextWeek}`}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Next
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
