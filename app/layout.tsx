import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Historic Core Events — Downtown Los Angeles",
  description:
    "Weekly events happening in the Historic Core neighborhood of Downtown Los Angeles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <header className="bg-[#1A1A2E] text-white">
          <div className="max-w-7xl mx-auto px-4 py-5 flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-wide text-[#C9A84C]">
                Historic Core
              </h1>
              <p className="text-sm text-gray-400 -mt-0.5">Downtown Los Angeles Events</p>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
            Events sourced from Ticketmaster, Google Events, Eventbrite, and{" "}
            <a
              href="https://www.historiccore.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9A84C] hover:underline"
            >
              historiccore.com
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
