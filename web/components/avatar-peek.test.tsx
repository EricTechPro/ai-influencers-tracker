// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AvatarPeek } from "./avatar-peek"

function peek() {
  return render(
    <AvatarPeek
      src={null}
      name="Charlie Automates"
      handle="charlieautomates"
      size={28}
      stats={[{ label: "subscribers", value: "17,200", note: "±100" }]}
    />
  )
}

describe("AvatarPeek keeps its panel out of the table's layout", () => {
  it("renders no panel until it is opened", () => {
    // The bug this exists to prevent: a hidden-but-positioned panel is still laid out, and the
    // leaderboard's `.tblwrap` is a scrollport under 90rem. Ten idle panels below the last row
    // gave the table 121px of empty scrollable band and made rows 1 and 2 slide under the sticky
    // header. An idle peek must contribute nothing at all.
    const { container } = peek()
    expect(container.querySelector(".avpop")).toBeNull()
    expect(document.body.querySelector(".avpop")).toBeNull()
  })

  it("opens on pointer and on keyboard focus, and closes again", () => {
    const { container } = peek()
    const anchor = container.querySelector(".avpeek")!

    fireEvent.pointerEnter(anchor)
    expect(document.body.querySelector(".avpop")).not.toBeNull()
    expect(screen.getByText("@charlieautomates")).toBeTruthy()

    fireEvent.pointerLeave(anchor)
    expect(document.body.querySelector(".avpop")).toBeNull()

    // :focus-within used to hand the keyboard the same affordance the mouse got. Now that the
    // panel is portalled, focus has to open it explicitly, so this is the path that regresses
    // silently if the handlers are ever dropped.
    fireEvent.focus(anchor)
    expect(document.body.querySelector(".avpop")).not.toBeNull()
    fireEvent.blur(anchor)
    expect(document.body.querySelector(".avpop")).toBeNull()
  })

  it("portals the panel onto the body rather than into the row", () => {
    // Being outside the table is the whole fix: inside it, the panel is both clipped by the
    // wrapper's overflow and counted in its scrollable height.
    const { container } = peek()
    fireEvent.pointerEnter(container.querySelector(".avpeek")!)
    const panel = document.body.querySelector(".avpop")!
    expect(container.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
  })

  it("renders an unmeasured stat as a state rather than as a zero", () => {
    const { container } = render(
      <AvatarPeek src={null} name="Nobody" stats={[{ label: "comments", value: null }]} />
    )
    fireEvent.pointerEnter(container.querySelector(".avpeek")!)
    // Scoped to the panel this render opened: the portal puts every panel on the same body, so a
    // document-wide text query would happily match one left over from another case.
    const panels = document.body.querySelectorAll(".avpop")
    const stat = panels[panels.length - 1].querySelector(".avpop-stat .v")
    expect(stat?.textContent).toBe("--")
  })
})
