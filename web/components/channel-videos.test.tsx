// @vitest-environment jsdom
// The channel page's video grids. Two shelves over one card component: what this creator's
// biggest videos are, and which of them are still pulling. The feed answers neither — it is
// bounded by feed_window_days, and a channel's breakout is usually older than that.
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ChannelVideos } from "./channel-videos"
import type { RecentRow } from "@/lib/types"

afterEach(cleanup)

function card(over: Partial<RecentRow> = {}): RecentRow {
  return {
    video_id: "vid1",
    title: "Stop Prompting Claude",
    published_at: "2026-06-09T00:00:00Z",
    view_count: 725_000,
    duration_s: 799,
    type: "long",
    channel_id: "UCaustin",
    channel_name: "Austin Marchese",
    multiplier: 27.6,
    baseline: 26_000,
    baseline_n: 20,
    views_gained_24h: 400,
    momentum: { state: "steady", per_day: 400, daily_share: 0.0006, vph: 16.7 },
    pattern_id: null,
    lang: "en",
    lang_tier: "declared",
    ...over,
  } as RecentRow
}

describe("ChannelVideos", () => {
  it("renders a card for every video it is given", () => {
    render(<ChannelVideos heading="most viewed" rows={[card(), card({ video_id: "vid2", title: "Second" })]}
      avatarUrl={null} mutedIds={new Set()} />)
    expect(screen.getByText("Stop Prompting Claude")).toBeTruthy()
    expect(screen.getByText("Second")).toBeTruthy()
  })

  it("says so plainly when there is nothing to show, rather than rendering an empty grid", () => {
    render(<ChannelVideos heading="still climbing" rows={[]} avatarUrl={null} mutedIds={new Set()} />)
    expect(screen.getByText(/nothing/i)).toBeTruthy()
  })

  it("hides a muted video, because a mute is one decision across every surface", () => {
    render(<ChannelVideos heading="most viewed" rows={[card(), card({ video_id: "vid2", title: "Muted one" })]}
      avatarUrl={null} mutedIds={new Set(["vid2"])} />)
    expect(screen.getByText("Stop Prompting Claude")).toBeTruthy()
    expect(screen.queryByText("Muted one")).toBeNull()
  })

  it("offers a mute control when the page can write one, and calls back with the card", () => {
    const onToggleMute = vi.fn()
    render(<ChannelVideos heading="most viewed" rows={[card()]} avatarUrl={null}
      mutedIds={new Set()} onToggleMute={onToggleMute} />)
    fireEvent.click(screen.getByRole("button", { name: /mute Stop Prompting Claude/i }))
    expect(onToggleMute).toHaveBeenCalledWith({
      video_id: "vid1", title: "Stop Prompting Claude", channel_name: "Austin Marchese",
    })
  })

  it("shows no mute control when no handler is given, rather than a button that does nothing", () => {
    render(<ChannelVideos heading="most viewed" rows={[card()]} avatarUrl={null} mutedIds={new Set()} />)
    expect(screen.queryByRole("button", { name: /mute/i })).toBeNull()
  })

  it("counts what it is showing, so a shelf thinned by mutes says how many are left", () => {
    render(<ChannelVideos heading="most viewed"
      rows={[card(), card({ video_id: "vid2" }), card({ video_id: "vid3" })]}
      avatarUrl={null} mutedIds={new Set(["vid3"])} />)
    expect(screen.getByText(/2 of 3/)).toBeTruthy()
  })

  it("sorts by views by default, biggest first", () => {
    render(<ChannelVideos heading="most viewed" avatarUrl={null} mutedIds={new Set()} rows={[
      card({ video_id: "small", title: "Small", view_count: 100 }),
      card({ video_id: "big", title: "Big", view_count: 900 }),
    ]} />)
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent))
      .toEqual(["Big", "Small"])
  })

  it("re-sorts to newest when asked, which is a different order than biggest", () => {
    render(<ChannelVideos heading="most viewed" avatarUrl={null} mutedIds={new Set()} rows={[
      card({ video_id: "big", title: "Big", view_count: 900, published_at: "2025-01-01T00:00:00Z" }),
      card({ video_id: "new", title: "New", view_count: 100, published_at: "2026-07-01T00:00:00Z" }),
    ]} />)
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "newest" } })
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent))
      .toEqual(["New", "Big"])
  })

  it("re-sorts by multiplier, which ranks against each channel's own normal", () => {
    render(<ChannelVideos heading="most viewed" avatarUrl={null} mutedIds={new Set()} rows={[
      card({ video_id: "big", title: "Big", view_count: 900, multiplier: 1.2 }),
      card({ video_id: "outlier", title: "Outlier", view_count: 100, multiplier: 40 }),
    ]} />)
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "multiplier" } })
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent))
      .toEqual(["Outlier", "Big"])
  })

  it("sinks an unscored video below every scored one instead of sorting it as a zero", () => {
    render(<ChannelVideos heading="most viewed" avatarUrl={null} mutedIds={new Set()} rows={[
      card({ video_id: "none", title: "Unscored", multiplier: null }),
      card({ video_id: "low", title: "Low", multiplier: 0.1 }),
    ]} />)
    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: "multiplier" } })
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent))
      .toEqual(["Low", "Unscored"])
  })

  it("pages rather than rendering a whole back catalogue at once", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      card({ video_id: `v${i}`, title: `Video ${i}`, view_count: 1000 - i }))
    render(<ChannelVideos heading="most viewed" rows={rows} avatarUrl={null}
      mutedIds={new Set()} perPage={12} />)
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(12)
    expect(screen.queryByText("Video 20")).toBeNull()
  })

  it("shows no pager when everything already fits on one page", () => {
    render(<ChannelVideos heading="most viewed" rows={[card()]} avatarUrl={null}
      mutedIds={new Set()} perPage={12} />)
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull()
  })
})
