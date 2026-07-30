import type { RecentBundle, RecentRow } from "./types"

export type FormatKey = "videos" | "shorts" | "all"
export type RecentWindow = 7 | 14 | 30

export interface RecentOptions {
  window: RecentWindow
  format: FormatKey
  /** how many of one channel's rows reach the grid; null lifts the cap entirely */
  perChannelCap: number | null
  /** breakout score under which a row goes to the tail instead of the grid */
  floor: number
}

export interface RecentSelection {
  ranked: RecentRow[]
  tail: RecentRow[]
}

const DAY_MS = 86_400_000

function ageDays(publishedAt: string, today: Date): number {
  return Math.floor((today.getTime() - Date.parse(publishedAt)) / DAY_MS)
}

function matchesFormat(row: RecentRow, format: FormatKey): boolean {
  if (format === "all") return true
  return format === "shorts" ? row.type === "short" : row.type === "long"
}

/**
 * The feed, as three filters over one bundle.
 *
 * Nothing is ever discarded: a row below the floor, over the per-channel cap, or carrying no
 * score at all lands in `tail` rather than vanishing. A null breakout_score means vidIQ did not
 * return one, which is not the same as a low one, so it is never sorted as a zero.
 *
 * The per-channel cap is the load-bearing one. On the live 2026-07-29 week a single channel held
 * 6 of the 28 outliers by posting a conference back-catalogue, which is exactly the subscriptions
 * page failure this feed exists to replace.
 */
export function selectRecent(
  bundle: RecentBundle,
  opts: RecentOptions,
  today: Date
): RecentSelection {
  // ageDays has no lower bound of its own: a future-dated published_at would
  // otherwise satisfy "<= window" in every window between now and then. Zero
  // future-dated rows exist in the live corpus today; the guard costs nothing
  // and stops that from being silently true tomorrow.
  const inWindow = bundle.videos.filter((v) => {
    if (!matchesFormat(v, opts.format)) return false
    const age = ageDays(v.published_at, today)
    return age >= 0 && age <= opts.window
  })

  // One predicate, used both ways. Written twice — once hand-negated — the two had to stay
  // exact complements by inspection, and a row that satisfied neither would vanish silently.
  const clears = (v: RecentRow): boolean =>
    v.breakout_score !== null && v.breakout_score >= opts.floor

  const scored = inWindow
    .filter(clears)
    .sort(
      (a, b) =>
        (b.breakout_score ?? 0) - (a.breakout_score ?? 0) ||
        a.video_id.localeCompare(b.video_id)
    )

  const belowFloor = inWindow.filter((v) => !clears(v))

  const ranked: RecentRow[] = []
  const capped: RecentRow[] = []
  const seen = new Map<string, number>()
  for (const v of scored) {
    const n = seen.get(v.channel_id) ?? 0
    if (opts.perChannelCap !== null && n >= opts.perChannelCap) {
      capped.push(v)
      continue
    }
    seen.set(v.channel_id, n + 1)
    ranked.push(v)
  }

  return { ranked, tail: [...capped, ...belowFloor] }
}
