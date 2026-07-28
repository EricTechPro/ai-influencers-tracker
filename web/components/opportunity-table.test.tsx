// covered chip must gate on covered, not suppressed: a topic you covered a
// long time ago (covered=true, suppressed=false) still deserves a glance hint
// at row level, not just inside the expanded derivation.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { OpportunityRow } from "@/lib/types"
import type { OppRowModel } from "@/lib/opportunity"
import { OpportunityTable } from "./opportunity-table"

function row(overrides: Partial<OpportunityRow>): OpportunityRow {
  return {
    topic_id: "test-topic",
    verdict: "SKIP",
    shape: null,
    hunch: false,
    score: { value: 1, out_of: 75, components: [] },
    demand: { band: "low", fired: [], repo_velocity: null, keyword_volume: null },
    supply: { band: "low", fired: [], videos: 0, creators: 0, window_days: 90 },
    evidence: [],
    own_coverage: { covered: false, suppressed: false, video_id: null, published_at: null },
    trust: {},
    ...overrides,
  }
}

function model(overrides: Partial<OpportunityRow>): OppRowModel {
  return { row: row(overrides), label: "Test Topic", newest_video_at: null, creators: [] }
}

describe("OpportunityTable: covered chip gates on covered, not suppressed", () => {
  it("shows a covered chip for a stale (covered, not suppressed) row, visible even with hide-covered on", () => {
    const html = renderToStaticMarkup(
      <OpportunityTable
        models={[
          model({ own_coverage: { covered: true, suppressed: false, video_id: "abc", published_at: "2025-01-01" } }),
        ]}
      />
    )
    expect(html).toContain("covered, stale")
  })

  it("shows no covered chip when never covered", () => {
    const html = renderToStaticMarkup(<OpportunityTable models={[model({})]} />)
    expect(html).not.toContain(">covered<")
    expect(html).not.toContain("covered, stale")
  })
})
