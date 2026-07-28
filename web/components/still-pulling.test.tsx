// @vitest-environment jsdom
// No channel in _db/ currently clears the still-growing bar, so these rows
// cannot be exercised in the browser against real data. The keyboard path is
// pinned here instead of eyeballed.
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StillPulling } from "./still-pulling"
import type { StillPullingRow } from "./still-pulling"

afterEach(cleanup)

function row(over: Partial<StillPullingRow> = {}): StillPullingRow {
  return {
    video_id: "vid1", title: "A video that is still pulling",
    published_at: "2026-06-01T00:00:00Z", view_count: 1000,
    gained7d: null, multiplier: 2.4, topic_id: "mcp-setup", comments: null, ...over,
  }
}

describe("StillPulling", () => {
  it("says so plainly when nothing clears the bar", () => {
    render(<StillPulling rows={[]} channelClassified={0} />)
    expect(screen.getByText(/No video currently clears/)).toBeTruthy()
  })

  it("exposes the expandable row to the keyboard", () => {
    render(<StillPulling rows={[row()]} channelClassified={0} />)
    const toggle = screen.getByRole("button", { name: /expand comments/i })
    expect(toggle.getAttribute("tabindex")).toBe("0")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("toggles on Enter and on Space", () => {
    render(<StillPulling rows={[row()]} channelClassified={0} />)
    const toggle = screen.getByRole("button", { name: /expand comments/i })

    fireEvent.keyDown(toggle, { key: "Enter" })
    expect(screen.getByRole("button", { name: /collapse comments/i })).toBeTruthy()
    expect(screen.getByText(/no comments ingested for this video yet/)).toBeTruthy()

    fireEvent.keyDown(screen.getByRole("button", { name: /collapse comments/i }), { key: " " })
    expect(screen.getByRole("button", { name: /expand comments/i })).toBeTruthy()
  })
})
