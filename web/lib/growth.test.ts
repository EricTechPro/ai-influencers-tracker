import { describe, expect, it } from "vitest"
import { loadChannels, loadSnapshots } from "./bundles"
import { cardModel, panelBuilding, rankedChannels, slimChannel, sparkAll } from "./growth"
import type { SlimChannel } from "./growth"
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
    expect(out).toEqual({ have: 1, need: 90 })
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

describe("against the real bundles", () => {
  it("slims and models all channels without throwing", () => {
    const channels = loadChannels().channels.map(slimChannel)
    const snapshots = loadSnapshots()
    for (const c of rankedChannels(channels, "growth", W).slice(0, 5)) {
      const spark = sparkAll(snapshots, c.channel_id)
      const m = cardModel(c, W, "growth", spark)
      expect(typeof m.name).toBe("string")
    }
  })
})
