// @vitest-environment jsdom
// What the two grids became. The feed used to render everything at or above the display floor,
// then a second collapsed grid built from a card that took no topic — so all 16 of a live 7d
// tail read "no topic assigned" while _db held topics for 11 of them. There is one grid now, and
// these pin the three things that merge can silently get wrong: the low end is still present and
// still last, it carries its topic, and the filters above it actually narrow it.
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RecentFeed } from "./recent-feed"
import type { RecentBundle, RecentRow } from "@/lib/types"

afterEach(cleanup)

const GENERATED_AT = "2026-07-29T00:00:00Z"

function row(over: Partial<RecentRow> & { video_id: string }): RecentRow {
  return {
    title: over.video_id,
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
    ...over,
  }
}

function feed(
  videos: RecentRow[],
  topicsByVideo: Record<string, string[]> = {},
  over: Partial<RecentBundle> = {},
  tagsByVideo: Record<string, string[]> = {}
) {
  const bundle: RecentBundle = {
    version: 1,
    generated_at: GENERATED_AT,
    source: "corpus",
    fetched_at: "2026-07-29",
    fetched_at_utc: null,
    coverage: { channels_requested: 72, channels_scored: 72, unscored_channel_ids: [] },
    display_floor: 2.5,
    per_channel_cap: 2,
    feed_window_days: 30,
    videos,
    patterns: [],
    trust: {},
    ...over,
  }
  return render(
    <RecentFeed
      bundle={bundle}
      avatars={{}}
      selfChannelId="UCself"
      topicsByVideo={topicsByVideo}
      tagsByVideo={tagsByVideo}
      topicLabels={{ frontier: "Frontier model launches", agents: "Multi-agent orchestration" }}
      generatedAt={GENERATED_AT}
    />
  )
}

/** the toolbar readout, whose "N videos of M" is split across elements */
function countText(): string {
  return document.querySelector(".shopcount")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

/** the cards, in the order the grid renders them */
function titles(): string[] {
  return screen.getAllByRole("link").map((a) => a.textContent ?? "")
}

describe("RecentFeed", () => {
  it("keeps the under-floor video in the one grid, behind the ones that cleared it", () => {
    feed([
      row({ video_id: "low", multiplier: 2.01 }),
      row({ video_id: "high", multiplier: 5 }),
    ])
    expect(countText()).toBe("2 videos")
    const shown = titles()
    expect(shown.findIndex((t) => t.includes("high"))).toBeLessThan(
      shown.findIndex((t) => t.includes("low"))
    )
  })

  it("sorts an unscored video last rather than as a zero", () => {
    feed([
      row({ video_id: "unscored", multiplier: null }),
      row({ video_id: "low", multiplier: 2.01 }),
    ])
    const shown = titles()
    expect(shown.findIndex((t) => t.includes("low"))).toBeLessThan(
      shown.findIndex((t) => t.includes("unscored"))
    )
  })

  it("names the topic on a card that landed under the floor", () => {
    feed([row({ video_id: "low", multiplier: 2.01 })], { low: ["frontier"] })
    expect(screen.getAllByText("Frontier model launches").length).toBeGreaterThan(0)
  })

  it("searches title and channel, and says how many of how many are left", () => {
    feed([
      row({ video_id: "keep", title: "Opus 5 review" }),
      row({ video_id: "drop", title: "Something else", channel_name: "B" }),
    ])
    fireEvent.change(screen.getByLabelText("search videos by title or channel"), {
      target: { value: "opus" },
    })
    expect(countText()).toBe("1 video of 2")
    expect(titles().some((t) => t.includes("Something else"))).toBe(false)
  })

  it("narrows to one tag, counting the window rather than the selection", () => {
    feed(
      [row({ video_id: "a" }), row({ video_id: "b" }), row({ video_id: "c" })],
      {},
      {},
      { a: ["agents"], b: ["agents"], c: ["n8n"] }
    )
    const key = screen.getByRole("button", { name: /^agents/ })
    expect(within(key).getByText("2")).toBeTruthy()

    fireEvent.click(key)
    expect(countText()).toBe("2 videos of 3")
    // by title attribute, not by card text: a card's text carries its topic label too
    expect(screen.queryByTitle("c")).toBeNull()
  })

  it("says how many of the videos were captured with tags at all", () => {
    feed([row({ video_id: "a" }), row({ video_id: "b" })], {}, {}, { a: ["agents"] })
    expect(document.querySelector(".tcap")?.textContent).toContain("tags on 1 of 2")
  })

  // The bug this strip was rebuilt for: a 16-key slice inside a masked 142px box left tags that
  // nothing on the page could reach. Every facet has to be one click away, and the button has to
  // say how many that is rather than that there are simply more.
  it("reaches every tag once the strip is opened", () => {
    // 14 videos, each carrying its own tag plus a shared one, so 15 facets clear the n > 1 gate
    // and the closed strip's 12 leaves exactly 3 behind.
    const ids = Array.from({ length: 14 }, (_, i) => `v${i}`)
    const tagsByVideo: Record<string, string[]> = {}
    ids.forEach((id, i) => {
      tagsByVideo[id] = ["shared", `t${i % 14}`, `t${(i + 1) % 14}`]
    })
    feed(ids.map((video_id) => row({ video_id })), {}, {}, tagsByVideo)

    expect(screen.queryByRole("button", { name: /^t13/ })).toBeNull()
    const more = screen.getByRole("button", { name: /more$/ })
    expect(more.textContent).toBe("+ 3 more")

    fireEvent.click(more)
    expect(screen.getByRole("button", { name: /^t13/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "less" })).toBeTruthy()
  })

  it("puts a still-growing video first when asked, whatever its score", () => {
    feed([
      row({ video_id: "spent", multiplier: 9, momentum: { state: "flat", daily_share: 0.001, per_day: 2, vph: 1 } }),
      row({ video_id: "rising", multiplier: 2.6, momentum: { state: "climbing", daily_share: 0.05, per_day: 90, vph: 4 } }),
    ])
    fireEvent.click(screen.getByRole("button", { name: "growing" }))
    expect(titles()[0]).toContain("rising")
  })

  it("shows the sweep's clock time once the sweep recorded one", () => {
    feed([row({ video_id: "a" })], {}, { fetched_at_utc: "2026-07-29T13:40:00Z" })
    // Rendered in the viewer's own zone, so this pins that a clock time appears at all rather
    // than which zone the test runner is in.
    expect(document.querySelector(".cap")?.textContent).toMatch(/swept .*\d{1,2}:\d{2}/)
  })

  it("names the one-day window rather than numbering it", () => {
    // "WHAT WENT UP IN 1 DAYS" is both ungrammatical and a worse answer to the question the
    // window exists for.
    feed([row({ video_id: "a", published_at: GENERATED_AT })])
    fireEvent.click(screen.getByRole("button", { name: "1d" }))
    expect(document.querySelector(".kicker")?.textContent).toBe("WHAT WENT UP TODAY")
  })

  it("drops the redundant age from a sweep that landed today", () => {
    // Same-day is the normal case now that the feed is built from the free daily sweep, so a
    // permanent ", 0d" beside a clock that already says the time is furniture.
    feed([row({ video_id: "a" })], {}, { fetched_at_utc: GENERATED_AT })
    expect(document.querySelector(".cap")?.textContent).not.toContain("0d")
  })
})
