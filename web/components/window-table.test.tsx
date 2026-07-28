// @vitest-environment jsdom
// vitest has no global afterEach here (see comment-table.test.tsx), so
// @testing-library/react won't auto-detect one to run its cleanup; wire it
// explicitly or every test after the first renders on top of the last.
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { StateCell, VideoRow, WindowKey } from "@/lib/types"
import { WINDOWS } from "@/lib/types"
import { WindowTable } from "./window-table"

afterEach(cleanup)

const cell = (state: StateCell["state"], value: number | null, extra: Partial<StateCell> = {}): StateCell => ({
  state,
  value,
  ...extra,
})

const ok = (v: number) => cell("ok", v)

// The brief's fixture only populated 7d and 365d; WindowTable renders all six
// (WINDOWS), so the other four need a real cell too or indexing them throws.
function windowRecord(
  map: Partial<Record<WindowKey, StateCell>>,
  fallback: StateCell,
): Record<WindowKey, StateCell> {
  const out = {} as Record<WindowKey, StateCell>
  for (const w of WINDOWS) out[w] = map[w] ?? fallback
  return out
}

const channel = {
  subscriber_delta: windowRecord(
    { "7d": ok(1400), "365d": cell("blocked", null, { unusable: 1, need: 365 }) },
    ok(500),
  ),
  subscriber_growth_rate: windowRecord(
    { "7d": ok(0.069), "365d": cell("blocked", null, { unusable: 1 }) },
    ok(0.02),
  ),
  view_delta: windowRecord(
    { "7d": ok(142_000), "365d": cell("blocked", null, { unusable: 1 }) },
    ok(50_000),
  ),
  subs_per_1k_views: windowRecord(
    { "7d": ok(14.4), "365d": cell("blocked", null, { unusable: 1 }) },
    ok(9.1),
  ),
}

// One video inside every window (published today), so the videos column is
// never a bare "0" that would collide with the "never a zero" assertion below.
const videos = [{ published_at: new Date().toISOString() } as never as VideoRow]

const generatedAt = new Date().toISOString()

describe("WindowTable", () => {
  it("renders one row per window", () => {
    render(<WindowTable channel={channel} videos={videos} generatedAt={generatedAt} />)
    for (const w of WINDOWS) {
      expect(screen.getByText(w)).toBeTruthy()
    }
  })

  it("shows an ok delta as a signed number", () => {
    render(<WindowTable channel={channel} videos={videos} generatedAt={generatedAt} />)
    expect(screen.getByText("+1,400")).toBeTruthy()
  })

  it("renders a blocked window as its reason, never as a zero", () => {
    render(<WindowTable channel={channel} videos={videos} generatedAt={generatedAt} />)
    expect(screen.getAllByText("1 bad day").length).toBeGreaterThan(0)
    expect(screen.queryByText("0")).toBeNull()
  })
})
