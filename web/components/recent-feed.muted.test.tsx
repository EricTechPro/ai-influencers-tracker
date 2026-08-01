// @vitest-environment jsdom
// The mute path, which is the one thing on this page that writes. Its own file rather than a
// describe block in recent-feed.test.tsx: every test here needs a stubbed fetch and an await, and
// mixing that into a suite of synchronous filter assertions makes both harder to read.
//
// What these pin is the pair of claims a mute makes. It hides a card — and it is *only* a hidden
// card: the video stays in the corpus, and the decision is reversible from the page it was made
// on. A mute that could not be undone from the board would be a config edit with a nicer button.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RecentFeed } from "./recent-feed"
import type { MutedEntry } from "@/lib/muted"
import type { RecentBundle, RecentRow } from "@/lib/types"

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
    lang: "en",
    lang_tier: "derived",
    ...over,
  }
}

function entry(over: Partial<MutedEntry> & { video_id: string }): MutedEntry {
  return {
    title: over.video_id,
    channel_name: "A",
    muted_at: "2026-07-28T00:00:00.000Z",
    ...over,
  }
}

function feed(videos: RecentRow[], initialMuted: MutedEntry[] = []) {
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
  }
  return render(
    <RecentFeed
      bundle={bundle}
      avatars={{}}
      selfChannelId="UCself"
      topicsByVideo={{}}
      tagsByVideo={{}}
      topicLabels={{}}
      generatedAt={GENERATED_AT}
      initialMuted={initialMuted}
    />
  )
}

/** the cards, in the order the grid renders them */
function titles(): string[] {
  return screen.queryAllByRole("link").map((a) => a.textContent ?? "")
}

function countText(): string {
  return document.querySelector(".shopcount")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
}

function formatKeys() {
  return within(screen.getByRole("group", { name: "format" }))
}

/** The API answers with the whole list every time, so the client re-syncs to disk on each click.
 *  This stub is the server: it holds the file and applies the same toggle. */
function stubApi(seed: MutedEntry[] = []) {
  const state = new Map(seed.map((e) => [e.video_id, e]))
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { video_id: string; title: string }
    if (state.has(body.video_id)) state.delete(body.video_id)
    else state.set(body.video_id, entry({ ...body, muted_at: "2026-07-29T12:00:00.000Z" }))
    return {
      ok: true,
      json: async () => ({ muted: [...state.values()] }),
    } as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("a muted video", () => {
  it("draws no card, and is not in the count", () => {
    feed([row({ video_id: "keep" }), row({ video_id: "gone" })], [entry({ video_id: "gone" })])
    expect(titles().some((t) => t.includes("gone"))).toBe(false)
    expect(countText()).toBe("1 video")
  })

  // The corpus is the record of what the niche made. A mute is a decision about Eric's own
  // shooting schedule, and it must not quietly restate how much was swept.
  it("stays in the scanned count above the feed", () => {
    feed([row({ video_id: "keep" }), row({ video_id: "gone" })], [entry({ video_id: "gone" })])
    expect(document.body.textContent).toContain("2 scanned")
  })

  it("is still hidden after switching to a format key", () => {
    feed(
      [row({ video_id: "keep" }), row({ video_id: "gone" })],
      [entry({ video_id: "gone" })]
    )
    fireEvent.click(formatKeys().getByRole("button", { name: "long" }))
    expect(titles().some((t) => t.includes("gone"))).toBe(false)
  })
})

describe("the muted key", () => {
  it("is absent until something is muted", () => {
    feed([row({ video_id: "a" })])
    expect(formatKeys().queryByRole("button", { name: /muted/ })).toBeNull()
  })

  it("carries the count and shows only the muted videos", () => {
    feed(
      [row({ video_id: "keep" }), row({ video_id: "gone" }), row({ video_id: "also" })],
      [entry({ video_id: "gone" }), entry({ video_id: "also" })]
    )
    const key = formatKeys().getByRole("button", { name: /muted/ })
    expect(key.textContent).toContain("2")
    fireEvent.click(key)
    expect(titles().some((t) => t.includes("keep"))).toBe(false)
    expect(countText()).toBe("2 videos")
  })

  /**
   * The load-bearing one. You mute a video today and it ages out of every window the feed still
   * offers; a review view that respected the window would then render an empty grid under a key
   * reading "muted 1", which is a count contradicted by the page under it.
   */
  it("reaches a muted video the current window no longer holds", () => {
    feed(
      [
        row({ video_id: "recent" }),
        row({ video_id: "old", published_at: "2026-06-01T00:00:00Z" }),
      ],
      [entry({ video_id: "old" })]
    )
    // 7d by default, and "old" is 58 days back — not in the feed at all.
    expect(titles().some((t) => t.includes("old"))).toBe(false)
    fireEvent.click(formatKeys().getByRole("button", { name: /muted/ }))
    expect(titles().some((t) => t.includes("old"))).toBe(true)
  })

  // Those keys cannot reach the muted view, and a lit key that changes nothing is the invisible
  // state this rail was rebuilt to remove.
  it("hides the groups that do not apply to it", () => {
    feed([row({ video_id: "gone" })], [entry({ video_id: "gone" })])
    fireEvent.click(formatKeys().getByRole("button", { name: /muted/ }))
    expect(screen.queryByRole("group", { name: "window" })).toBeNull()
    expect(screen.queryByRole("group", { name: "sort" })).toBeNull()
    expect(screen.queryByRole("group", { name: "videos per channel" })).toBeNull()
  })
})

describe("muting from a card", () => {
  it("takes the card off the grid and writes the toggle", async () => {
    const api = stubApi()
    feed([row({ video_id: "aaa", title: "Opus 5 review" }), row({ video_id: "bbb" })])

    fireEvent.click(screen.getByRole("button", { name: "mute Opus 5 review" }))

    // Optimistic: gone before the round trip, because the alternative is a card sitting there
    // after the reader has already decided it is not a video they are going to make.
    expect(titles().some((t) => t.includes("Opus 5 review"))).toBe(false)
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    const [url, init] = api.mock.calls[0]
    expect(url).toBe("/api/mute")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      video_id: "aaa",
      title: "Opus 5 review",
      channel_name: "A",
    })
  })

  it("puts the card back when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response)
    )
    feed([row({ video_id: "aaa", title: "Opus 5 review" })])

    fireEvent.click(screen.getByRole("button", { name: "mute Opus 5 review" }))
    expect(titles().some((t) => t.includes("Opus 5 review"))).toBe(false)

    // A feed filtered by a decision that never reached disk is a lie the next reload corrects
    // silently. It has to correct itself here instead.
    await waitFor(() => expect(titles().some((t) => t.includes("Opus 5 review"))).toBe(true))
    expect(document.querySelector(".mutedbar")).toBeNull()
  })
})

