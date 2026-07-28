import { describe, expect, it } from "vitest"
import { comparePartition, coverageByTopic } from "./compare"
import type { OpportunityRow, VideoRow } from "./types"

function vid(id: string, channel: string, views: number, topics: string[]): VideoRow {
  return {
    video_id: id, channel_id: channel, title: id, published_at: "2026-06-01T00:00:00Z",
    type: "long", view_count: views, duration_s: 60,
    topic_assignments: topics.map((t) => ({ topic_id: t, primary: true })),
    multiplier: { state: "ok", value: null, baseline: null, baseline_n: null, source: "s" },
    comment_stats: null,
    traction: { still_growing: null, share_recent_7d: null, views_gained: {} },
  }
}

const videos = [
  vid("a1", "HIM", 100, ["rag"]), vid("a2", "HIM", 50, ["rag"]),
  vid("a3", "HIM", 10, ["subagents"]),
  vid("b1", "YOU", 7, ["skills"]), vid("b2", "YOU", 3, ["subagents"]),
]

describe("coverageByTopic", () => {
  it("counts videos and sums exact views per topic for one channel", () => {
    const him = coverageByTopic(videos, "HIM")
    expect(him.get("rag")).toEqual({ videos: 2, views: 150 })
    expect(him.get("skills")).toBeUndefined()
  })
  it("a null view_count adds 0 views but still counts the video", () => {
    const m = coverageByTopic([{ ...videos[0], view_count: null }], "HIM")
    expect(m.get("rag")).toEqual({ videos: 1, views: 0 })
  })
})

describe("comparePartition", () => {
  const opp = { topic_id: "rag", verdict: "MAKE_THIS_NOW" } as OpportunityRow
  it("partitions him-only, you-only, both; him-only sorted by his views desc", () => {
    const out = comparePartition(
      coverageByTopic(videos, "HIM"), coverageByTopic(videos, "YOU"), [opp])
    expect(out.himOnly.map((g) => g.topic_id)).toEqual(["rag"])
    expect(out.himOnly[0].verdict).toBe("MAKE_THIS_NOW")
    expect(out.youOnly.map((g) => g.topic_id)).toEqual(["skills"])
    expect(out.youOnly[0].verdict).toBeNull()
    expect(out.both.map((g) => g.topic_id)).toEqual(["subagents"])
  })
})
