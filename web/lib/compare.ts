// Pure helpers for /compare. No fs, no react.
import type { StateCell, VideoRow, WindowKey } from "./types"

/** The value only when the cell earned one. Every non-ok state, `bounded`
 *  included, is missing data: a gap computed across it would invent a number. */
export function okValue(cell: StateCell | undefined): number | null {
  return cell && cell.state === "ok" ? cell.value : null
}

export type GapKind = "even" | "percent" | "multiple" | "only-you" | "unknown"

export interface GapValue {
  kind: GapKind
  /** a fraction for "percent" (0.414 = 41%), the multiple for "multiple", else null */
  magnitude: number | null
  direction: "ahead" | "behind" | null
  /** suffix for a lower-is-better row, e.g. "more often" */
  qualifier: string | null
}

/** Anything inside this band of parity is not worth reporting as a difference. */
const EVEN_BAND = 0.1
/** At or above this, a percent stops being readable and becomes a multiple. */
const MULTIPLE_AT = 2

export function gap(
  them: number | null,
  you: number | null,
  opts: { lowerIsBetter?: boolean; qualifier?: string } = {},
): GapValue {
  const qualifier = opts.qualifier ?? null
  const unknown: GapValue = { kind: "unknown", magnitude: null, direction: null, qualifier: null }

  if (them === null || you === null) return unknown
  // A ratio across a sign change describes nothing. No channel in the current
  // build has a negative delta, but losing subscribers is a real thing.
  if (them < 0 || you < 0) return unknown

  if (them === 0 && you === 0) return { kind: "even", magnitude: null, direction: null, qualifier }
  if (them === 0) return { kind: "only-you", magnitude: null, direction: "ahead", qualifier: null }
  if (you === 0) return { kind: "only-you", magnitude: null, direction: "behind", qualifier: null }

  const ratio = you / them
  const ahead = opts.lowerIsBetter ? ratio < 1 : ratio > 1
  // Always report the bigger side over the smaller, so the number is never a fraction.
  const largerSmaller = ratio >= 1 ? ratio : 1 / ratio

  if (largerSmaller <= 1 + EVEN_BAND) {
    return { kind: "even", magnitude: null, direction: null, qualifier }
  }
  const direction = ahead ? "ahead" : "behind"
  if (largerSmaller >= MULTIPLE_AT) {
    return { kind: "multiple", magnitude: largerSmaller, direction, qualifier }
  }
  // For percent, use directional magnitude: how much ahead/behind as a fraction of them
  const magnitude = ahead ? ratio - 1 : 1 - ratio
  return { kind: "percent", magnitude, direction, qualifier }
}

export type VideoFormat = "all" | "long" | "short"

const DAY_MS = 86_400_000

export function windowDays(w: WindowKey): number {
  return Number(w.replace("d", ""))
}

/** Videos published inside the window. Note what this is not: it is not views
 *  earned inside the window. Per-video views_gained is `building` on every row
 *  in the corpus, so lifetime view counts are all that exist. */
export function videosInWindow(videos: VideoRow[], w: WindowKey, now: Date): VideoRow[] {
  const cutoff = now.getTime() - windowDays(w) * DAY_MS
  return videos.filter((v) => Date.parse(v.published_at) >= cutoff)
}

export function splitByFormat(videos: VideoRow[], format: VideoFormat): VideoRow[] {
  return format === "all" ? videos : videos.filter((v) => v.type === format)
}

export interface OutputStats {
  videos: number
  long: number
  short: number
  /** null when nothing in the set carried a view count; never 0 for "unknown" */
  medianViews: number | null
}

export function outputStats(videos: VideoRow[]): OutputStats {
  const views = videos
    .map((v) => v.view_count)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)
  const mid = Math.floor(views.length / 2)
  const medianViews = views.length === 0
    ? null
    : views.length % 2 === 1
      ? views[mid]
      : (views[mid - 1] + views[mid]) / 2
  return {
    videos: videos.length,
    long: videos.filter((v) => v.type === "long").length,
    short: videos.filter((v) => v.type === "short").length,
    medianViews,
  }
}
