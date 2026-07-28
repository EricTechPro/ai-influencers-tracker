// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GapCell } from "./gap-cell"

afterEach(cleanup)

describe("GapCell", () => {
  it("renders a percent with an up arrow when ahead", () => {
    render(<GapCell value={{ kind: "percent", magnitude: 1.17, direction: "ahead", qualifier: null }} />)
    expect(screen.getByText(/117%/)).toBeTruthy()
    expect(screen.getByText(/▲/)).toBeTruthy()
  })

  it("renders a multiple to one decimal", () => {
    render(<GapCell value={{ kind: "multiple", magnitude: 3.18, direction: "ahead", qualifier: null }} />)
    expect(screen.getByText(/3\.2×/)).toBeTruthy()
  })

  it("renders even without an arrow, so parity never reads as a direction", () => {
    render(<GapCell value={{ kind: "even", magnitude: null, direction: null, qualifier: null }} />)
    expect(screen.getByText(/even/)).toBeTruthy()
    expect(screen.queryByText(/▲|▼/)).toBeNull()
  })

  it("renders unknown as the two-character dash", () => {
    const { container } = render(
      <GapCell value={{ kind: "unknown", magnitude: null, direction: null, qualifier: null }} />
    )
    expect(container.textContent).toBe("--")
  })

  it("renders only-you as a label, never a number", () => {
    render(<GapCell value={{ kind: "only-you", magnitude: null, direction: "ahead", qualifier: null }} />)
    expect(screen.getByText(/you only/)).toBeTruthy()
  })

  it("appends the qualifier a lower-is-better row carries", () => {
    render(<GapCell value={{ kind: "multiple", magnitude: 2, direction: "ahead", qualifier: "more often" }} />)
    expect(screen.getByText(/2×\s*more often/)).toBeTruthy()
  })

  it("renders direction in sr-only text for screen readers", () => {
    render(<GapCell value={{ kind: "percent", magnitude: 1.17, direction: "ahead", qualifier: null }} />)
    expect(screen.getByText("ahead")).toBeTruthy()
    const srText = screen.getByText("ahead")
    expect(srText.className).toBe("sr-only")
  })

  it("does not render direction in sr-only for even values", () => {
    render(<GapCell value={{ kind: "even", magnitude: null, direction: null, qualifier: null }} />)
    expect(screen.queryByText("ahead")).toBeNull()
    expect(screen.queryByText("behind")).toBeNull()
  })
})
