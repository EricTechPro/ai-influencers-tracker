import type { RecentRow } from "./types"

export interface TopicGroup {
  /** null is the untopiced group: 46 of the 153 feed videos carry no
   *  assignment, and dropping them would hide 30% of what broke out. */
  topic_id: string | null
  /** videos in this group. A video assigned to N topics appears in N groups,
   *  so this is a per-group figure and is not additive across the array. */
  videos: RecentRow[]
  creators: number
  /** sum of view_count for videos in this group. Per-group figure: a video
   *  assigned to N topics contributes to N groups, so do not sum across all groups. */
  views: number
  /** mean of the vidIQ scores that exist. vidIQ's individual numbers are never
   *  recomputed; averaging them is our arithmetic, so callers label it Derived. */
  avgBreakout: number | null
}

export function groupFeedByTopic(
  rows: RecentRow[],
  topicsOf: (videoId: string) => string[],
): TopicGroup[] {
  const buckets = new Map<string | null, RecentRow[]>()
  for (const r of rows) {
    const topics = topicsOf(r.video_id)
    // Deduplicate topic IDs to prevent double-counting if callback returns duplicates
    const keys: (string | null)[] = topics.length > 0 ? [...new Set(topics)] : [null]
    for (const k of keys) {
      const list = buckets.get(k) ?? []
      list.push(r)
      buckets.set(k, list)
    }
  }

  const groups: TopicGroup[] = [...buckets.entries()].map(([topic_id, videos]) => {
    const scored = videos.map((v) => v.breakout_score).filter((n): n is number => n !== null)
    return {
      topic_id,
      videos,
      creators: new Set(videos.map((v) => v.channel_id)).size,
      views: videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0),
      avgBreakout: scored.length === 0 ? null : scored.reduce((a, b) => a + b, 0) / scored.length,
    }
  })

  // Biggest topic first, with the untopiced group pinned last: it is a state,
  // not a topic, and floating it to the top on volume would read as one.
  return groups.sort((a, b) => {
    if (a.topic_id === null) return 1
    if (b.topic_id === null) return -1
    return b.views - a.views
  })
}
