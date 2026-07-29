import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  channelVideos,
  loadChannelComments,
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadSnapshots,
  loadTopicComments,
  loadTopicPages,
  videosById,
} from "./bundles"
import { RANK_MODES, WINDOWS } from "./types"
import type { LeafTopicPage, StateCell } from "./types"

const CELL_STATES = ["ok", "bounded", "building", "blocked", "insufficient_data", "no_baseline",
  "unavailable"]
const VERDICTS = ["MAKE_THIS_NOW", "ONLY_IF_UNSERVED", "TOO_EARLY", "SKIP", "INSUFFICIENT_DATA"]

/** haveNeed: subscriber_delta, growth-rate and view_delta building cells carry
 *  have/need; subs_per_1k_views building cells do not (growth.py passes the
 *  views cell's state through without the window bookkeeping). */
function expectCell(cell: StateCell, path: string, opts: { haveNeed?: boolean } = {}) {
  expect(CELL_STATES, `${path}.state`).toContain(cell.state)
  if (cell.state === "ok") {
    expect(typeof cell.value, `${path}.value`).toBe("number")
  } else {
    expect(cell.value, `${path}.value must be null when not ok`).toBeNull()
  }
  if (cell.state === "bounded") expect(typeof cell.upper, `${path}.upper`).toBe("number")
  if (cell.state === "building" && opts.haveNeed !== false) {
    expect(typeof cell.have, `${path}.have`).toBe("number")
    expect(typeof cell.need, `${path}.need`).toBe("number")
  }
  // A blocked window always says how many of its days are unusable; that count
  // is the whole difference between "wait" and "this will never complete".
  if (cell.state === "blocked" && opts.haveNeed !== false) {
    expect(typeof cell.unusable, `${path}.unusable`).toBe("number")
    expect(cell.unusable, `${path}.unusable`).toBeGreaterThan(0)
    expect(typeof cell.need, `${path}.need`).toBe("number")
  }
}

describe("meta.json", () => {
  it("carries every field the chrome reads", () => {
    const meta = loadMeta()
    expect(typeof meta.generated_at).toBe("string")
    expect(typeof meta.build_step).toBe("number")
    expect(typeof meta.self_channel_id).toBe("string")
    expect(typeof meta.channels.total).toBe("number")
    expect(typeof meta.snapshot_health.days_present).toBe("number")
    expect(typeof meta.snapshot_health.history_days).toBe("number")
    expect(typeof meta.comment_health.ingested).toBe("number")
    expect(typeof meta.comment_health.classified).toBe("number")
    expect(typeof meta.target.window_days).toBe("number")
    expect(typeof meta.partial_run).toBe("boolean")
  })
})

describe("channels.json", () => {
  it("has rows and exactly one self channel", () => {
    const bundle = loadChannels()
    expect(bundle.channels.length).toBeGreaterThan(0)
    expect(bundle.channels.filter((c) => c.is_self).length).toBe(1)
    expect(typeof bundle.self_channel_id).toBe("string")
  })

  it("every row carries the card and leaderboard fields", () => {
    for (const c of loadChannels().channels) {
      const p = c.handle
      expect(typeof c.channel_id, p).toBe("string")
      expect(typeof c.name, p).toBe("string")
      expect(typeof c.handle, p).toBe("string")
      expect(["ok", "absent", "corrupt"], p).toContain(c.status)
      expect(typeof c.is_self, p).toBe("boolean")
      expect(["ai-creator", "company", "adjacent", "own", "unknown"], p).toContain(c.category)
      if (c.status === "ok") {
        expect(typeof c.subscriber_count, p).toBe("number")
        expect(typeof c.subscriber_bucket, p).toBe("number")
      }
      for (const mode of RANK_MODES) {
        for (const w of WINDOWS) {
          const r = c.rank[mode][w]
          expect(r === null || typeof r === "number", `${p}.rank.${mode}.${w}`).toBe(true)
        }
      }
      for (const w of WINDOWS) {
        expectCell(c.subscriber_delta[w], `${p}.subscriber_delta.${w}`)
        expectCell(c.subscriber_growth_rate[w], `${p}.subscriber_growth_rate.${w}`)
        expectCell(c.subs_per_1k_views[w], `${p}.subs_per_1k_views.${w}`, { haveNeed: false })
        expectCell(c.view_delta[w], `${p}.view_delta.${w}`)
      }
      expect(c.videos_published, p).toHaveProperty("30d")
      expect(c.median_views_per_video, p).toHaveProperty("30d")
    }
  })
})

