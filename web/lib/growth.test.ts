import { describe, expect, it } from "vitest"
import { loadChannels, loadSnapshots } from "./bundles"
import {
  cardModel,
  panelBuilding,
  rankedChannels,
  slimChannel,
  sparkAll,
  sparkWindow,
} from "./growth"
import type { SlimChannel } from "./growth"
import { WINDOWS } from "./types"
import type { StateCell, WindowKey } from "./types"

const W: WindowKey = "90d"

function cell(partial: Partial<StateCell> & { state: StateCell["state"] }): StateCell {
  return { value: null, ...partial }
}

function chan(over: Partial<SlimChannel>): SlimChannel {
  const windows = { "7d": 0, "14d": 0, "30d": 0, "90d": 0, "180d": 0, "365d": 0 }
  const cells = Object.fromEntries(
    Object.keys(windows).map((w) => [w, cell({ state: "building", have: 1, need: 90 })])
  ) as Record<WindowKey, StateCell>
  return {
    channel_id: "c1",
    name: "Test Channel",
    handle: "test",
    is_self: false,
    avatarUrl: null,
    status: "ok",
    category: "ai-creator",
    niche: null,
    subscriber_bucket: 1000,
    subscriber_count: 219000,
    view_count: 1000000,
    video_count: 100,
    rank: {
      growth: { ...windows, "90d": 1 },
      general: { ...windows, "90d": 1 },
      subscribers: { ...windows, "90d": 1 },
      views: { ...windows, "90d": 1 },
    },
    subscriber_delta: { ...cells },
    subscriber_growth_rate: { ...cells },
    subs_per_1k_views: { ...cells },
    view_delta: { ...cells },
    videos_published: { "30d": 12 },
    median_views_per_video: { "30d": 25246 },
    ...over,
  }
}

describe("rankedChannels", () => {
  it("orders by the mode's rank, absent channels excluded, null ranks last", () => {
    const a = chan({ channel_id: "a", rank: rankAt(2) })
    const b = chan({ channel_id: "b", rank: rankAt(1) })
    const gone = chan({ channel_id: "gone", status: "absent" })
    const unranked = chan({ channel_id: "u", rank: rankAt(null) })
    const out = rankedChannels([a, gone, unranked, b], "growth", W)
    expect(out.map((c) => c.channel_id)).toEqual(["b", "a", "u"])
  })
})

function rankAt(n: number | null) {
  const windows = {
    "7d": null,
    "14d": null,
    "30d": null,
    "90d": n,
    "180d": null,
    "365d": null,
  }
  return { growth: windows, general: windows, subscribers: windows, views: windows }
}

describe("panelBuilding: the cold-start default", () => {
  it("fires when no channel has a measured or bounded growth cell", () => {
    const out = panelBuilding([chan({}), chan({ channel_id: "c2" })], W)
    expect(out).toEqual({ kind: "building", have: 1, need: 90 })
  })
  it("stands down as soon as one channel is measurable", () => {
    const warm = chan({
      channel_id: "warm",
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "ok", value: 0.074 }),
      },
    })
    expect(panelBuilding([chan({}), warm], W)).toBeNull()
  })
  it("a bounded fleet is measurable, not building", () => {
    const bounded = chan({
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "bounded", upper: 0.02 }),
      },
    })
    expect(panelBuilding([bounded], W)).toBeNull()
  })
})

describe("panelBuilding: no_data is not building", () => {
  it("all-insufficient_data channels render no_data, never a fabricated 0 of 0 days", () => {
    const noData = chan({
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "insufficient_data" }),
      },
    })
    const out = panelBuilding([noData], W)
    expect(out).toEqual({ kind: "no_data" })
    expect(out).not.toEqual({ kind: "building", have: 0, need: 0 })
  })
  it("one building channel among insufficient_data ones still reports real have/need", () => {
    const noData = chan({
      channel_id: "nodata",
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "insufficient_data" }),
      },
    })
    const building = chan({
      channel_id: "building",
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "building", have: 5, need: 90 }),
      },
    })
    expect(panelBuilding([noData, building], W)).toEqual({ kind: "building", have: 5, need: 90 })
  })
})

describe("cardModel", () => {
  it("carries the window cells and the 30d stats verbatim", () => {
    const m = cardModel(chan({}), W, "growth", [1, 2, 3])
    expect(m.rank).toBe(1)
    expect(m.growth.state).toBe("building")
    expect(m.bucket).toBe(1000)
    expect(m.videos30d).toBe(12)
    expect(m.medianViews30d).toBe(25246)
    expect(m.spark).toEqual([1, 2, 3])
  })
})

