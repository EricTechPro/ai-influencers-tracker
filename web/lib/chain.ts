// The mind-map vocabulary. Every row is a link a creator actually asserted on
// camera; an earlier social-invest attempt that string-matched prose produced
// about 50% junk, which is why edges carry verbatim evidence and an edge
// without it never renders.
import type { ChainEdge, Relation } from "./types"

export const VERB: Record<Relation, string> = {
  then: "then",
  requires: "requires",
  alternative_to: "alternative to",
  contradicts: "contradicts",
}

export function verbClass(relation: Relation): string {
  if (relation === "contradicts") return "verb-con"
  if (relation === "alternative_to") return "verb-alt"
  return "dim"
}

/** The render-side belt to the pipeline's mandatory-evidence promise. */
export function visibleEdges(edges: ChainEdge[] | null): ChainEdge[] {
  if (!edges) return []
  return edges.filter((e) =>
    e.cites.some((c) => typeof c.evidence === "string" && c.evidence.trim().length > 0)
  )
}
