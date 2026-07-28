// @vitest-environment jsdom
// The four windowed rows carry both a disclosure and an expander on the same words: the label is
// a Derived claim, which owes its formula a real trigger, and the row expands to the dates the
// window resolved to. Both were drawn as buttons, one inside the other, which is invalid HTML —
// React refused the hydration and regenerated the whole table on the client. These pin that the
// row keeps one control, and that neither of the two jobs was dropped to get there.
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CompareTable, type CompareSide } from "./compare-table"
import { WINDOWS, type StateCell, type WindowKey } from "@/lib/types"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  usePathname: () => "/compare",
  useSearchParams: () => new URLSearchParams("a=UCa&b=UCb&w=90d"),
}))

afterEach(cleanup)

const cell = (value: number): StateCell => ({ state: "ok", value, from: "2026-05-01", to: "2026-07-30" })
const perWindow = (value: number) =>
  Object.fromEntries(WINDOWS.map((w) => [w, cell(value)])) as Record<WindowKey, StateCell>

function side(over: Partial<CompareSide> & { channel_id: string }): CompareSide {
  return {
    name: over.channel_id,
    is_self: false,
    subscriber_count: 50_000,
    subscriber_bucket: 1_000,
    view_count: 4_000_000,
    subscriber_delta: perWindow(5_000),
    subscriber_growth_rate: perWindow(0.11),
    view_delta: perWindow(900_000),
    subs_per_1k_views: perWindow(5.5),
    videos: [],
    ...over,
  }
}

function table() {
  return render(
    <CompareTable
      them={side({ channel_id: "UCa" })}
      you={side({ channel_id: "UCb", is_self: true })}
      initialWindow="90d"
      generatedAt="2026-07-30T00:00:00Z"
    />
  )
}

describe("CompareTable row labels", () => {
  it("never nests one button inside another", () => {
    table()
    expect(document.querySelectorAll("button button")).toHaveLength(0)
  })

  it("still expands a windowed row to its detail", () => {
    table()
    const label = screen.getByRole("button", { name: /subs gained/ })
    expect(label.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(label)
    expect(label.getAttribute("aria-expanded")).toBe("true")
  })

  it("still reaches the formula behind a Derived label that also expands", () => {
    table()
    const label = screen.getByRole("button", { name: /subs gained/ })
    fireEvent.focus(label)
    const described = label.getAttribute("aria-describedby")
    expect(described).toBeTruthy()
    expect(document.getElementById(described!)?.textContent).toContain(
      "Subscribers at the end of the window"
    )
  })

  it("still reaches the formula on a label that does not expand", () => {
    table()
    const label = screen.getByRole("button", { name: /long vs shorts/ })
    fireEvent.focus(label)
    const described = label.getAttribute("aria-describedby")
    expect(document.getElementById(described!)?.textContent).toContain(
      "How those videos split"
    )
  })
})