describe("sparkAll: a view_count corruption flag must not hide a usable subscriber_count", () => {
  // pipeline/growth.py delta(): "status only ever reflects a MONOTONIC_KEYS violation, so it only
  // gates those metrics. subscriber_count is never monotonicity-checked ... so a view_count
  // corruption flag on a row must not also mask that row's otherwise-usable subscriber_count."
  // Filtering the subscriber series on status broke that: Pat Simmons' 90d delta reads +19,020
  // from 2,680 -> 21,700, while the line skipped every corrupt day and drew 6,800 -> 21,700, so
  // the chart under the number disagreed with it by 4,120 subscribers.
  const bundle = {
    generated_at: "",
    version: 3,
    dates_present: [],
    dates_missing: [],
    channels: {
      c1: {
        handle: "c1",
        series: [
          { date: "2026-04-30", status: "corrupt", subscriber_count: 2680 },
          { date: "2026-06-11", status: "ok", subscriber_count: 6800 },
          { date: "2026-07-28", status: "ok", subscriber_count: 21700 },
        ],
      },
    },
  } as unknown as Parameters<typeof sparkAll>[0]

  it("keeps a corrupt day that still carries a subscriber count", () => {
    expect(sparkAll(bundle, "c1")).toEqual([
      { date: "2026-04-30", value: 2680 },
      { date: "2026-06-11", value: 6800 },
      { date: "2026-07-28", value: 21700 },
    ])
  })

  it("so the line's endpoints reproduce the delta exactly", () => {
    const cell: StateCell = { state: "ok", value: 19020, from: "2026-04-30", to: "2026-07-28" }
    const pts = sparkWindow(sparkAll(bundle, "c1"), cell)
    expect(pts[pts.length - 1] - pts[0]).toBe(cell.value)
  })

  it("a day with no subscriber count at all is still dropped", () => {
    const missing = {
      ...bundle,
      channels: {
        c1: {
          handle: "c1",
          series: [
            { date: "2026-04-30", status: "ok", subscriber_count: null },
            { date: "2026-07-28", status: "ok", subscriber_count: 21700 },
          ],
        },
      },
    } as unknown as Parameters<typeof sparkAll>[0]
    expect(sparkAll(missing, "c1")).toEqual([{ date: "2026-07-28", value: 21700 }])
  })
})

describe("sparkWindow: the line and the number beside it describe the same span", () => {
  const dated = [
    { date: "2025-07-28", value: 2530 },
    { date: "2025-10-13", value: 2590 },
    { date: "2026-04-30", value: 2680 },
    { date: "2026-06-15", value: 12000 },
    { date: "2026-07-28", value: 21700 },
  ]

  it("keeps only the points inside the window's own from/to dates", () => {
    const cell: StateCell = { state: "ok", value: 19020, from: "2026-04-30", to: "2026-07-28" }
    expect(sparkWindow(dated, cell)).toEqual([2680, 12000, 21700])
  })

  it("both endpoints are inclusive", () => {
    const cell: StateCell = { state: "ok", value: 0, from: "2026-06-15", to: "2026-06-15" }
    expect(sparkWindow(dated, cell)).toEqual([12000])
  })

  // The bug this function exists for: Pat Simmons' snapshots stop in October
  // 2025 while his 90d window runs Apr-Jul 2026. Slicing by point count drew
  // the 2025 series next to a 2026 delta; slicing by date draws nothing, which
  // is the honest answer.
  it("a series that ends before the window returns no points, not the tail of an older year", () => {
    const stale = dated.slice(0, 2)
    const cell: StateCell = { state: "ok", value: 19020, from: "2026-04-30", to: "2026-07-28" }
    expect(sparkWindow(stale, cell)).toEqual([])
  })

  it("a cell carrying no window dates plots nothing rather than guessing a span", () => {
    expect(sparkWindow(dated, { state: "building", value: null })).toEqual([])
  })
})

describe("the chart reconciles with the number, across the whole real roster", () => {
  // The card prints a delta and draws a line directly under it. If the line's
  // own endpoints do not reproduce that delta, one of them is lying, and which
  // one is not obvious to a reader. This is the invariant that keeps them
  // honest for every channel and every window at once.
  it("last minus first equals the delta, for every measurable window", () => {
    const channels = loadChannels().channels.map((c) => slimChannel(c, null))
    const snapshots = loadSnapshots()
    let checked = 0
    for (const c of channels) {
      const all = sparkAll(snapshots, c.channel_id)
      for (const w of WINDOWS) {
        const cell = c.subscriber_delta[w]
        if (cell.state !== "ok" || cell.value === null) continue
        const pts = sparkWindow(all, cell)
        if (pts.length < 2) continue
        expect(
          pts[pts.length - 1] - pts[0],
          `${c.name} ${w}: line says ${pts[pts.length - 1] - pts[0]}, delta says ${cell.value}`
        ).toBe(cell.value)
        checked++
      }
    }
    // Guard against the assertion silently checking nothing.
    expect(checked).toBeGreaterThan(50)
  })
})

describe("against the real bundles", () => {
  it("slims and models all channels without throwing", () => {
    const channels = loadChannels().channels.map((c) => slimChannel(c, null))
    const snapshots = loadSnapshots()
    for (const c of rankedChannels(channels, "growth", W).slice(0, 5)) {
      const spark = sparkWindow(sparkAll(snapshots, c.channel_id), c.subscriber_delta[W])
      const m = cardModel(c, W, "growth", spark)
      expect(typeof m.name).toBe("string")
    }
  })
})
