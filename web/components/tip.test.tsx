// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { Derived, StateText } from "./trust"

// This suite is not configured with vitest `globals`, so nothing unmounts between cases on its
// own. Every other component test gets away with it by querying its own `container`; these panels
// are portalled onto the body, so a leftover tip from the previous case is indistinguishable from
// the one under test.
afterEach(cleanup)

describe("a Derived formula is reachable without a mouse", () => {
  it("opens on keyboard focus, not only on hover", () => {
    // The failure this exists to prevent: the formula living in a `title`. A title fires on
    // pointer hover and nowhere else, so on a phone this tier advertised a disclosure — dotted
    // underline, help cursor — that could not be invoked at all. A tier defined as "shows its
    // formula" cannot have a mouse-only formula.
    const { container } = render(<Derived formula="a minus b">+9,500</Derived>)
    const trigger = container.querySelector("button")!
    expect(trigger.tagName).toBe("BUTTON")
    expect(document.body.querySelector(".tipnote")).toBeNull()

    fireEvent.focus(trigger)
    const tip = document.body.querySelector(".tipnote")!
    expect(tip.textContent).toBe("a minus b")
    expect(tip.getAttribute("role")).toBe("tooltip")
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id)

    fireEvent.blur(trigger)
    expect(document.body.querySelector(".tipnote")).toBeNull()
  })

  it("portals the panel onto the body so it cannot inflate a table's scroll height", () => {
    // Roughly forty of these render per page. Left inside `.tblwrap` — a scrollport under 90rem —
    // they would give the leaderboard back the empty scroll band the avatar card just cost it.
    const { container } = render(<Derived formula="a minus b">+9,500</Derived>)
    fireEvent.pointerEnter(container.querySelector("button")!)
    const tip = document.body.querySelector(".tipnote")!
    expect(container.contains(tip)).toBe(false)
    expect(tip.parentElement).toBe(document.body)
  })

  it("dismisses on Escape, which is the only dismissal a keyboard has here", () => {
    const { container } = render(<Derived formula="a minus b">+9,500</Derived>)
    const trigger = container.querySelector("button")!
    fireEvent.focus(trigger)
    expect(document.body.querySelector(".tipnote")).not.toBeNull()
    fireEvent.keyDown(trigger, { key: "Escape" })
    expect(document.body.querySelector(".tipnote")).toBeNull()
  })
})

describe("a state renders as a state, with or without a sentence", () => {
  it("carries its explanation on a real trigger when there is one", () => {
    const { container } = render(<StateText text="61/90" explain="Collecting: 61 of 90 days." />)
    const trigger = container.querySelector("button")!
    expect(trigger.className).toContain("statecell")
    fireEvent.focus(trigger)
    expect(document.body.querySelector(".tipnote")?.textContent).toBe("Collecting: 61 of 90 days.")
  })

  it("renders plain text, not an empty control, when there is nothing to explain", () => {
    // A button that opens nothing is worse than no button: it is a tab stop that does not pay.
    const { container } = render(<StateText text="--" />)
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector(".statecell")?.textContent).toBe("--")
  })
})
