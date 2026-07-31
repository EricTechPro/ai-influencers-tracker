import type { RecentBundle, RecentRow } from "./types"

const DAY_MS = 86_400_000

export type FormatKey = "videos" | "shorts" | "all"
/** days back. Which of WINDOW_CHOICES the page offers depends on how far the sweep on disk
 *  actually reaches — see windowsHeld below. */
export type RecentWindow = number

/** Every window the page will ever offer, shortest first. */
export const WINDOW_CHOICES = [7, 14, 30, 45, 60, 90] as const

/**
 * The windows this bundle can honestly answer.
 *
 * The sweep fetches one vidIQ `publishedWithin` range, so the corpus stops dead at its edge —
 * on a `thisMonth` sweep the oldest video is 30 days old, and a 90-day button would return the
 * same 153 videos as the 30-day one while implying three months of coverage. Offering a window
 * the data cannot fill is the "missing data rendered as a zero" failure in another costume.
 *
 * So: every choice up to and including the first one that covers the oldest video held.
 */
export function windowsHeld(videos: { published_at: string }[], today: Date): RecentWindow[] {
  if (videos.length === 0) return [WINDOW_CHOICES[0]]
  const oldest = Math.max(...videos.map((v) => ageDays(v.published_at, today)))
  const out: RecentWindow[] = []
  for (const w of WINDOW_CHOICES) {
    out.push(w)
    if (w >= oldest) break
  }
  return out
}

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
  /**
   * The two above, concatenated: one descending list, which is what the page renders.
   *
   * The split is still computed because it is what orders this list — a row the cap pushed out
   * follows the grid rather than its own score, and a row under the floor follows both. It is no
   * longer two grids: a 2.44x sitting behind a wall labelled "held back" read as a different kind
   * of video than the 2.50x above it, when the only difference is which side of a config number
   * they landed on. The score badge already dims down the ladder, so the ordering says it.
   */
  feed: RecentRow[]
}

/** Descending by score, unscored last. A null breakout_score is a video vidIQ did not measure,
 *  so it sorts behind every measured one rather than ahead of them as a zero would. */
function byScore(a: RecentRow, b: RecentRow): number {
  if (a.breakout_score === null || b.breakout_score === null) {
    if (a.breakout_score === b.breakout_score) return a.video_id.localeCompare(b.video_id)
    return a.breakout_score === null ? 1 : -1
  }
  return b.breakout_score - a.breakout_score || a.video_id.localeCompare(b.video_id)
}

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

  const scored = inWindow.filter(clears).sort(byScore)

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

  const tail = [...capped, ...belowFloor].sort(byScore)
  return { ranked, tail, feed: [...ranked, ...tail] }
}
