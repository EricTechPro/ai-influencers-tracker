// @vitest-environment jsdom
// vitest.config.ts does not set test.globals, so @testing-library/react cannot
// auto-detect a global afterEach to run its cleanup; wire it explicitly or
// each `it` block below renders into the same jsdom document as the last.
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CommentTable } from "./comment-table"
import type { CommentRow } from "@/lib/types"

afterEach(cleanup)

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()
function row(over: Partial<CommentRow>): CommentRow {
  return {
    comment_id: Math.random().toString(36).slice(2), video_id: "v", video_title: "Video T",
    video_url: "https://youtu.be/v", video_published_at: day(0), author: "a",
    author_channel_id: null, text: "body", like_count: 1, reply_count: 0,
    published_at: day(3), answered: false, lag_days: 3, topic_ids: ["mcp-setup"],
    category: null, channel_id: "ch", ...over,
  }
}
const totals = { ingested: 120, classified: 0 }
const counts = { video_request: 0, question: 0, correction: 0, suggestion: 0, other: 0, unsorted: 120 }

describe("CommentTable", () => {
  it("renders the unclassified state honestly, rows still visible", () => {
    render(<CommentTable rows={[row({ text: "hello world" })]} byCategory={counts} totals={totals} />)
    expect(screen.getByText(/not classified yet/)).toBeTruthy()
    expect(screen.getByText("hello world")).toBeTruthy()
    expect(screen.getByText(/3d after/)).toBeTruthy()
  })
  it("caps honestly: the 8 rows it holds never pass for the 120 ingested", () => {
    // The show-more counter became a pager, so the claim moved but must survive: a table
    // handed a top-N slice has to say it is one. The pager counts what it was given; the
    // footnote says what that was a slice of.
    const { container } = render(
      <CommentTable rows={Array.from({ length: 8 }, (_, i) => row({ like_count: i }))}
        byCategory={counts} totals={totals} />)
    expect(container.querySelector(".pgcount")?.textContent).toContain("8")
    expect(screen.getByText(/top 8 by likes out of 120/)).toBeTruthy()
  })
  it("sorts by replies from the column header, not a separate control", () => {
    render(<CommentTable
      rows={[row({ text: "L", like_count: 9, reply_count: 0 }),
             row({ text: "R", like_count: 0, reply_count: 9 })]}
      byCategory={counts} totals={totals} />)
    fireEvent.click(screen.getByText("repl"))
    const cells = screen.getAllByTestId("comment-text")
    expect(cells[0].textContent).toBe("R")
  })
})
