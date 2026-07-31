import type { RecentBundle, RecentRow } from "./types"

const DAY_MS = 86_400_000

export type FormatKey = "videos" | "shorts" | "all"
/** days back. Which of WINDOW_CHOICES the page offers depends on how far the sweep on disk
 *  actually reaches — see windowsHeld below. */
export type RecentWindow = number

/** Every window the page will ever offer, shortest first. */
export const WINDOW_CHOICES = [1, 3, 7, 14, 30, 45, 60, 90] as const

/**
 * The windows this bundle can honestly answer.
 *
 * The corpus stops dead at both edges, and offering a window the data cannot fill is the
 * "missing data rendered as a zero" failure in another costume. Both ends need the guard:
 *
 * - Above: a 90-day button on a bundle carrying 30 days returns the same rows as the 30-day one
 *   while implying three months of coverage.
 * - Below: a 1-day button is empty whenever the newest video held is older than a day. That end
 *   went unguarded while the feed read the paid vidIQ sweep, and it did not show, because the
 *   shortest choice was 7 and the sweep was never more than a few days stale. `today` is a real
 *   window now, so a feed that has not been swept since yesterday must not offer it.
 *
 * So: every choice from the first that reaches the newest video, up to and including the first
 * that covers the oldest.
 */
export function windowsHeld(videos: { published_at: string }[], today: Date): RecentWindow[] {
  if (videos.length === 0) return [WINDOW_CHOICES[0]]
  const ages = videos.map((v) => ageDays(v.published_at, today))
  const newest = Math.min(...ages)
  const oldest = Math.max(...ages)
  const out: RecentWindow[] = []
  for (const w of WINDOW_CHOICES) {
    if (w < newest) continue
    out.push(w)
    if (w >= oldest) break
  }
  // Every choice sat under the newest video held, which only happens when the whole bundle is
  // older than 90 days. The longest window is the one that holds something.
  return out.length > 0 ? out : [WINDOW_CHOICES[WINDOW_CHOICES.length - 1]]
}

export interface RecentOptions {
  window: RecentWindow
  format: FormatKey
  /** which language scene to show; "all" lifts the filter entirely */
  lang: string
  /** how many of one channel's rows reach the grid; null lifts the cap entirely */
  perChannelCap: number | null
  /** multiplier under which a row goes to the tail instead of the grid */
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

/** Descending by multiplier, unscored last. A null multiplier is a channel we have no baseline
 *  for, so it sorts behind every measured one rather than ahead of them as a zero would. */
function byScore(a: RecentRow, b: RecentRow): number {
  if (a.multiplier === null || b.multiplier === null) {
    if (a.multiplier === b.multiplier) return a.video_id.localeCompare(b.video_id)
    return a.multiplier === null ? 1 : -1
  }
  return b.multiplier - a.multiplier || a.video_id.localeCompare(b.video_id)
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
 * score at all lands in `tail` rather than vanishing. A null multiplier means the channel has no
 * baseline to divide by, which is not the same as a low one, so it is never sorted as a zero.
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
    // Before the floor split and before the per-channel cap, deliberately. A cap spent across
    // both scenes and then filtered would push a channel's Chinese rows to the tail on the
    // strength of its English ones, which is a cap the viewer never set. Four channels on this
    // board post in both scripts, so it is not a hypothetical.
    if (opts.lang !== "all" && v.lang !== opts.lang) return false
    if (!matchesFormat(v, opts.format)) return false
    const age = ageDays(v.published_at, today)
    return age >= 0 && age <= opts.window
  })

  // One predicate, used both ways. Written twice — once hand-negated — the two had to stay
  // exact complements by inspection, and a row that satisfied neither would vanish silently.
  const clears = (v: RecentRow): boolean =>
    v.multiplier !== null && v.multiplier >= opts.floor

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
