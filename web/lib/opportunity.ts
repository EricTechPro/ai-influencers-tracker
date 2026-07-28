// Row models for the opportunity table. The "who's on it" cluster is derived
// server-side from the topic's video_ids so videos.json never reaches the
// client; the client receives only names.
import type { ChannelRow, LeafTopicPage, OpportunityRow, TopicPage, VideoRow } from "./types"
import type { Tiered } from "./sort"

export interface CreatorRef {
  channel_id: string
  name: string
  is_self: boolean
}

export interface OppRowModel {
  row: OpportunityRow
  label: string
  newest_video_at: string | null
  creators: CreatorRef[]
}

/** null score is tier 0: -- sorts last in BOTH directions, never zero. */
export function scoreSortValue(row: OpportunityRow): Tiered {
  return row.score.value === null ? { tier: 0, v: 0 } : { tier: 2, v: row.score.value }
}

export function oppRowModels(
  rows: OpportunityRow[],
  topics: TopicPage[],
  channels: ChannelRow[],
  videosFor: (ids: string[]) => VideoRow[]
): OppRowModel[] {
  const topicById = new Map(topics.map((t) => [t.topic_id, t]))
  const channelById = new Map(channels.map((c) => [c.channel_id, c]))
  return rows.map((row) => {
    const topic = topicById.get(row.topic_id)
    const leaf = topic && topic.is_leaf ? (topic as LeafTopicPage) : null
    const counts = new Map<string, number>()
    if (leaf) {
      for (const v of videosFor(leaf.video_ids)) {
        counts.set(v.channel_id, (counts.get(v.channel_id) ?? 0) + 1)
      }
    }
    const creators: CreatorRef[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([id]) => {
        const c = channelById.get(id)
        return c ? [{ channel_id: id, name: c.name, is_self: c.is_self }] : []
      })
    return {
      row,
      label: topic?.label ?? row.topic_id,
      newest_video_at: leaf?.newest_video_at ?? null,
      creators,
    }
  })
}
