import { describe, expect, it } from "vitest"
import { selectRecent, windowsHeld } from "./recent"
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
    multiplier: 5,
    baseline: 200,
    baseline_n: 20,
    views_gained_24h: 240,
    momentum: { state: "steady" as const, daily_share: 0.01, per_day: 240, vph: 10 },
    pattern_id: null,
    lang: "en",
    lang_tier: "derived",
    ...over,
  }
}

function bundle(videos: RecentRow[]): RecentBundle {
  return {
    version: 1,
    generated_at: "2026-07-29T00:00:00Z",
    source: "corpus",
    fetched_at: "2026-07-29",
    fetched_at_utc: null,
    coverage: {
      channels_requested: 72,
      channels_scored: 72,
      unscored_channel_ids: [],
    },
    display_floor: 2.5,
    per_channel_cap: 2,
    feed_window_days: 30,
    videos,
    patterns: [],
    trust: {},
  }
}

const OPTS = { window: 30 as const, format: "videos" as const, perChannelCap: 2, floor: 2.5,
               lang: "all" }

describe("selectRecent windows", () => {
  it("keeps a video exactly N days old and drops one at N+1", () => {
    const b = bundle([
      row({ video_id: "in", published_at: "2026-07-22T00:00:00Z" }),
      row({ video_id: "out", published_at: "2026-07-21T00:00:00Z" }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, window: 7 }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["in"])
  })

  it("drops a future-dated video instead of counting it in every window", () => {
    const b = bundle([row({ video_id: "future", published_at: "2026-08-05T00:00:00Z" })])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked).toEqual([])
    expect(tail).toEqual([])
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
      row({ video_id: "a1", multiplier: 9 }),
      row({ video_id: "a2", multiplier: 8 }),
      row({ video_id: "a3", multiplier: 7 }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2"])
    expect(tail.map((v) => v.video_id)).toEqual(["a3"])
  })

  it("lifting the cap restores them in score order", () => {
    const b = bundle([
      row({ video_id: "a1", multiplier: 9 }),
      row({ video_id: "a2", multiplier: 8 }),
      row({ video_id: "a3", multiplier: 7 }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, perChannelCap: null }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2", "a3"])
  })
})

describe("selectRecent floor and nulls", () => {
  it("sends a row under the floor to the tail rather than dropping it", () => {
    const b = bundle([
      row({ video_id: "over", multiplier: 3 }),
      row({ video_id: "under", multiplier: 1.2, channel_id: "UCb" }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["over"])
    expect(tail.map((v) => v.video_id)).toEqual(["under"])
  })

  it("a null score is never sorted as a zero: it goes to the tail", () => {
    const b = bundle([row({ video_id: "unknown", multiplier: null })])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked).toEqual([])
    expect(tail.map((v) => v.video_id)).toEqual(["unknown"])
  })

  it("an empty window is empty, not an error", () => {
    expect(selectRecent(bundle([]), OPTS, TODAY)).toEqual({ ranked: [], tail: [], feed: [] })
  })
})

describe("windowsHeld offers only what the bundle can answer", () => {
  const at = (daysAgo: number) => ({
    published_at: new Date(TODAY.getTime() - daysAgo * 86_400_000).toISOString(),
  })

  it("offers today when the feed holds something from today", () => {
    expect(windowsHeld([at(0), at(5)], TODAY)).toEqual([1, 3, 7])
  })

  it("does not offer today when the newest video is older than a day", () => {
    // The guard the paid sweep never needed: its shortest choice was 7 and it was never more
    // than a few days behind, so an empty short window could not be reached.
    expect(windowsHeld([at(2), at(5)], TODAY)).toEqual([3, 7])
  })

  it("drops every window under the newest video, not just the first", () => {
    expect(windowsHeld([at(20)], TODAY)).toEqual([30])
  })

  it("stops at the first window that covers the oldest video held", () => {
    // A 90-day button over 30 days of corpus returns the 30-day list while implying three months.
    expect(windowsHeld([at(0), at(28)], TODAY)).toEqual([1, 3, 7, 14, 30])
  })

  it("offers exactly one window when a single day is all that is held", () => {
    expect(windowsHeld([at(0)], TODAY)).toEqual([1])
  })

  it("falls back to the longest window when everything held is older than all of them", () => {
    // Not an empty rail: the page must always offer a window it can render something in.
    expect(windowsHeld([at(400)], TODAY)).toEqual([90])
  })

  it("offers the shortest window rather than nothing for an empty bundle", () => {
    expect(windowsHeld([], TODAY)).toEqual([1])
  })
})

describe("the language filter", () => {
  const b = bundle([
    row({ video_id: "zh1", lang: "zh", multiplier: 9 }),
    row({ video_id: "en1", lang: "en", multiplier: 8 }),
    row({ video_id: "un1", lang: "none", lang_tier: "unread", multiplier: 7 }),
  ])

  it("returns every language under all", () => {
    expect(selectRecent(b, OPTS, TODAY).feed.map((v) => v.video_id))
      .toEqual(["zh1", "en1", "un1"])
  })

  it("returns one language and nothing else", () => {
    expect(selectRecent(b, { ...OPTS, lang: "zh" }, TODAY).feed.map((v) => v.video_id))
      .toEqual(["zh1"])
  })

  it("treats unread as its own bucket rather than folding it into a real language", () => {
    expect(selectRecent(b, { ...OPTS, lang: "none" }, TODAY).feed.map((v) => v.video_id))
      .toEqual(["un1"])
  })

  it("applies the language before the cap, so the cap is spent on rows you can see", () => {
    // All three share a channel and the cap is 2. Filtered after the cap, the two English rows
    // would take both slots and the Chinese one would fall to the tail on their strength.
    const shared = bundle([
      row({ video_id: "en_a", channel_id: "same", lang: "en", multiplier: 9 }),
      row({ video_id: "en_b", channel_id: "same", lang: "en", multiplier: 8 }),
      row({ video_id: "zh_c", channel_id: "same", lang: "zh", multiplier: 7 }),
    ])
    const { ranked, tail } = selectRecent(shared, { ...OPTS, lang: "zh" }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["zh_c"])
    expect(tail).toEqual([])
  })
})