describe("opportunities.json", () => {
  it("every verdict is a known enum value", () => {
    const bundle = loadOpportunities()
    expect(bundle.rows.length).toBeGreaterThan(0)
    for (const r of bundle.rows) expect(VERDICTS, r.topic_id).toContain(r.verdict)
  })

  it("score blocks are honest: weights sum to 100, out_of matches included weights", () => {
    for (const r of loadOpportunities().rows) {
      const total = r.score.components.reduce((s, c) => s + c.weight, 0)
      expect(total, r.topic_id).toBe(100)
      const included = r.score.components
        .filter((c) => c.state === "ok")
        .reduce((s, c) => s + c.weight, 0)
      if (r.score.value === null) {
        expect(r.score.out_of, r.topic_id).toBeNull()
      } else {
        expect(r.score.out_of, r.topic_id).toBe(included)
        expect(r.score.value, r.topic_id).toBeLessThanOrEqual(included)
      }
      for (const c of r.score.components) {
        expect(["ok", "no_data"], `${r.topic_id}.${c.key}`).toContain(c.state)
        if (c.state === "ok") expect(typeof c.points, `${r.topic_id}.${c.key}`).toBe("number")
      }
      expect(typeof r.own_coverage.covered, r.topic_id).toBe("boolean")
      expect(typeof r.supply.videos, r.topic_id).toBe("number")
      expect(typeof r.supply.creators, r.topic_id).toBe("number")
      expect(Array.isArray(r.demand.fired), r.topic_id).toBe(true)
      for (const e of r.evidence) {
        expect(typeof e.full_name, r.topic_id).toBe("string")
        expect(typeof e.velocity, r.topic_id).toBe("number")
        expect(typeof e.indie.score, r.topic_id).toBe("number")
      }
    }
  })
})

describe("topic_pages.json", () => {
  it("discriminates leaf and parent rows", () => {
    const bundle = loadTopicPages()
    expect(bundle.topics.length).toBeGreaterThan(0)
    for (const t of bundle.topics) {
      expect(typeof t.topic_id).toBe("string")
      expect(typeof t.label).toBe("string")
      expect(typeof t.video_count).toBe("number")
      expect(typeof t.creator_count).toBe("number")
      expect(typeof t.window_days).toBe("number")
      if (t.is_leaf) {
        expect(Array.isArray(t.video_ids), t.topic_id).toBe(true)
        expect(t.edges === null || Array.isArray(t.edges), t.topic_id).toBe(true)
        expect(
          t.newest_video_at === null || typeof t.newest_video_at === "string",
          t.topic_id
        ).toBe(true)
      } else {
        expect(Array.isArray(t.children), t.topic_id).toBe(true)
        expect(typeof t.leaf_count, t.topic_id).toBe("number")
      }
    }
  })
})

describe("snapshots.json", () => {
  it("has a dated series per channel", () => {
    const bundle = loadSnapshots()
    expect(Array.isArray(bundle.dates_present)).toBe(true)
    const entries = Object.values(bundle.channels)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(typeof e.handle).toBe("string")
      for (const day of e.series) {
        expect(typeof day.date).toBe("string")
        expect(typeof day.status).toBe("string")
      }
    }
  })
})

