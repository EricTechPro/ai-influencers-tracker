// Pure helpers for /compare. No fs, no react.
import type { OpportunityRow, Verdict, VideoRow } from "./types"

export interface CoverageCell {
  videos: number
  views: number
}

export interface GapRow {
  topic_id: string
  him: CoverageCell | null
  you: CoverageCell | null
  verdict: Verdict | null
}

/** Per-leaf-topic coverage for one channel. Views are exact viewCounts (Oracle);
 *  a null view_count contributes 0 views but the video still counts. */
export function coverageByTopic(
  videos: VideoRow[],
  channelId: string,
): Map<string, CoverageCell> {
  const out = new Map<string, CoverageCell>()
  for (const v of videos) {
    if (v.channel_id !== channelId) continue
    const topicIds = new Set(
      (v.topic_assignments as { topic_id: string }[]).map((a) => a.topic_id),
    )
    for (const id of topicIds) {
      const cell = out.get(id) ?? { videos: 0, views: 0 }
      cell.videos += 1
      cell.views += v.view_count ?? 0
      out.set(id, cell)
    }
  }
  return out
}

export function comparePartition(
  him: Map<string, CoverageCell>,
  you: Map<string, CoverageCell>,
  opps: OpportunityRow[],
): { himOnly: GapRow[]; youOnly: GapRow[]; both: GapRow[] } {
  const verdictOf = new Map(opps.map((o) => [o.topic_id, o.verdict]))
  const row = (id: string): GapRow => ({
    topic_id: id,
    him: him.get(id) ?? null,
    you: you.get(id) ?? null,
    verdict: verdictOf.get(id) ?? null,
  })
  const ids = new Set([...him.keys(), ...you.keys()])
  const himOnly: GapRow[] = []
  const youOnly: GapRow[] = []
  const both: GapRow[] = []
  for (const id of ids) {
    const r = row(id)
    if (r.him && !r.you) himOnly.push(r)
    else if (!r.him && r.you) youOnly.push(r)
    else both.push(r)
  }
  const byHisViews = (a: GapRow, b: GapRow) =>
    (b.him?.views ?? 0) - (a.him?.views ?? 0) || a.topic_id.localeCompare(b.topic_id)
  himOnly.sort(byHisViews)
  both.sort(byHisViews)
  youOnly.sort(
    (a, b) => (b.you?.videos ?? 0) - (a.you?.videos ?? 0) || a.topic_id.localeCompare(b.topic_id),
  )
  return { himOnly, youOnly, both }
}
