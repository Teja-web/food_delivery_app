/**
 * Rate-limit table — single-table sliding-window counter.
 *
 * One row per (key) where key = `<scope>:<bucket>:<id>` (e.g.
 * `claim:ip:1.2.3.4`, `refer:user:abc`). The window resets when
 * `windowStart + windowMs < now`. See `src/lib/rate-limit.ts`.
 *
 * Cheap, single-instance friendly. Swappable for Redis/Upstash later.
 */

import { text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { dillizntSchema } from "./schema";

export const rateLimits = dillizntSchema.table(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Allows a periodic cleanup query: DELETE WHERE window_start < now() - 1 day.
    index("recruit_rate_limits_window_idx").on(table.windowStart),
  ],
);

export type RateLimitRow = typeof rateLimits.$inferSelect;