describe("videos.json server-side slice", () => {
  it("returns rows by id with the fields the topic pages read", () => {
    const topics = loadTopicPages().topics
    const leaf = topics.find(
      (t): t is LeafTopicPage => t.is_leaf && t.video_ids.length > 0
    )
    if (!leaf) throw new Error("no leaf topic with videos in _db/")
    const rows = videosById(leaf.video_ids.slice(0, 20))
    expect(rows.length).toBeGreaterThan(0)
    for (const v of rows) {
      expect(typeof v.video_id).toBe("string")
      expect(typeof v.channel_id).toBe("string")
      expect(typeof v.title).toBe("string")
      expect(typeof v.published_at).toBe("string")
      expect(["short", "long"]).toContain(v.type)
      expect(v.view_count === null || typeof v.view_count === "number").toBe(true)
      expect(typeof v.multiplier.state).toBe("string")
      expect(v.comment_stats === null || typeof v.comment_stats === "object").toBe(true)
    }
  })

  it("unknown ids are skipped, not fabricated", () => {
    expect(videosById(["definitely-not-a-video-id"])).toEqual([])
  })

  it("the bundles module never touches comments.json", () => {
    const src = readFileSync(new URL("./bundles.ts", import.meta.url), "utf8")
    expect(src.includes("comments.json")).toBe(false)
  })

  it("channelVideos returns only that channel's rows, sorted ascending", () => {
    const channel = loadChannels().channels.find((c) => c.status === "ok")
    if (!channel) throw new Error("no ok channel in _db/")
    const rows = channelVideos(channel.channel_id)
    for (const v of rows) expect(v.channel_id).toBe(channel.channel_id)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].published_at.localeCompare(rows[i].published_at)).toBeLessThanOrEqual(0)
    }
  })

  it("channelVideos of an unknown channel is empty, not fabricated", () => {
    expect(channelVideos("nope")).toEqual([])
  })
})

describe("comment loaders", () => {
  it("loads a real per-channel comments file with full row shape", () => {
    const withComments = loadChannels().channels.find(
      (c) => loadChannelComments(c.channel_id) !== null,
    )
    expect(withComments).toBeDefined()
    const file = loadChannelComments(withComments!.channel_id)!
    expect(file.channel.totals.ingested).toBeGreaterThan(0)
    const row = file.channel.top[0]
    for (const key of [
      "comment_id", "video_id", "video_title", "video_url", "author", "text",
      "like_count", "reply_count", "published_at", "answered", "lag_days",
      "topic_ids", "category", "channel_id",
    ]) expect(row).toHaveProperty(key)
    expect(row.lag_days).toBeGreaterThanOrEqual(0)
    // every embedded video belongs to this channel
    for (const vc of Object.values(file.videos)) {
      expect(vc.top[0]?.channel_id ?? withComments!.channel_id).toBe(withComments!.channel_id)
    }
  })

  it("returns null for a channel the ledger has not reached", () => {
    expect(loadChannelComments("UC_does_not_exist")).toBeNull()
  })

  it("loads a real per-topic comments file", () => {
    const leaf = loadTopicPages().topics.find(
      (t) => t.is_leaf && loadTopicComments(t.topic_id) !== null,
    )
    expect(leaf).toBeDefined()
    const file = loadTopicComments(leaf!.topic_id)!
    expect(file.topic.totals.comments).toBeGreaterThan(0)
    expect(file.topic.by_category).toHaveProperty("unsorted")
  })

  it("rejects a traversal id for the channel loader instead of reading outside _db/comments", () => {
    expect(loadChannelComments("../meta")).toBeNull()
  })

  it("rejects a traversal id that resolves to a real file outside _db/comments", () => {
    // comments/channel/../../meta.json resolves to the real _db/meta.json;
    // without the id-shape guard this loader would read and return it.
    expect(loadChannelComments("../../meta")).toBeNull()
  })

  it("rejects a traversal id for the topic loader instead of reading outside _db/comments", () => {
    expect(loadTopicComments("../../etc/passwd")).toBeNull()
  })
})
