import { describe, expect, it } from "vitest"
import { loadChannels, loadOpportunities, loadTopicPages, videosById } from "./bundles"
import {
  firedThreshold,
  oppRowModels,
  scoreSortValue,
  topicSortValue,
  verdictSentence,
} from "./opportunity"
import type { OppRowModel } from "./opportunity"
import type { OpportunityRow } from "./types"

function oppRow(over: Partial<OpportunityRow>): OpportunityRow {
  return {
    topic_id: "t1",
    label: "Test topic",
    video_ids: [],
    keyword: null,
    verdict: "SKIP",
    shape: "tutorial",
    hunch: false,
    score: { components: [], out_of: 75, value: 40.3 },
    demand: { band: "HIGH", fired: [], repo_velocity: 1, keyword_volume: null },
    supply: { band: "CROWDED", fired: [], videos: 10, creators: 4, window_days: 90 },
    evidence: [],
    own_coverage: { covered: false, suppressed: false, video_id: null, published_at: null },
    trust: {},
    ...over,
  }
}

describe("scoreSortValue", () => {
  it("a scored row is measured tier", () => {
    expect(scoreSortValue(oppRow({}))).toEqual({ tier: 2, v: 40.3 })
  })
  it("INSUFFICIENT_DATA is tier 0: sorts last in both directions, never zero", () => {
    const r = oppRow({ verdict: "INSUFFICIENT_DATA", score: { components: [], out_of: null, value: null } })
    expect(scoreSortValue(r)).toEqual({ tier: 0, v: 0 })
  })
})

describe("firedThreshold: the number a band was measured against", () => {
  it("reads the threshold off the comparison that fired", () => {
    expect(firedThreshold(["keyword_volume >= 5000"], "keyword_volume")).toBe(5000)
    expect(firedThreshold(["repo_velocity >= 100.0"], "repo_velocity")).toBe(100)
  })
  it("reads it just the same when the comparison failed", () => {
    expect(firedThreshold(["keyword_volume < 5000"], "keyword_volume")).toBe(5000)
  })
  it("picks the named metric out of a mixed list", () => {
    const fired = ["videos >= 5", "creators >= 3"]
    expect(firedThreshold(fired, "videos")).toBe(5)
    expect(firedThreshold(fired, "creators")).toBe(3)
  })
  it("a metric nobody compared has no threshold to draw, and says so", () => {
    expect(firedThreshold(["videos >= 5"], "keyword_volume")).toBeNull()
    expect(firedThreshold([], "videos")).toBeNull()
  })
})

describe("verdictSentence: the band restated in its own numbers", () => {
  it("names both demand signals and the supply it is measured against", () => {
    const row = oppRow({
      verdict: "ONLY_IF_UNSERVED",
      demand: {
        band: "HIGH",
        fired: ["keyword_volume >= 5000", "repo_velocity >= 100.0"],
        keyword_volume: 9883,
        repo_velocity: 964.46,
      },
      supply: {
        band: "CROWDED",
        fired: ["videos >= 5", "creators >= 3"],
        videos: 324,
        creators: 50,
        window_days: 90,
      },
    })
    const s = verdictSentence(row)
    expect(s).toContain("9,883")
    expect(s).toContain("5,000")
    expect(s).toContain("324 videos")
    expect(s).toContain("50 creators")
    expect(s).toContain("90d")
  })

  // A measured zero is a fact about the keyword, and demand can still be HIGH
  // on the other signal: thresholds.demand.high_requires is "either".
  it("a zero-volume keyword still explains why demand is HIGH on velocity", () => {
    const row = oppRow({
      demand: {
        band: "HIGH",
        fired: ["keyword_volume < 5000", "repo_velocity >= 100.0"],
        keyword_volume: 0,
        repo_velocity: 376,
      },
    })
    const s = verdictSentence(row)
    expect(s).toContain("376")
    expect(s).toMatch(/0 searches/)
  })
})

describe("topicSortValue", () => {
  it("matches the displayed topic_id, not the label, when they differ", () => {
    const row = oppRow({ topic_id: "Zzz-Topic" })
    const model: OppRowModel = { row, label: "Aaa Display Label", newest_video_at: null, creators: [] }
    expect(topicSortValue(model)).toBe(row.topic_id.toLowerCase())
    expect(topicSortValue(model)).not.toBe(model.label.toLowerCase())
  })
})

describe("oppRowModels against the real bundles", () => {
  const models = oppRowModels(
    loadOpportunities().rows,
    loadTopicPages().topics,
    loadChannels().channels,
    videosById,
    () => null
  )

  it("models every row with a label", () => {
    expect(models.length).toBe(loadOpportunities().rows.length)
    for (const m of models) {
      expect(typeof m.label).toBe("string")
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it("creators come from the topic's videos, deduplicated", () => {
    const withCreators = models.find((m) => m.creators.length > 0)
    if (!withCreators) throw new Error("no opportunity row with creators in _db/")
    const ids = withCreators.creators.map((c) => c.channel_id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of withCreators.creators) {
      expect(typeof c.name).toBe("string")
      expect(typeof c.is_self).toBe("boolean")
    }
  })

  it("suppressed covered rows exist in the models: suppression is a filter, not a deletion", () => {
    const suppressed = models.filter((m) => m.row.own_coverage.suppressed)
    expect(suppressed.length).toBeGreaterThan(0)
  })
})
