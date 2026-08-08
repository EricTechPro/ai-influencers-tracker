/**
 * When a video went up, in the unit a person actually thinks in.
 *
 * The card said "54d" until this. That is a number you have to convert before you can use it, and
 * every reader converts it the same way — to "about two months" — so the card may as well say it.
 * YouTube says "2 months ago" for exactly this reason.
 *
 * The exact date rides along in the title attribute rather than replacing it, because the two
 * answer different questions: "is this recent" wants the rounding, "which upload was this" wants
 * the day.
 */

const DAY = 86_400_000

/** Whole days between, floored at zero. `_db` anchors to midnight UTC, so a browser reading the
 *  page earlier in that day would otherwise produce a negative age on a same-day upload. */
function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY))
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`
}

export function whenText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "no date"
  const days = daysSince(iso, now)
  if (days === 0) return "today"
  if (days < 7) return plural(days, "day")
  // 30 and 365 are the same approximations YouTube uses. A card is not a calendar, and a reader
  // comparing "3 weeks" to "1 month" is not counting the difference.
  if (days < 30) return plural(Math.floor(days / 7), "week")
  if (days < 365) return plural(Math.floor(days / 30), "month")
  return plural(Math.floor(days / 365), "year")
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

/** "Jul 17, 2025". The month is spelled because 7/17 and 17/7 are the same string to different
 *  readers and this board has a Chinese-language cohort on it. */
export function dateText(iso: string | null): string {
  if (!iso) return "no date"
  const d = new Date(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}
