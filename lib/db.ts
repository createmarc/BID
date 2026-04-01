import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { NormalizedEvent } from "./types";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/events.db";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const resolved = path.resolve(DB_PATH);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(resolved);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      start_time  INTEGER NOT NULL,
      end_time    INTEGER,
      venue_name  TEXT,
      address     TEXT,
      url         TEXT,
      image_url   TEXT,
      price_range TEXT,
      fetched_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
    CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  `);
}

/** Upsert a single event (insert or replace). */
export function upsertEvent(event: NormalizedEvent): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (id, source, title, description, start_time, end_time,
                        venue_name, address, url, image_url, price_range, fetched_at)
    VALUES (@id, @source, @title, @description, @start_time, @end_time,
            @venue_name, @address, @url, @image_url, @price_range, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title       = excluded.title,
      description = excluded.description,
      start_time  = excluded.start_time,
      end_time    = excluded.end_time,
      venue_name  = excluded.venue_name,
      address     = excluded.address,
      url         = excluded.url,
      image_url   = excluded.image_url,
      price_range = excluded.price_range,
      fetched_at  = excluded.fetched_at
  `);
  stmt.run(event);
}

/** Upsert many events in a single transaction. */
export function upsertEvents(events: NormalizedEvent[]): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO events (id, source, title, description, start_time, end_time,
                        venue_name, address, url, image_url, price_range, fetched_at)
    VALUES (@id, @source, @title, @description, @start_time, @end_time,
            @venue_name, @address, @url, @image_url, @price_range, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title       = excluded.title,
      description = excluded.description,
      start_time  = excluded.start_time,
      end_time    = excluded.end_time,
      venue_name  = excluded.venue_name,
      address     = excluded.address,
      url         = excluded.url,
      image_url   = excluded.image_url,
      price_range = excluded.price_range,
      fetched_at  = excluded.fetched_at
  `);
  const insertMany = db.transaction((evts: NormalizedEvent[]) => {
    for (const e of evts) upsert.run(e);
  });
  insertMany(events);
}

/** Return all events whose start_time falls within [weekStart, weekEnd]. */
export function getEventsForWeek(weekStart: Date, weekEnd: Date): NormalizedEvent[] {
  const db = getDb();
  const start = Math.floor(weekStart.getTime() / 1000);
  const end = Math.floor(weekEnd.getTime() / 1000);
  return db
    .prepare(
      `SELECT * FROM events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC`
    )
    .all(start, end) as NormalizedEvent[];
}

/** Delete all events fetched before a given date (for cleanup). */
export function deleteEventsBefore(date: Date): number {
  const db = getDb();
  const ts = Math.floor(date.getTime() / 1000);
  const result = db.prepare(`DELETE FROM events WHERE fetched_at < ?`).run(ts);
  return result.changes;
}

/** Count total events in the database. */
export function countEvents(): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number };
  return row.count;
}
