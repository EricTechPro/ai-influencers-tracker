// Row models for the opportunity table. The "who's on it" cluster is derived
// server-side from the topic's video_ids so videos.json never reaches the
// client; the client receives only names.
import type { ChannelRow, LeafTopicPage, OpportunityRow, TopicPage, VideoRow } from "./types"
import type { Tiered } from "./sort"

export interface CreatorRef {
  channel_id: string
  name: string
  is_self: boolean
  avatarUrl: string | null
}

export interface OppRowModel {
  row: OpportunityRow
  label: string
  newest_video_at: string | null
  creators: CreatorRef[]
}

/**
 * The number a band was measured against, read out of its own `fired` list.
 *
 * config/thresholds.json is the authority, but web/ may only read _db/, so the
 * threshold reaches the UI the one honest way it can: every emitted band
 * carries the literal comparisons that produced it (spec: "so a page can show
 * its work"), in both directions — ">= 5000" when it cleared the bar, "< 5000"
 * when it did not. Either way the number on the right is the bar, which is
 * what a meter needs to draw the line the badge is asserting.
 */
export function firedThreshold(fired: string[], metric: string): number | null {
  for (const clause of fired) {
    const m = clause.match(/^(\w+)\s*(?:>=|<=|>|<|==)\s*([\d.]+)$/)
    if (m && m[1] === metric) {
      const n = Number(m[2])
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

const int = (n: number) => Math.round(n).toLocaleString("en-US")

/**
 * The verdict restated as the comparison it actually is.
 *
 * "crowded" is a word for a number, and the badge alone leaves you to guess
 * which number and how far past it. This says it: what the demand signals
 * measured, what bar they were held to, and how much supply already exists in
 * the window. Pure restatement of Oracle values — it introduces no judgment
 * the pipeline did not already make.
 */
export function verdictSentence(row: OpportunityRow): string {
  const { demand, supply } = row
  const volBar = firedThreshold(demand.fired, "keyword_volume")
  const velBar = firedThreshold(demand.fired, "repo_velocity")
  const vidBar = firedThreshold(supply.fired, "videos")

  const signals: string[] = []
  if (demand.keyword_volume !== null) {
    signals.push(
      `${int(demand.keyword_volume)} searches/mo${volBar !== null ? ` against a ${int(volBar)} bar` : ""}`
    )
  }
  if (demand.repo_velocity !== null) {
    signals.push(
      `${int(demand.repo_velocity)} stars/day on the fastest repo${
        velBar !== null ? ` against a ${int(velBar)} bar` : ""
      }`
    )
  }
  const demandPart =
    signals.length === 0
      ? `Demand is ${demand.band} (no signal recorded)`
      : `Demand is ${demand.band}: ${signals.join(", and ")}`

  const supplyPart =
    `Supply is ${supply.band}: ${int(supply.videos)} videos from ${int(supply.creators)} ` +
    `creators in the last ${supply.window_days}d` +
    (vidBar !== null ? `, where ${int(vidBar)} videos is the crowding line` : "")

  return `${demandPart}. ${supplyPart}.`
}

/** null score is tier 0: -- sorts last in BOTH directions, never zero. */
export function scoreSortValue(row: OpportunityRow): Tiered {
  return row.score.value === null ? { tier: 0, v: 0 } : { tier: 2, v: row.score.value }
}

/** Sort value for the topic column: must match the cell's display value (topic_id), not the label. */
export function topicSortValue(model: OppRowModel): string {
  return model.row.topic_id.toLowerCase()
}

export function oppRowModels(
  rows: OpportunityRow[],
  topics: TopicPage[],
  channels: ChannelRow[],
  videosFor: (ids: string[]) => VideoRow[],
  /** Injected like videosFor: this module ships to the client, so it must not
   *  reach the filesystem itself. */
  avatarFor: (channelId: string) => string | null
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
        return c
          ? [{ channel_id: id, name: c.name, is_self: c.is_self, avatarUrl: avatarFor(id) }]
          : []
      })
    return {
      row,
      label: topic?.label ?? row.topic_id,
      newest_video_at: leaf?.newest_video_at ?? null,
      creators,
    }
  })
}
