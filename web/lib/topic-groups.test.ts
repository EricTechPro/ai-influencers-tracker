import { describe, expect, it } from "vitest"
import { groupFeedByTopic } from "./topic-groups"
import type { RecentRow } from "./types"

function row(over: Partial<RecentRow>): RecentRow {
  return {
    video_id: "v", title: "t", published_at: "2026-07-28T00:00:00Z",
    view_count: 100, duration_s: 60, type: "short",
    channel_id: "UC1", channel_name: "One",
    breakout_score: 4, vph: null,
    momentum: { state: "steady", daily_share: null, per_day: null, vph: null },
    pattern_id: null,
    ...over,
  } as RecentRow
}

describe("groupFeedByTopic", () => {
  it("groups videos that share a topic", () => {
    const rows = [row({ video_id: "a" }), row({ video_id: "b" })]
    const out = groupFeedByTopic(rows, () => ["subagents"])
    expect(out).toHaveLength(1)
    expect(out[0].topic_id).toBe("subagents")
    expect(out[0].videos).toHaveLength(2)
  })

  it("puts a video with two topics in both groups, because it is in both", () => {
    const out = groupFeedByTopic([row({ video_id: "a" })], () => ["x", "y"])
    expect(out.map((g) => g.topic_id).sort()).toEqual(["x", "y"])
  })

  it("gives untopiced videos their own group keyed null, never dropping them", () => {
    const out = groupFeedByTopic([row({ video_id: "a" })], () => [])
    expect(out).toHaveLength(1)
    expect(out[0].topic_id).toBeNull()
  })

  it("sorts groups by summed views, biggest first", () => {
    const rows = [
      row({ video_id: "a", view_count: 10 }),
      row({ video_id: "b", view_count: 900 }),
    ]
    const out = groupFeedByTopic(rows, (id) => (id === "a" ? ["small"] : ["big"]))
    expect(out.map((g) => g.topic_id)).toEqual(["big", "small"])
  })

  it("keeps the untopiced group last however big it is", () => {
    const rows = [
      row({ video_id: "a", view_count: 10 }),
      row({ video_id: "b", view_count: 90_000 }),
    ]
    const out = groupFeedByTopic(rows, (id) => (id === "a" ? ["small"] : []))
    expect(out[out.length - 1].topic_id).toBeNull()
  })

  it("counts distinct creators, not videos", () => {
    const rows = [
      row({ video_id: "a", channel_id: "UC1" }),
      row({ video_id: "b", channel_id: "UC1" }),
      row({ video_id: "c", channel_id: "UC2" }),
    ]
    const out = groupFeedByTopic(rows, () => ["t"])
    expect(out[0].creators).toBe(2)
  })

  it("averages only the scores vidIQ returned, and reports null when it returned none", () => {
    const rows = [row({ video_id: "a", breakout_score: 6 }), row({ video_id: "b", breakout_score: null })]
    expect(groupFeedByTopic(rows, () => ["t"])[0].avgBreakout).toBe(6)
    expect(groupFeedByTopic([row({ breakout_score: null })], () => ["t"])[0].avgBreakout).toBeNull()
  })

  it("returns an empty array for an empty feed", () => {
    expect(groupFeedByTopic([], () => ["t"])).toEqual([])
  })

  it("treats a null view_count as unknown, not as zero, when summing", () => {
    const out = groupFeedByTopic([row({ view_count: null })], () => ["t"])
    expect(out[0].views).toBe(0)
    expect(out[0].videos).toHaveLength(1)
  })
})
