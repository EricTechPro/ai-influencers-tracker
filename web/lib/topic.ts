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
  count: number
  newest: string | null
}

/** Every creator's trail on the topic: video count and newest upload, most
 *  prolific first. Pure counting over Oracle rows. */
export function creatorTrail(videos: VideoRow[], channels: ChannelRow[]): TrailRow[] {
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
