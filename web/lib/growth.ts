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
>

export function slimChannel(row: ChannelRow): SlimChannel {
  return {
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

/** Whole-panel cold start: nothing measured, nothing bounded, so the grid
 *  would be five building cards. Render one callout instead. */
export function panelBuilding(
  channels: SlimChannel[],
  window: WindowKey
): { have: number; need: number } | null {
  const cells = channels
    .filter((c) => c.status === "ok")
    .map((c) => c.subscriber_growth_rate[window])
  if (cells.length === 0) return null
  if (cells.some((c) => c.state === "ok" || c.state === "bounded")) return null
  const building = cells.find((c) => c.state === "building")
  return { have: building?.have ?? 0, need: building?.need ?? 0 }
}

/** Full subscriber-count series for one channel; the client slices per window. */
export function sparkAll(snapshots: SnapshotsBundle, channelId: string): number[] {
  const series = snapshots.channels[channelId]?.series ?? []
  return series
    .filter((d) => d.status === "ok" && d.subscriber_count !== null)
    .map((d) => d.subscriber_count as number)
}
