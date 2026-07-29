import { describe, expect, it } from "vitest"
import { selectRecent } from "./recent"
import type { RecentBundle, RecentRow } from "./types"

const TODAY = new Date("2026-07-29T00:00:00Z")

function row(over: Partial<RecentRow> & { video_id: string }): RecentRow {
  return {
    title: "t",
    published_at: "2026-07-27T00:00:00Z",
    view_count: 1000,
    duration_s: 600,
    type: "long",
    channel_id: "UCa",
    channel_name: "A",
    breakout_score: 5,
    pattern_id: null,
    ...over,
  }
}

function bundle(videos: RecentRow[]): RecentBundle {
  return {
    version: 1,
    generated_at: "2026-07-29T00:00:00Z",
    source: "vidiq",
    fetched_at: "2026-07-29",
    window: "thisMonth",
    coverage: {
      channels_requested: 72,
      batches_ok: 3,
      batches_failed: 0,
      missing_channel_ids: [],
    },
    display_floor: 2.5,
    per_channel_cap: 2,
    videos,
    patterns: [],
    trust: {},
  }
}

const OPTS = { window: 30 as const, format: "videos" as const, perChannelCap: 2, floor: 2.5 }

describe("selectRecent windows", () => {
  it("keeps a video exactly N days old and drops one at N+1", () => {
    const b = bundle([
      row({ video_id: "in", published_at: "2026-07-22T00:00:00Z" }),
      row({ video_id: "out", published_at: "2026-07-21T00:00:00Z" }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, window: 7 }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["in"])
  })
})

describe("selectRecent format", () => {
  it("videos means long-form only and shorts means the complement", () => {
    const b = bundle([
      row({ video_id: "long" }),
      row({ video_id: "short", type: "short" }),
    ])
    expect(
      selectRecent(b, { ...OPTS, format: "videos" }, TODAY).ranked.map((v) => v.video_id)
    ).toEqual(["long"])
    expect(
      selectRecent(b, { ...OPTS, format: "shorts" }, TODAY).ranked.map((v) => v.video_id)
    ).toEqual(["short"])
    expect(
      selectRecent(b, { ...OPTS, format: "all" }, TODAY).ranked.length
    ).toBe(2)
  })
})

describe("selectRecent per-channel cap", () => {
  it("keeps a channel's two highest and sends the rest to the tail", () => {
    const b = bundle([
      row({ video_id: "a1", breakout_score: 9 }),
      row({ video_id: "a2", breakout_score: 8 }),
      row({ video_id: "a3", breakout_score: 7 }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2"])
    expect(tail.map((v) => v.video_id)).toEqual(["a3"])
  })

  it("lifting the cap restores them in score order", () => {
    const b = bundle([
      row({ video_id: "a1", breakout_score: 9 }),
      row({ video_id: "a2", breakout_score: 8 }),
      row({ video_id: "a3", breakout_score: 7 }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, perChannelCap: null }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2", "a3"])
  })
})

describe("selectRecent floor and nulls", () => {
  it("sends a row under the floor to the tail rather than dropping it", () => {
    const b = bundle([
      row({ video_id: "over", breakout_score: 3 }),
      row({ video_id: "under", breakout_score: 1.2, channel_id: "UCb" }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["over"])
    expect(tail.map((v) => v.video_id)).toEqual(["under"])
  })

  it("a null score is never sorted as a zero: it goes to the tail", () => {
    const b = bundle([row({ video_id: "unknown", breakout_score: null })])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked).toEqual([])
    expect(tail.map((v) => v.video_id)).toEqual(["unknown"])
  })

  it("an empty window is empty, not an error", () => {
    expect(selectRecent(bundle([]), OPTS, TODAY)).toEqual({ ranked: [], tail: [] })
  })
})
