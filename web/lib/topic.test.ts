import { describe, expect, it } from "vitest"
import { loadChannels, loadTopicPages, videosById } from "./bundles"
import { creatorTrail, findOpp, findTopic, multText } from "./topic"
import type { LeafTopicPage } from "./types"

describe("findTopic and findOpp", () => {
  it("find by id, null when missing", () => {
    const topics = loadTopicPages().topics
    const first = topics[0]
    expect(findTopic(topics, first.topic_id)?.topic_id).toBe(first.topic_id)
    expect(findTopic(topics, "no-such-topic")).toBeNull()
    expect(findOpp([], "anything")).toBeNull()
  })
})

describe("creatorTrail", () => {
  it("groups the real videos of a leaf by channel with counts and newest date", () => {
    const topics = loadTopicPages().topics
    const leaf = topics.find(
      (t): t is LeafTopicPage => t.is_leaf && t.video_ids.length > 0
    )
    if (!leaf) throw new Error("no leaf with videos in _db/")
    const videos = videosById(leaf.video_ids)
    const trail = creatorTrail(videos, loadChannels().channels)
    expect(trail.length).toBeGreaterThan(0)
    const total = trail.reduce((s, t) => s + t.count, 0)
    expect(total).toBe(videos.length)
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i - 1].count).toBeGreaterThanOrEqual(trail[i].count)
    }
    for (const t of trail) {
      expect(typeof t.name).toBe("string")
      expect(t.newest === null || typeof t.newest === "string").toBe(true)
    }
  })
})

describe("multText: a multiplier renders its state, never a fake number", () => {
  it("measured", () => {
    expect(
      multText({ state: "ok", value: 3.2, baseline: 1000, baseline_n: 20, source: "computed" })
    ).toBe("3.2×")
  })
  it("no baseline is a state, not a zero", () => {
    expect(
      multText({ state: "no_baseline", value: null, baseline: null, baseline_n: 14, source: "computed" })
    ).toBe("no baseline")
  })
  it("anything else unmeasured is --", () => {
    expect(
      multText({ state: "building", value: null, baseline: null, baseline_n: 0, source: "computed" })
    ).toBe("--")
  })
})
