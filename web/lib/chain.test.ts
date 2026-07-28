import { describe, expect, it } from "vitest"
import { VERB, verbClass, visibleEdges } from "./chain"
import type { ChainEdge } from "./types"

function edge(over: Partial<ChainEdge>): ChainEdge {
  return {
    from: "claude-mcp-add",
    to: "mcp-json",
    relation: "contradicts",
    voices: 2,
    cites: [{ handle: "brad", said_on: "2026-07-16", evidence: "don't use claude mcp add any more" }],
    ...over,
  }
}

describe("VERB covers the four structural relations", () => {
  it("maps every relation", () => {
    expect(VERB.then).toBe("then")
    expect(VERB.requires).toBe("requires")
    expect(VERB.alternative_to).toBe("alternative to")
    expect(VERB.contradicts).toBe("contradicts")
  })
  it("contradicts wears the crowded hue, alternative_to the primary", () => {
    expect(verbClass("contradicts")).toBe("verb-con")
    expect(verbClass("alternative_to")).toBe("verb-alt")
    expect(verbClass("then")).toBe("dim")
    expect(verbClass("requires")).toBe("dim")
  })
})

describe("visibleEdges: an edge without verbatim evidence never renders", () => {
  it("null edges render nothing", () => {
    expect(visibleEdges(null)).toEqual([])
  })
  it("an edge with no cites is dropped", () => {
    expect(visibleEdges([edge({ cites: [] })])).toEqual([])
  })
  it("an edge whose only evidence is whitespace is dropped", () => {
    expect(
      visibleEdges([edge({ cites: [{ handle: "x", said_on: "2026-01-01", evidence: "   " }] })])
    ).toEqual([])
  })
  it("an edge with real evidence renders", () => {
    const e = edge({})
    expect(visibleEdges([e])).toEqual([e])
  })
})
