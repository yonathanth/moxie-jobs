/** Delivery timing in Addis Ababa time (UTC+3, no DST). Pure. */

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Midnight (start of today) in Addis Ababa, as a UTC instant. */
export function startOfDayEat(now: Date): Date {
  const eat = new Date(now.getTime() + EAT_OFFSET_MS);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - EAT_OFFSET_MS);
}

/**
 * When an alert matched at `now` may be sent: now, or the end of quiet hours
 * (Addis Ababa time). Handles windows that cross midnight (22 → 7). from === to = no quiet hours.
 */
export function sendTimeAfterQuiet(now: Date, fromHour: number, toHour: number): Date {
  if (fromHour === toHour) return now;
  const hour = new Date(now.getTime() + EAT_OFFSET_MS).getUTCHours();
  const quiet = fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
  if (!quiet) return now;
  const end = todayAtEat(now, toHour);
  return end > now ? end : new Date(end.getTime() + 24 * HOUR_MS);
}

/** The given hour today in Addis Ababa, as a UTC instant. */
export function todayAtEat(now: Date, hour: number): Date {
  return new Date(startOfDayEat(now).getTime() + hour * HOUR_MS);
}
