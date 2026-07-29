import type { VideoCardModel } from "@/components/video-card"
import type { ChannelRow, OpportunityRow, TopicPage, VideoRow } from "./types"

export function findTopic(topics: TopicPage[], id: string): TopicPage | null {
  return topics.find((t) => t.topic_id === id) ?? null
}

export function findOpp(rows: OpportunityRow[], id: string): OpportunityRow | null {
  return rows.find((r) => r.topic_id === id) ?? null
}

export interface TrailRow {
  channel_id: string
  name: string
  is_self: boolean
  avatarUrl: string | null
  count: number
  newest: string | null
}

/** Every creator's trail on the topic: video count and newest upload, most
 *  prolific first. Pure counting over Oracle rows. */
export function creatorTrail(
  videos: VideoRow[],
  channels: ChannelRow[],
  avatarFor: (channelId: string) => string | null
): TrailRow[] {
  const channelById = new Map(channels.map((c) => [c.channel_id, c]))
  const grouped = new Map<string, { count: number; newest: string | null }>()
  for (const v of videos) {
    const g = grouped.get(v.channel_id) ?? { count: 0, newest: null }
    g.count += 1
    if (g.newest === null || v.published_at > g.newest) g.newest = v.published_at
    grouped.set(v.channel_id, g)
  }
  return [...grouped.entries()]
    .map(([channel_id, g]) => {
      const c = channelById.get(channel_id)
      return {
        channel_id,
        name: c?.name ?? channel_id,
        is_self: c?.is_self ?? false,
        avatarUrl: avatarFor(channel_id),
        count: g.count,
        newest: g.newest,
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function multText(m: VideoRow["multiplier"]): string {
  if (m.state === "ok" && m.value !== null) return `${m.value.toFixed(1)}×`
  if (m.state === "no_baseline") return "no baseline"
  return "--"
}

/** C1's videos-below-min_videos gate (spec.md:347,352): the shortfall a topic
 *  page shows instead of rendering as an ordinary scored topic or hiding the
 *  route. Verbatim wording from spec.md's own example, "1 video, need 3". */
export function insufficientText(videoCount: number, minVideos: number): string {
  return `${videoCount} video${videoCount === 1 ? "" : "s"}, need ${minVideos}`
}

/** A topic's videos as cards, best first. "Best" is the channel's own
 *  multiplier where there is one, falling back to raw views, so a small
 *  channel's breakout is not buried under a large channel's routine upload. */
export function topVideoCards(
  videos: VideoRow[],
  channels: ChannelRow[],
  avatarFor: (channelId: string) => string | null,
  limit = 12
): VideoCardModel[] {
  const byId = new Map(channels.map((c) => [c.channel_id, c]))
  return videos
    .map((v) => {
      const c = byId.get(v.channel_id)
      return {
        video_id: v.video_id,
        title: v.title,
        published_at: v.published_at,
        view_count: v.view_count,
        duration_s: v.duration_s,
        type: v.type,
        channel_id: v.channel_id,
        channel_name: c?.name ?? v.channel_id,
        channel_avatar: avatarFor(v.channel_id),
        multiplier: v.multiplier.state === "ok" ? v.multiplier.value : null,
        still_growing: v.traction.still_growing,
      }
    })
    .sort((a, b) => {
      const rank = (x: VideoCardModel) =>
        x.multiplier !== null ? x.multiplier * 1e12 : (x.view_count ?? 0)
      return rank(b) - rank(a)
    })
    .slice(0, limit)
}
