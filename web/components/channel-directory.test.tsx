// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ChannelDirectory } from "./channel-directory"
import type { SlimChannel } from "@/lib/growth"

function ch(over: Partial<SlimChannel>): SlimChannel {
  return {
    channel_id: "UC0", name: "x", handle: "x", avatarUrl: null, is_self: false,
    category: "ai-creator", lang: "en", status: "ok",
    subscriber_count: 1, video_count: 1, view_count: 1,
    ...over,
  } as SlimChannel
}

const ROSTER = [
  ch({ channel_id: "UC1", name: "Adrian Twarog", handle: "AdrianTwarog", lang: "en" }),
  ch({ channel_id: "UC2", name: "AI Engineer", handle: "aiDotEngineer", lang: "en" }),
  ch({ channel_id: "UC3", name: "AI超元域", handle: "AIsuperdomain", lang: "zh" }),
]

function directory(rows = ROSTER) {
  return render(<ChannelDirectory channels={rows} win="90d" />)
}

afterEach(cleanup)

describe("the language row", () => {
  it("offers only languages the roster actually holds", () => {
    directory()
    const tabs = screen.getByRole("group", { name: "language" })
    expect([...tabs.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "all 3", "english 2", "中文 1",
    ])
  })

  it("selecting a language shows that language and nothing else", () => {
    directory()
    fireEvent.click(screen.getByRole("button", { name: /中文/ }))
    expect(screen.getByText("AI超元域")).toBeTruthy()
    expect(screen.queryByText("AI Engineer")).toBeNull()
  })

  it("counts follow the query, so a tab's number is what clicking it produces", () => {
    directory()
    fireEvent.change(screen.getByLabelText(/search channels/i), { target: { value: "adrian" } })
    const tabs = screen.getByRole("group", { name: "language" })
    expect([...tabs.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "all 1", "english 1",
    ])
  })

  it("falls back to all when the query empties the selected language", () => {
    directory()
    fireEvent.click(screen.getByRole("button", { name: /中文/ }))
    fireEvent.change(screen.getByLabelText(/search channels/i), { target: { value: "adrian" } })
    // Not "no channels match" beside a lit 中文 button: the selection followed the query.
    expect(screen.getByText("Adrian Twarog")).toBeTruthy()
    expect(screen.getByRole("button", { name: /^all/ }).getAttribute("aria-pressed")).toBe("true")
  })
})

describe("the search field", () => {
  it("matches a handle typed with its @", () => {
    directory()
    fireEvent.change(screen.getByLabelText(/search channels/i), { target: { value: "@aiDot" } })
    expect(screen.getByText("AI Engineer")).toBeTruthy()
    expect(screen.queryByText("Adrian Twarog")).toBeNull()
  })

  it("clears from the button and from Escape", () => {
    directory()
    const box = screen.getByLabelText(/search channels/i) as HTMLInputElement
    fireEvent.change(box, { target: { value: "adrian" } })
    fireEvent.click(screen.getByRole("button", { name: "clear search" }))
    expect(box.value).toBe("")

    fireEvent.change(box, { target: { value: "adrian" } })
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box.value).toBe("")
  })

  it("/ from anywhere on the page puts the cursor in the box", () => {
    directory()
    fireEvent.keyDown(document, { key: "/" })
    expect(document.activeElement).toBe(screen.getByLabelText(/search channels/i))
  })

  it("/ typed into a field is a slash, not a shortcut", () => {
    directory()
    const box = screen.getByLabelText(/search channels/i) as HTMLInputElement
    const other = document.createElement("input")
    document.body.appendChild(other)
    other.focus()
    fireEvent.keyDown(other, { key: "/" })
    expect(document.activeElement).toBe(other)
    expect(document.activeElement).not.toBe(box)
    other.remove()
  })
})