describe("the muted strip", () => {
  it("names every muted video and is absent when none are", () => {
    const { unmount } = feed([row({ video_id: "a" })])
    expect(document.querySelector(".mutedbar")).toBeNull()
    unmount()

    feed([row({ video_id: "gone", title: "Opus 5 review" })], [
      entry({ video_id: "gone", title: "Opus 5 review" }),
    ])
    const strip = within(screen.getByRole("group", { name: "muted videos" }))
    expect(strip.getByRole("button", { name: /Opus 5 review/ })).toBeTruthy()
  })

  // The strip is built from config/muted.json, not from the grid, so a decision outlives the
  // video's presence in any window the feed still offers — and outlives the bundle entirely.
  it("names a muted video the bundle no longer carries", () => {
    feed([row({ video_id: "here" })], [entry({ video_id: "ghost", title: "Long gone" })])
    const strip = within(screen.getByRole("group", { name: "muted videos" }))
    expect(strip.getByRole("button", { name: /Long gone/ })).toBeTruthy()
  })

  it("unmutes on click, putting the card back and clearing the strip", async () => {
    const api = stubApi([entry({ video_id: "gone", title: "Opus 5 review" })])
    feed([row({ video_id: "keep" }), row({ video_id: "gone", title: "Opus 5 review" })], [
      entry({ video_id: "gone", title: "Opus 5 review" }),
    ])

    const strip = within(screen.getByRole("group", { name: "muted videos" }))
    fireEvent.click(strip.getByRole("button", { name: /Opus 5 review/ }))

    await waitFor(() => expect(titles().some((t) => t.includes("Opus 5 review"))).toBe(true))
    expect(api).toHaveBeenCalledTimes(1)
    expect(document.querySelector(".mutedbar")).toBeNull()
    expect(countText()).toBe("2 videos")
  })

  // Unmuting the last one from inside the muted view removes the key that is selected. Without
  // the fallback the grid empties with nothing on the page saying why.
  it("falls back to all when the last video is unmuted from the muted view", async () => {
    stubApi([entry({ video_id: "gone", title: "Opus 5 review" })])
    feed([row({ video_id: "keep" }), row({ video_id: "gone", title: "Opus 5 review" })], [
      entry({ video_id: "gone", title: "Opus 5 review" }),
    ])

    fireEvent.click(formatKeys().getByRole("button", { name: /muted/ }))
    expect(titles().some((t) => t.includes("keep"))).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "unmute Opus 5 review" }))
    await waitFor(() => expect(countText()).toBe("2 videos"))
    expect(formatKeys().getByRole("button", { name: "all" }).getAttribute("aria-pressed"))
      .toBe("true")
  })
})
