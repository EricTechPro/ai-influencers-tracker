// Card models for home panel 1. Pure and client-safe: the server slims the
// channel rows and precomputes sparkline series; this module never touches fs.
import type {
  ChannelRow,
  RankMode,
  SnapshotsBundle,
  StateCell,
  WindowKey,
} from "./types"

export type SlimChannel = Pick<
  ChannelRow,
  | "channel_id"
  | "name"
  | "handle"
  | "is_self"
  | "status"
  | "category"
  | "niche"
  | "subscriber_bucket"
  | "subscriber_count"
  | "view_count"
  | "video_count"
  | "rank"
  | "subscriber_delta"
  | "subscriber_growth_rate"
  | "subs_per_1k_views"
  | "view_delta"
  | "videos_published"
  | "median_views_per_video"
> & {
  /** Decided server-side by channelAvatarUrl; null means render initials. */
  avatarUrl: string | null
}

export function slimChannel(row: ChannelRow, avatarUrl: string | null): SlimChannel {
  return {
    avatarUrl,
    channel_id: row.channel_id,
    name: row.name,
    handle: row.handle,
    is_self: row.is_self,
    status: row.status,
    category: row.category,
    niche: row.niche,
    subscriber_bucket: row.subscriber_bucket,
    subscriber_count: row.subscriber_count,
    view_count: row.view_count,
    video_count: row.video_count,
    rank: row.rank,
    subscriber_delta: row.subscriber_delta,
    subscriber_growth_rate: row.subscriber_growth_rate,
    subs_per_1k_views: row.subs_per_1k_views,
    view_delta: row.view_delta,
    videos_published: row.videos_published,
    median_views_per_video: row.median_views_per_video,
  }
}

export interface CardModel {
  rank: number | null
  channel_id: string
  name: string
  handle: string
  is_self: boolean
  avatarUrl: string | null
  growth: StateCell
  delta: StateCell
  subsPer1k: StateCell
  bucket: number | null
  videos30d: number | null
  medianViews30d: number | null
  spark: number[]
}

export function cardModel(
  row: SlimChannel,
  window: WindowKey,
  mode: RankMode,
  spark: number[]
): CardModel {
  return {
    rank: row.rank[mode][window],
    channel_id: row.channel_id,
    name: row.name,
    handle: row.handle,
    is_self: row.is_self,
    avatarUrl: row.avatarUrl,
    growth: row.subscriber_growth_rate[window],
    delta: row.subscriber_delta[window],
    subsPer1k: row.subs_per_1k_views[window],
    bucket: row.subscriber_bucket,
    videos30d: row.videos_published["30d"] ?? null,
    medianViews30d: row.median_views_per_video["30d"] ?? null,
    spark,
  }
}

/** Absent channels never rank; null ranks sort after every numbered rank. */
export function rankedChannels(
  channels: SlimChannel[],
  mode: RankMode,
  window: WindowKey
): SlimChannel[] {
  return channels
    .filter((c) => c.status === "ok")
    .slice()
    .sort(
      (a, b) =>
        (a.rank[mode][window] ?? Number.POSITIVE_INFINITY) -
        (b.rank[mode][window] ?? Number.POSITIVE_INFINITY)
    )
}

/** The panel-level state when no channel is measurable. `building` means at
 *  least one channel has a real, in-progress window (real have/need); `no_data`
 *  means every unmeasurable channel has no usable snapshot at all yet
 *  (insufficient_data / unavailable), which is a different fact and must never
 *  be spelled as a fabricated "0 of 0 days". */
export type PanelBuildingState =
  | { kind: "building"; have: number; need: number }
  | { kind: "no_data" }

/** Whole-panel cold start: nothing measured, nothing bounded, so the grid
 *  would be five unmeasurable cards. Render one callout instead. */
export function panelBuilding(
  channels: SlimChannel[],
  window: WindowKey
): PanelBuildingState | null {
  const cells = channels
    .filter((c) => c.status === "ok")
    .map((c) => c.subscriber_growth_rate[window])
  if (cells.length === 0) return null
  if (cells.some((c) => c.state === "ok" || c.state === "bounded")) return null
  const building = cells.find((c) => c.state === "building")
  if (building) {
    return { kind: "building", have: building.have ?? 0, need: building.need ?? 0 }
  }
  return { kind: "no_data" }
}

/** One measured subscriber count on one day. Dated, because the sparkline has
 *  to be sliced against the window's calendar dates, not its point count. */
export interface SparkPoint {
  date: string
  value: number
}

/** Full subscriber-count series for one channel; the client slices per window. */
export function sparkAll(snapshots: SnapshotsBundle, channelId: string): SparkPoint[] {
  const series = snapshots.channels[channelId]?.series ?? []
  return series
    .filter((d) => d.status === "ok" && d.subscriber_count !== null)
    .map((d) => ({ date: d.date, value: d.subscriber_count as number }))
}

/**
 * The part of a channel's series that the given window actually covers.
 *
 * Slicing the last N points instead (which is what the card used to do)
 * assumes the series is dense and runs to today. Neither holds: Pat Simmons'
 * snapshots stop on 2025-10-13 while his 90d delta window is 2026-04-30 to
 * 2026-07-28, so "the last 90 points" drew a 2025 line directly beneath a 2026
 * number, and the chart silently described a different year than the figure
 * next to it.
 *
 * Slicing on the window's own from/to dates makes the two agree by
 * construction. A window with no points inside it returns none, and the card
 * says so rather than drawing the nearest thing it can find.
 */
export function sparkWindow(points: SparkPoint[], cell: StateCell): number[] {
  const { from, to } = cell
  if (!from || !to) return []
  return points.filter((p) => p.date >= from && p.date <= to).map((p) => p.value)
}
