# Dashboard Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework all five web routes so each does one job — `/` compares, `/channels` is a directory, `/compare` is a stats comparison with a relative gap column, `/topics` groups by topic, and `/channels/[id]` runs on the shared window control.

**Architecture:** Every change lives in `web/`. No pipeline code is touched and no bundle schema changes: everything reads `_db/` files that exist today. Pure logic goes in `lib/` as fs-free, react-free functions that vitest drives directly; rendering stays in `components/`. Server components load bundles and hand plain data to client components that own control state.

**Tech Stack:** Next.js 16 (app router), React 19, TypeScript, vitest 3 (node environment), `@testing-library/react` for component tests.

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-30-dashboard-refinement-design.md` and the project CLAUDE.md. Every task's requirements implicitly include this section.

- **Never assert a number nobody returned.** Missing data is a state, never a zero.
- **Three claim tiers, never blended:** Oracle (exact counts), Derived (computed, shows its formula via the `<Derived>` component), Inference (LLM judgment, rendered beside its evidence).
- A gap cell renders `--` unless **both** sides are `state: "ok"`. `bounded` counts as not-ok.
- Deltas below 5× a channel's bucket width render `< N` via `deltaText`, never a bare number.
- Format never applies to Δsubs or Δviews, on any page.
- Run tests from `web/`: `npx vitest run`. Run a single file with `npx vitest run lib/compare.test.ts`.
- Ruff/line-length rules do not apply here; this is all TypeScript.
- Conventional commits: `feat` `fix` `docs` `refactor` `data` `chore` `test`. Prefix every shell command with `rtk`.
- `config/channels.json` and `.env` are read-denied in `.claude/settings.json`. That is deliberate. Never try to read them.

## Naming note the spec did not settle

`lib/recent.ts` already exports `FormatKey = "videos" | "shorts" | "all"`, where `"videos"` means long-form. That naming is confusing but it is load-bearing on `/topics` and is **not** changed by this plan.

The new format type introduced here is **separate and named for the data**, matching `VideoRow.type`:

```ts
export type VideoFormat = "all" | "long" | "short"
```

Do not merge the two. Do not rename `FormatKey`.

## Spec addition: negative values

The spec's gap rules assume positive quantities. Subscriber and view deltas **can** go negative (a channel losing subscribers), even though no channel in the `2026-07-30` build does. A ratio across a sign change is not a comparison, so:

**If either side is negative, `gap` returns `kind: "unknown"` and the cell renders `--`.**

## File Structure

| file | responsibility |
|---|---|
| `lib/window.ts` (create) | parse the `w` URL param, carry it across links |
| `lib/window.test.ts` (create) | tests for the above |
| `lib/compare.ts` (replace) | `gap`, `okValue`, `videosInWindow`, `splitByFormat`, `outputStats` |
| `lib/compare.test.ts` (replace) | tests for the above |
| `lib/directory.ts` (create) | search + category filtering for `/channels` |
| `lib/directory.test.ts` (create) | tests for the above |
| `lib/topic-groups.ts` (create) | `groupFeedByTopic` |
| `lib/topic-groups.test.ts` (create) | tests for the above |
| `components/gap-cell.tsx` (create) | renders one `GapValue` |
| `components/compare-table.tsx` (create) | client: window + format state, the three row groups |
| `components/compare-bar.tsx` (create) | client: the two-channel selection bar on `/` |
| `components/channel-directory.tsx` (create) | client: search, filters, directory rows |
| `components/topic-groups.tsx` (create) | client: the grouped feed |
| `components/window-table.tsx` (create) | the by-window table on `/channels/[id]` |
| `app/compare/page.tsx` (modify) | server shell only |
| `app/page.tsx` (modify) | pass self id for selection |
| `app/channels/page.tsx` (modify) | render the directory |
| `app/channels/[id]/page.tsx` (modify) | window table, collapsed comments |
| `components/leaderboard-table.tsx` (modify) | selection checkboxes, window from URL |
| `components/channels-table.tsx` (delete) | replaced by `channel-directory.tsx` |
| `components/channel-growth.tsx` (modify) | drop private window picker |
| `components/recent-feed.tsx` (modify) | grouped rendering, hide empty patterns |
| `app/globals.css` (modify) | gap-cell colour classes |

---

### Task 1: The shared window parameter

**Files:**
- Create: `web/lib/window.ts`
- Test: `web/lib/window.test.ts`

**Interfaces:**
- Consumes: `WindowKey` and `WINDOWS` from `@/lib/types`
- Produces: `parseWindow(raw: string | undefined, fallback?: WindowKey): WindowKey` and `withWindow(href: string, w: WindowKey): string`

- [ ] **Step 1: Write the failing test**

Create `web/lib/window.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { parseWindow, withWindow } from "./window"

describe("parseWindow", () => {
  it("accepts every real window key", () => {
    expect(parseWindow("7d")).toBe("7d")
    expect(parseWindow("365d")).toBe("365d")
  })

  it("falls back when the param is missing", () => {
    expect(parseWindow(undefined)).toBe("90d")
  })

  it("falls back when the param is junk rather than throwing", () => {
    expect(parseWindow("42d")).toBe("90d")
    expect(parseWindow("")).toBe("90d")
  })

  it("honours an explicit fallback", () => {
    expect(parseWindow(undefined, "30d")).toBe("30d")
  })
})

describe("withWindow", () => {
  it("adds the param to a bare path", () => {
    expect(withWindow("/compare", "30d")).toBe("/compare?w=30d")
  })

  it("appends to a path that already has params", () => {
    expect(withWindow("/compare?a=UC123", "30d")).toBe("/compare?a=UC123&w=30d")
  })

  it("replaces an existing window rather than adding a second", () => {
    expect(withWindow("/compare?w=7d&a=UC123", "30d")).toBe("/compare?w=30d&a=UC123")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/window.test.ts`
Expected: FAIL — "Failed to resolve import ./window"

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/window.ts`:

```ts
// The window lives in the URL as `w` and follows you across routes. Three pages
// held it in their own useState, so picking 7d on the leaderboard and clicking
// into a comparison silently reset you to 90d.
import type { WindowKey } from "./types"
import { WINDOWS } from "./types"

export const DEFAULT_WINDOW: WindowKey = "90d"

export function parseWindow(
  raw: string | undefined,
  fallback: WindowKey = DEFAULT_WINDOW,
): WindowKey {
  return WINDOWS.includes(raw as WindowKey) ? (raw as WindowKey) : fallback
}

/** An internal href with the current window carried onto it. */
export function withWindow(href: string, w: WindowKey): string {
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set("w", w)
  return `${path}?${params.toString()}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/window.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
rtk git add web/lib/window.ts web/lib/window.test.ts
rtk git commit -m "feat(web): shared window URL parameter"
```

---

### Task 2: The gap value

**Files:**
- Replace: `web/lib/compare.ts` (delete `coverageByTopic` and `comparePartition` entirely)
- Replace: `web/lib/compare.test.ts`

**Interfaces:**
- Consumes: `StateCell` from `@/lib/types`
- Produces:
  - `okValue(cell: StateCell): number | null`
  - `type GapKind = "even" | "percent" | "multiple" | "only-you" | "unknown"`
  - `interface GapValue { kind: GapKind; magnitude: number | null; direction: "ahead" | "behind" | null; qualifier: string | null }`
  - `gap(them: number | null, you: number | null, opts?: { lowerIsBetter?: boolean; qualifier?: string }): GapValue`

- [ ] **Step 1: Write the failing test**

Replace the whole of `web/lib/compare.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { gap, okValue } from "./compare"
import type { StateCell } from "./types"

describe("okValue", () => {
  it("returns the number for an ok cell", () => {
    expect(okValue({ state: "ok", value: 1200 } as StateCell)).toBe(1200)
  })

  it("returns null for every non-ok state, bounded included", () => {
    const states = ["bounded", "building", "blocked", "insufficient_data", "no_baseline", "unavailable"]
    for (const state of states) {
      expect(okValue({ state, value: 999 } as StateCell)).toBeNull()
    }
  })
})

describe("gap", () => {
  it("is unknown when either side is missing", () => {
    expect(gap(null, 10).kind).toBe("unknown")
    expect(gap(10, null).kind).toBe("unknown")
  })

  it("is unknown when either side is negative, because a ratio across a sign is not a gap", () => {
    expect(gap(-100, 200).kind).toBe("unknown")
    expect(gap(100, -200).kind).toBe("unknown")
  })

  it("calls a 0-vs-something row 'only you' rather than dividing by zero", () => {
    expect(gap(0, 26)).toEqual({ kind: "only-you", magnitude: null, direction: "ahead", qualifier: null })
  })

  it("calls 0 vs 0 even", () => {
    expect(gap(0, 0).kind).toBe("even")
  })

  it("calls anything inside 10% even", () => {
    expect(gap(12.5, 11.8).kind).toBe("even")
    expect(gap(100, 110).kind).toBe("even")
    expect(gap(100, 91).kind).toBe("even")
  })

  it("treats exactly 10% as still even, and just past it as a percent", () => {
    expect(gap(100, 110).kind).toBe("even")
    expect(gap(100, 111).kind).toBe("percent")
  })

  it("renders a lead under 2x as a percent", () => {
    const g = gap(12, 20)
    expect(g.kind).toBe("percent")
    expect(g.direction).toBe("ahead")
    expect(g.magnitude).toBeCloseTo(0.667, 3)
  })

  it("renders a deficit under 2x as a percent", () => {
    const g = gap(7000, 4100)
    expect(g.kind).toBe("percent")
    expect(g.direction).toBe("behind")
    expect(g.magnitude).toBeCloseTo(0.414, 3)
  })

  it("switches to a multiple at exactly 2x, in both directions", () => {
    expect(gap(10, 20)).toMatchObject({ kind: "multiple", direction: "ahead", magnitude: 2 })
    expect(gap(20, 10)).toMatchObject({ kind: "multiple", direction: "behind", magnitude: 2 })
  })

  it("reports the multiple as the larger side over the smaller, never a fraction", () => {
    const g = gap(24097, 3750)
    expect(g.kind).toBe("multiple")
    expect(g.direction).toBe("behind")
    expect(g.magnitude).toBeCloseTo(6.43, 2)
  })

  it("inverts direction on a lower-is-better row and carries its qualifier", () => {
    const g = gap(2, 1, { lowerIsBetter: true, qualifier: "more often" })
    expect(g).toMatchObject({ kind: "multiple", direction: "ahead", qualifier: "more often" })
    expect(g.magnitude).toBe(2)
  })

  it("inverts the other way too: posting less often than them is behind", () => {
    expect(gap(1, 2, { lowerIsBetter: true })).toMatchObject({ kind: "multiple", direction: "behind" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/compare.test.ts`
Expected: FAIL — "gap is not exported" / "okValue is not exported"

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `web/lib/compare.ts`:

```ts
// Pure helpers for /compare. No fs, no react.
import type { StateCell, VideoRow } from "./types"

/** The value only when the cell earned one. Every non-ok state, `bounded`
 *  included, is missing data: a gap computed across it would invent a number. */
export function okValue(cell: StateCell | undefined): number | null {
  return cell && cell.state === "ok" ? cell.value : null
}

export type GapKind = "even" | "percent" | "multiple" | "only-you" | "unknown"

export interface GapValue {
  kind: GapKind
  /** a fraction for "percent" (0.414 = 41%), the multiple for "multiple", else null */
  magnitude: number | null
  direction: "ahead" | "behind" | null
  /** suffix for a lower-is-better row, e.g. "more often" */
  qualifier: string | null
}

/** Anything inside this band of parity is not worth reporting as a difference. */
const EVEN_BAND = 0.1
/** At or above this, a percent stops being readable and becomes a multiple. */
const MULTIPLE_AT = 2

export function gap(
  them: number | null,
  you: number | null,
  opts: { lowerIsBetter?: boolean; qualifier?: string } = {},
): GapValue {
  const qualifier = opts.qualifier ?? null
  const unknown: GapValue = { kind: "unknown", magnitude: null, direction: null, qualifier: null }

  if (them === null || you === null) return unknown
  // A ratio across a sign change describes nothing. No channel in the current
  // build has a negative delta, but losing subscribers is a real thing.
  if (them < 0 || you < 0) return unknown

  if (them === 0 && you === 0) return { kind: "even", magnitude: null, direction: null, qualifier }
  if (them === 0) return { kind: "only-you", magnitude: null, direction: "ahead", qualifier: null }
  if (you === 0) return { kind: "only-you", magnitude: null, direction: "behind", qualifier: null }

  const ratio = you / them
  const ahead = opts.lowerIsBetter ? ratio < 1 : ratio > 1
  // Always report the bigger side over the smaller, so the number is never a fraction.
  const magnitude = ratio >= 1 ? ratio : 1 / ratio

  if (magnitude <= 1 + EVEN_BAND) {
    return { kind: "even", magnitude: null, direction: null, qualifier }
  }
  const direction = ahead ? "ahead" : "behind"
  if (magnitude >= MULTIPLE_AT) {
    return { kind: "multiple", magnitude, direction, qualifier }
  }
  // Corrected during execution: `magnitude - 1` is wrong on the behind side.
  // For 7000 vs 4100 it yields 0.707 where the spec's own example says 41%.
  // The percent is how far you are above them, or below them — not symmetric.
  return { kind: "percent", magnitude: ahead ? ratio - 1 : 1 - ratio, direction, qualifier }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/compare.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Verify nothing else imported the deleted helpers**

Run: `cd web && grep -rn "coverageByTopic\|comparePartition" app components lib`
Expected: only `app/compare/page.tsx` (fixed in Task 5). If anything else appears, stop and report it.

- [ ] **Step 6: Commit**

```bash
rtk git add web/lib/compare.ts web/lib/compare.test.ts
rtk git commit -m "feat(web): relative gap value, replacing the topic-coverage helpers"
```

---

### Task 3: Window and format stats over videos

**Files:**
- Modify: `web/lib/compare.ts` (append)
- Modify: `web/lib/compare.test.ts` (append)

**Interfaces:**
- Consumes: `VideoRow` from `@/lib/types`, `WindowKey` from `@/lib/types`
- Produces:
  - `type VideoFormat = "all" | "long" | "short"`
  - `windowDays(w: WindowKey): number`
  - `videosInWindow(videos: VideoRow[], w: WindowKey, now: Date): VideoRow[]`
  - `splitByFormat(videos: VideoRow[], format: VideoFormat): VideoRow[]`
  - `interface OutputStats { videos: number; long: number; short: number; medianViews: number | null }`
  - `outputStats(videos: VideoRow[]): OutputStats`

- [ ] **Step 1: Write the failing test**

Append to `web/lib/compare.test.ts`:

```ts
import { outputStats, splitByFormat, videosInWindow, windowDays } from "./compare"
import type { VideoRow } from "./types"

function vid(over: Partial<VideoRow>): VideoRow {
  return {
    channel_id: "UC1",
    video_id: "v",
    title: "t",
    published_at: "2026-07-01T00:00:00Z",
    view_count: 100,
    duration_s: 600,
    type: "long",
    topic_assignments: [],
    comment_stats: { classified: 0, root_count: 0, top_comment_likes: 0 },
    multiplier: { value: null, baseline: null, baseline_n: 0, source: "computed", state: "ok" },
    traction: { share_recent_7d: null, still_growing: null, views_gained: {} },
    ...over,
  } as VideoRow
}

const NOW = new Date("2026-07-30T00:00:00Z")

describe("windowDays", () => {
  it("reads the number off the key", () => {
    expect(windowDays("7d")).toBe(7)
    expect(windowDays("365d")).toBe(365)
  })
})

describe("videosInWindow", () => {
  it("keeps a video published exactly on the boundary", () => {
    const v = vid({ published_at: "2026-07-23T00:00:00Z" })
    expect(videosInWindow([v], "7d", NOW)).toHaveLength(1)
  })

  it("drops a video published one second before the boundary", () => {
    const v = vid({ published_at: "2026-07-22T23:59:59Z" })
    expect(videosInWindow([v], "7d", NOW)).toHaveLength(0)
  })

  it("returns an empty array rather than throwing on an empty corpus", () => {
    expect(videosInWindow([], "30d", NOW)).toEqual([])
  })
})

describe("splitByFormat", () => {
  const set = [vid({ type: "long" }), vid({ type: "short" }), vid({ type: "short" })]

  it("passes everything through on all", () => {
    expect(splitByFormat(set, "all")).toHaveLength(3)
  })

  it("filters to one format", () => {
    expect(splitByFormat(set, "long")).toHaveLength(1)
    expect(splitByFormat(set, "short")).toHaveLength(2)
  })
})

describe("outputStats", () => {
  it("counts the mix", () => {
    const s = outputStats([vid({ type: "long" }), vid({ type: "short" }), vid({ type: "short" })])
    expect(s).toMatchObject({ videos: 3, long: 1, short: 2 })
  })

  it("takes the middle value of an odd set", () => {
    const s = outputStats([vid({ view_count: 10 }), vid({ view_count: 30 }), vid({ view_count: 20 })])
    expect(s.medianViews).toBe(20)
  })

  it("averages the middle pair of an even set", () => {
    const s = outputStats([vid({ view_count: 10 }), vid({ view_count: 30 })])
    expect(s.medianViews).toBe(20)
  })

  it("handles a single video", () => {
    expect(outputStats([vid({ view_count: 42 })]).medianViews).toBe(42)
  })

  it("reports no median for an empty set rather than zero", () => {
    expect(outputStats([])).toEqual({ videos: 0, long: 0, short: 0, medianViews: null })
  })

  it("skips a null view_count instead of counting it as zero", () => {
    const s = outputStats([vid({ view_count: null }), vid({ view_count: 50 })])
    expect(s.videos).toBe(2)
    expect(s.medianViews).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/compare.test.ts`
Expected: FAIL — "windowDays is not exported"

- [ ] **Step 3: Write minimal implementation**

Append to `web/lib/compare.ts`:

```ts
export type VideoFormat = "all" | "long" | "short"

const DAY_MS = 86_400_000

export function windowDays(w: WindowKey): number {
  return Number(w.replace("d", ""))
}

/** Videos published inside the window. Note what this is not: it is not views
 *  earned inside the window. Per-video views_gained is `building` on every row
 *  in the corpus, so lifetime view counts are all that exist. */
export function videosInWindow(videos: VideoRow[], w: WindowKey, now: Date): VideoRow[] {
  const cutoff = now.getTime() - windowDays(w) * DAY_MS
  return videos.filter((v) => Date.parse(v.published_at) >= cutoff)
}

export function splitByFormat(videos: VideoRow[], format: VideoFormat): VideoRow[] {
  return format === "all" ? videos : videos.filter((v) => v.type === format)
}

export interface OutputStats {
  videos: number
  long: number
  short: number
  /** null when nothing in the set carried a view count; never 0 for "unknown" */
  medianViews: number | null
}

export function outputStats(videos: VideoRow[]): OutputStats {
  const views = videos
    .map((v) => v.view_count)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)
  const mid = Math.floor(views.length / 2)
  const medianViews = views.length === 0
    ? null
    : views.length % 2 === 1
      ? views[mid]
      : (views[mid - 1] + views[mid]) / 2
  return {
    videos: videos.length,
    long: videos.filter((v) => v.type === "long").length,
    short: videos.filter((v) => v.type === "short").length,
    medianViews,
  }
}
```

Add `WindowKey` to the existing type import at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/compare.test.ts`
Expected: PASS, 14 + 12 = 26 tests

- [ ] **Step 5: Commit**

```bash
rtk git add web/lib/compare.ts web/lib/compare.test.ts
rtk git commit -m "feat(web): window and format stats over the video corpus"
```

---

### Task 4: The gap cell component

**Files:**
- Create: `web/components/gap-cell.tsx`
- Create: `web/components/gap-cell.test.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `GapValue` from `@/lib/compare`
- Produces: `<GapCell value={GapValue} />`

- [ ] **Step 1: Write the failing test**

Create `web/components/gap-cell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GapCell } from "./gap-cell"

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/gap-cell.test.tsx`
Expected: FAIL — cannot resolve `./gap-cell`

- [ ] **Step 3: Write minimal implementation**

Create `web/components/gap-cell.tsx`:

```tsx
import type { GapValue } from "@/lib/compare"

/** The gap column, always relative. Signed numbers belong in the two channel
 *  columns, where the sign is the meaning; here it would be redundant with the
 *  glyph and the colour. The glyph is what keeps the cell readable without
 *  hue, so it is never dropped for being decorative. */
export function GapCell({ value }: { value: GapValue }) {
  if (value.kind === "unknown") return <span className="muted">--</span>

  const glyph = value.direction === "ahead" ? "▲" : value.direction === "behind" ? "▼" : ""
  const cls =
    value.direction === "ahead" ? "gap-ahead" : value.direction === "behind" ? "gap-behind" : "gap-even"

  const body =
    value.kind === "even" ? "≈ even"
      : value.kind === "only-you" ? "you only"
        : value.kind === "multiple" ? `${(value.magnitude ?? 0).toFixed(1).replace(/\.0$/, "")}×`
          : `${Math.round((value.magnitude ?? 0) * 100)}%`

  const strong = value.kind === "multiple" && (value.magnitude ?? 0) >= 3

  return (
    <span className={cls} style={strong ? { fontWeight: 600 } : undefined}>
      {glyph && <span aria-hidden="true">{glyph} </span>}
      {body}
      {value.qualifier ? ` ${value.qualifier}` : ""}
    </span>
  )
}
```

- [ ] **Step 4: Add the colour classes**

Append to `web/app/globals.css`, next to the existing `.gain` rule:

```css
/* The gap column's three states. Hue is never the only signal: GapCell also
   renders a ▲/▼ glyph, so the cell survives a colourblind reader. */
.gap-ahead { color: var(--v-make); }
.gap-behind { color: var(--v-crowded); }
.gap-even { color: var(--muted-foreground); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run components/gap-cell.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
rtk git add web/components/gap-cell.tsx web/components/gap-cell.test.tsx web/app/globals.css
rtk git commit -m "feat(web): gap cell with direction glyph and three-state colour"
```

---

### Task 5: The compare table

**Files:**
- Create: `web/components/compare-table.tsx`
- Modify: `web/app/compare/page.tsx` (replace the body; it becomes a server shell)

**Interfaces:**
- Consumes: `gap`, `okValue`, `videosInWindow`, `splitByFormat`, `outputStats`, `VideoFormat` from `@/lib/compare`; `parseWindow` from `@/lib/window`; `GapCell` from `@/components/gap-cell`; `WindowTabs` from `@/components/window-tabs`
- Produces: `<CompareTable them={CompareSide} you={CompareSide} initialWindow={WindowKey} />` where

```ts
export interface CompareSide {
  channel_id: string
  name: string
  is_self: boolean
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  subscriber_delta: Record<string, StateCell>
  subscriber_growth_rate: Record<string, StateCell>
  view_delta: Record<string, StateCell>
  subs_per_1k_views: Record<string, StateCell>
  /** every registered video for this channel, already sliced server-side */
  videos: VideoRow[]
}
```

- [ ] **Step 1: Delete the topic table from the page**

In `web/app/compare/page.tsx`, remove:
- the `comparePartition` / `coverageByTopic` imports and the `gaps` computation
- the entire `what {him.name} covers that ...` section-kicker and its `<div className="card tblwrap">` table
- the `loadOpportunities` import and `opps` variable
- the `VerdictBadge` import if now unused

- [ ] **Step 2: Write the client table**

Create `web/components/compare-table.tsx`. Rows are declared as data so the renderer has no per-row special cases:

```tsx
"use client"

import { useState } from "react"
import {
  gap, okValue, outputStats, splitByFormat, videosInWindow,
  type GapValue, type VideoFormat,
} from "@/lib/compare"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, deltaText, fmtInt, pctText } from "@/lib/trust"
import type { StateCell, VideoRow, WindowKey } from "@/lib/types"
import { Chip, Derived } from "./trust"
import { GapCell } from "./gap-cell"
import { WindowTabs } from "./window-tabs"

export interface CompareSide {
  channel_id: string
  name: string
  is_self: boolean
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  subscriber_delta: Record<string, StateCell>
  subscriber_growth_rate: Record<string, StateCell>
  view_delta: Record<string, StateCell>
  subs_per_1k_views: Record<string, StateCell>
  videos: VideoRow[]
}

const FORMATS: { key: VideoFormat; label: string }[] = [
  { key: "all", label: "all" },
  { key: "long", label: "long" },
  { key: "short", label: "shorts" },
]

interface Row {
  label: React.ReactNode
  them: React.ReactNode
  you: React.ReactNode
  gap: GapValue
}

export function CompareTable({
  them, you, initialWindow,
}: { them: CompareSide; you: CompareSide; initialWindow: WindowKey }) {
  const [win, setWin] = useState<WindowKey>(initialWindow)
  const [format, setFormat] = useState<VideoFormat>("all")

  const now = new Date()
  const outputOf = (side: CompareSide) => {
    const inWindow = videosInWindow(side.videos, win, now)
    const filtered = splitByFormat(inWindow, format)
    return {
      stats: outputStats(filtered),
      mix: outputStats(inWindow),
      cadence: cadenceDays(filtered.map((v) => v.published_at)),
    }
  }
  const t = outputOf(them)
  const y = outputOf(you)

  const audience: Row[] = [
    {
      label: "subscribers",
      them: <>{them.subscriber_count === null ? "--" : fmtInt(them.subscriber_count)}{" "}
        <Chip>{bucketText(them.subscriber_bucket)}</Chip></>,
      you: <>{you.subscriber_count === null ? "--" : fmtInt(you.subscriber_count)}{" "}
        <Chip>{bucketText(you.subscriber_bucket)}</Chip></>,
      gap: gap(them.subscriber_count, you.subscriber_count),
    },
    {
      label: <Derived formula="last snapshot minus first snapshot in window">Δ subs</Derived>,
      them: deltaText(them.subscriber_delta[win]),
      you: deltaText(you.subscriber_delta[win]),
      gap: gap(okValue(them.subscriber_delta[win]), okValue(you.subscriber_delta[win])),
    },
    {
      label: <Derived formula="Δ subs divided by subs at window start">growth rate</Derived>,
      them: pctText(them.subscriber_growth_rate[win]),
      you: pctText(you.subscriber_growth_rate[win]),
      gap: gap(okValue(them.subscriber_growth_rate[win]), okValue(you.subscriber_growth_rate[win])),
    },
  ]

  const reach: Row[] = [
    {
      label: "views",
      them: them.view_count === null ? "--" : fmtInt(them.view_count),
      you: you.view_count === null ? "--" : fmtInt(you.view_count),
      gap: gap(them.view_count, you.view_count),
    },
    {
      label: <Derived formula="exact viewCount delta over window">Δ views</Derived>,
      them: deltaText(them.view_delta[win]),
      you: deltaText(you.view_delta[win]),
      gap: gap(okValue(them.view_delta[win]), okValue(you.view_delta[win])),
    },
    {
      label: <Derived formula="Δ subs divided by Δ views, times 1000">subs / 1k views</Derived>,
      them: fmtCell(them.subs_per_1k_views[win]),
      you: fmtCell(you.subs_per_1k_views[win]),
      gap: gap(okValue(them.subs_per_1k_views[win]), okValue(you.subs_per_1k_views[win])),
    },
  ]

  const output: Row[] = [
    {
      label: <Derived formula="videos published inside the window; their views are lifetime totals, not views earned in the window">videos published</Derived>,
      them: t.stats.videos,
      you: y.stats.videos,
      gap: gap(t.stats.videos, y.stats.videos),
    },
    ...(format === "all" ? [{
      label: "mix",
      them: `${t.mix.long}L · ${t.mix.short}S`,
      you: `${y.mix.long}L · ${y.mix.short}S`,
      gap: { kind: "unknown", magnitude: null, direction: null, qualifier: null } as GapValue,
    }] : []),
    {
      label: <Derived formula="median of exact lifetime viewCounts, videos published in window">median views</Derived>,
      them: t.stats.medianViews === null ? "--" : fmtInt(t.stats.medianViews),
      you: y.stats.medianViews === null ? "--" : fmtInt(y.stats.medianViews),
      gap: gap(t.stats.medianViews, y.stats.medianViews),
    },
    {
      label: <Derived formula={CADENCE_FORMULA}>cadence</Derived>,
      them: t.cadence === null ? "--" : `${t.cadence}d`,
      you: y.cadence === null ? "--" : `${y.cadence}d`,
      gap: gap(t.cadence, y.cadence, { lowerIsBetter: true, qualifier: "more often" }),
    },
  ]

  return (
    <>
      <div className="section-kicker" style={{ gap: 12 }}>
        <WindowTabs value={win} onChange={setWin} />
      </div>
      <div className="card tblwrap">
        <table className="tbl tbl-hover" style={{ fontSize: 12 }}>
          <thead><tr><th></th>
            <th className="r">{them.name}</th>
            <th className="r">{you.name}{you.is_self ? " ★" : ""}</th>
            <th className="r">gap</th></tr></thead>
          <tbody>
            <Group title="audience" rows={audience} />
            <Group title="reach" rows={reach} />
            <tr><td colSpan={4} className="sub mono10">
              output
              <span className="tabs" role="group" aria-label="format" style={{ marginLeft: 12 }}>
                {FORMATS.map((f) => (
                  <button key={f.key} type="button" className={f.key === format ? "on" : undefined}
                    aria-pressed={f.key === format} onClick={() => setFormat(f.key)}>{f.label}</button>
                ))}
              </span>
            </td></tr>
            {output.map((r, i) => <RowCells key={i} row={r} />)}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <tr><td colSpan={4} className="sub mono10">{title}</td></tr>
      {rows.map((r, i) => <RowCells key={i} row={r} />)}
    </>
  )
}

function RowCells({ row }: { row: Row }) {
  return (
    <tr>
      <td>{row.label}</td>
      <td className="r num">{row.them}</td>
      <td className="r num">{row.you}</td>
      <td className="r num"><GapCell value={row.gap} /></td>
    </tr>
  )
}

function fmtCell(cell: StateCell | undefined): string {
  const v = okValue(cell)
  return v === null ? "--" : v.toFixed(1)
}
```

- [ ] **Step 3: Wire the server shell**

In `web/app/compare/page.tsx`, widen `searchParams` to `{ a?: string; b?: string; w?: string }`, build a `CompareSide` for each channel by spreading the `ChannelRow` and adding `videos: channelVideos(id)`, then render `<CompareTable them={...} you={...} initialWindow={parseWindow(w)} />` below the existing picker row and the bucket-width callout. Keep the callout exactly as it is.

- [ ] **Step 4: Run the whole suite**

Run: `cd web && npx vitest run`
Expected: PASS. `lib/compare.test.ts` no longer references the deleted helpers.

- [ ] **Step 5: Check it renders**

Run: `cd web && npm run dev` then open `http://localhost:3002/compare?w=30d`
Expected: three groups, a gap column, no topic table. Switching the window changes every row; switching format changes only the Output rows and hides `mix`.

- [ ] **Step 6: Commit**

```bash
rtk git add web/components/compare-table.tsx web/app/compare/page.tsx
rtk git commit -m "feat(web): /compare becomes a stats comparison"
```

---

### Task 6: Row expansion on compare

**Files:**
- Modify: `web/components/compare-table.tsx`

**Interfaces:**
- Consumes: `StateCell.from` / `StateCell.to`, already on the bundle
- Produces: nothing new for other tasks

- [ ] **Step 1: Add an optional detail to the Row type**

Extend `interface Row` with `detail?: React.ReactNode`, and give the three windowed rows in `audience` and `reach` a detail built from their cell's `from`/`to`:

```tsx
function windowDates(a: StateCell | undefined, b: StateCell | undefined): React.ReactNode {
  const span = (c: StateCell | undefined) =>
    c?.from && c?.to ? `${c.from} → ${c.to}` : "no resolved dates"
  return <span className="mono10">them {span(a)} · you {span(b)}</span>
}
```

- [ ] **Step 2: Make RowCells expandable**

Give `RowCells` a `useState(false)`; when `row.detail` exists, render the label as a `.linklike` button that toggles, and emit a second `<tr>` with `colSpan={4}` holding the detail when open.

- [ ] **Step 3: Verify by hand**

Run: `cd web && npm run dev`, open `/compare`, click `Δ subs`.
Expected: a row appears underneath showing both channels' resolved `from → to` dates. Clicking again collapses it.

- [ ] **Step 4: Commit**

```bash
rtk git add web/components/compare-table.tsx
rtk git commit -m "feat(web): expandable compare rows showing each window's resolved dates"
```

---

### Task 7: Two-channel selection on the leaderboard

**Files:**
- Create: `web/components/compare-bar.tsx`
- Modify: `web/components/leaderboard-table.tsx`
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `withWindow` from `@/lib/window`
- Produces: `<CompareBar picked={string[]} channels={SlimChannel[]} selfId={string} win={WindowKey} onClear={() => void} />`

- [ ] **Step 1: Write the failing test**

Create `web/components/compare-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { compareHref } from "./compare-bar"

describe("compareHref", () => {
  it("puts the picked pair on the query in order", () => {
    expect(compareHref(["UC1", "UC2"], "SELF", "30d")).toBe("/compare?a=UC1&b=UC2&w=30d")
  })

  it("assumes you as the second side when only one is picked", () => {
    expect(compareHref(["UC1"], "SELF", "30d")).toBe("/compare?a=UC1&b=SELF&w=30d")
  })

  it("returns null with nothing picked, so the bar never renders a dead link", () => {
    expect(compareHref([], "SELF", "30d")).toBeNull()
  })

  it("does not pair you with yourself", () => {
    expect(compareHref(["SELF"], "SELF", "30d")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/compare-bar.test.tsx`
Expected: FAIL — cannot resolve `./compare-bar`

- [ ] **Step 3: Write minimal implementation**

Create `web/components/compare-bar.tsx` exporting both `compareHref` and the `CompareBar` component:

```tsx
"use client"

import Link from "next/link"
import type { WindowKey } from "@/lib/types"
import { withWindow } from "@/lib/window"

/** null means there is nothing to compare yet, so the bar stays hidden rather
 *  than rendering a link that goes nowhere. */
export function compareHref(picked: string[], selfId: string, w: WindowKey): string | null {
  if (picked.length === 0) return null
  const [a, b] = picked.length >= 2 ? picked : [picked[0], selfId]
  if (a === b) return null
  return withWindow(`/compare?a=${a}&b=${b}`, w)
}
```

Then the bar itself: a fixed-position `.card pad` strip showing each picked channel's avatar and name, a `compare →` `<Link>` to `compareHref`, and a clear button. Render nothing when `compareHref` returns null.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run components/compare-bar.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Add selection to the leaderboard**

In `leaderboard-table.tsx`:
- add `const [picked, setPicked] = useState<string[]>([])`
- add a leading `<th>` with an empty label and a `<td>` per row holding a checkbox bound to `picked.includes(c.channel_id)`
- the toggle appends, and when already at two, **drops the oldest**: `setPicked((p) => p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2))`
- render `<CompareBar picked={picked} ... onClear={() => setPicked([])} />` after the table
- take `selfId` as a new prop and pass it through from `app/page.tsx` via `loadChannels().self_channel_id`

- [ ] **Step 6: Verify by hand**

Run: `cd web && npm run dev`, open `http://localhost:3002/`
Expected: ticking one row shows a bar offering that channel vs you; ticking a second swaps the second side; ticking a third drops the oldest.

- [ ] **Step 7: Commit**

```bash
rtk git add web/components/compare-bar.tsx web/components/compare-bar.test.tsx web/components/leaderboard-table.tsx web/app/page.tsx
rtk git commit -m "feat(web): pick two channels on the leaderboard to compare"
```

---

### Task 8: The channels directory

**Files:**
- Create: `web/lib/directory.ts`
- Create: `web/lib/directory.test.ts`
- Create: `web/components/channel-directory.tsx`
- Delete: `web/components/channels-table.tsx`
- Modify: `web/app/channels/page.tsx`

**Interfaces:**
- Consumes: `SlimChannel` from `@/lib/growth`
- Produces: `filterDirectory(channels: SlimChannel[], q: string, cat: string): SlimChannel[]`

- [ ] **Step 1: Write the failing test**

Create `web/lib/directory.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { filterDirectory } from "./directory"

const rows = [
  { channel_id: "UC1", name: "Pat Simmons", handle: "per_simmons", category: "ai-creator", is_self: false },
  { channel_id: "UC2", name: "Eric Tech", handle: "erictech", category: "own", is_self: true },
  { channel_id: "UC3", name: "Anthropic", handle: "anthropic", category: "company", is_self: false },
] as never[]

describe("filterDirectory", () => {
  it("returns everything with an empty query and the all category", () => {
    expect(filterDirectory(rows, "", "all")).toHaveLength(3)
  })

  it("matches on name, case-insensitively", () => {
    expect(filterDirectory(rows, "pat", "all")).toHaveLength(1)
  })

  it("matches on handle too, so @-typing works", () => {
    expect(filterDirectory(rows, "erictech", "all")).toHaveLength(1)
  })

  it("ignores a leading @ in the query", () => {
    expect(filterDirectory(rows, "@anthropic", "all")).toHaveLength(1)
  })

  it("filters by category", () => {
    expect(filterDirectory(rows, "", "company")).toHaveLength(1)
  })

  it("treats the you category as the self flag, not a category value", () => {
    const out = filterDirectory(rows, "", "you")
    expect(out).toHaveLength(1)
    expect(out[0].channel_id).toBe("UC2")
  })

  it("returns an empty array when nothing matches, never the unfiltered set", () => {
    expect(filterDirectory(rows, "zzzz", "all")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/directory.test.ts`
Expected: FAIL — cannot resolve `./directory`

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/directory.ts`:

```ts
import type { SlimChannel } from "./growth"

/** The directory's two filters. `you` is the self flag rather than a category
 *  value, because a channel's category says what kind of channel it is and
 *  "mine" is not that. */
export function filterDirectory(channels: SlimChannel[], q: string, cat: string): SlimChannel[] {
  const needle = q.trim().replace(/^@/, "").toLowerCase()
  return channels.filter((c) => {
    if (cat === "you" && !c.is_self) return false
    if (cat !== "all" && cat !== "you" && c.category !== cat) return false
    if (!needle) return true
    return c.name.toLowerCase().includes(needle) || c.handle.toLowerCase().includes(needle)
  })
}
```

`SlimChannel` already carries `handle`, `category`, `is_self`, and `status`. It does **not** carry
`lang`, which the directory row shows. Add `"lang"` to the `Pick<ChannelRow, ...>` union in
`lib/growth.ts` and to the object `slimChannel` returns — one line each.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/directory.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Build the directory component**

Create `web/components/channel-directory.tsx`: a `"use client"` component with a search `<input>`, a `.tabs` group of category buttons (`all`, `ai-creator`, `company`, `adjacent`, `you`), and one row per channel showing avatar, name, `@handle`, `subs · videos · lang`, and either a `compare →` link or the `you` chip. An `absent` channel renders `absent since <date>` and its last-seen figures instead of current ones.

Delete `web/components/channels-table.tsx` and point `app/channels/page.tsx` at the new component.

- [ ] **Step 6: Verify nothing still imports the deleted table**

Run: `cd web && grep -rn "channels-table\|ChannelsTable" app components lib`
Expected: no matches.

- [ ] **Step 7: Run the suite and check the page**

Run: `cd web && npx vitest run && npm run dev`, open `http://localhost:3002/channels`
Expected: search narrows as you type, category buttons filter, every row links to its channel page.

- [ ] **Step 8: Commit**

```bash
rtk git add web/lib/directory.ts web/lib/directory.test.ts web/components/channel-directory.tsx web/app/channels/page.tsx
rtk git rm web/components/channels-table.tsx
rtk git commit -m "feat(web): /channels becomes a directory"
```

---

### Task 9: Grouping the feed by topic

**Files:**
- Create: `web/lib/topic-groups.ts`
- Create: `web/lib/topic-groups.test.ts`

**Interfaces:**
- Consumes: `RecentRow` from `@/lib/types`
- Produces:

```ts
export interface TopicGroup {
  topic_id: string | null   // null is the untopiced group
  videos: RecentRow[]
  creators: number
  views: number
  avgBreakout: number | null
}
export function groupFeedByTopic(
  rows: RecentRow[],
  topicsOf: (videoId: string) => string[],
): TopicGroup[]
```

- [ ] **Step 1: Write the failing test**

Create `web/lib/topic-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { groupFeedByTopic } from "./topic-groups"
import type { RecentRow } from "./types"

function row(over: Partial<RecentRow>): RecentRow {
  return {
    video_id: "v", title: "t", published_at: "2026-07-28T00:00:00Z",
    view_count: 100, duration_s: 60, type: "short",
    channel_id: "UC1", channel_name: "One",
    breakout_score: 4, vph: null,
    momentum: { state: "steady", daily_share: null, per_day: null, vph: null },
    pattern_id: null,
    ...over,
  } as RecentRow
}

describe("groupFeedByTopic", () => {
  it("groups videos that share a topic", () => {
    const rows = [row({ video_id: "a" }), row({ video_id: "b" })]
    const out = groupFeedByTopic(rows, () => ["subagents"])
    expect(out).toHaveLength(1)
    expect(out[0].topic_id).toBe("subagents")
    expect(out[0].videos).toHaveLength(2)
  })

  it("puts a video with two topics in both groups, because it is in both", () => {
    const out = groupFeedByTopic([row({ video_id: "a" })], () => ["x", "y"])
    expect(out.map((g) => g.topic_id).sort()).toEqual(["x", "y"])
  })

  it("gives untopiced videos their own group keyed null, never dropping them", () => {
    const out = groupFeedByTopic([row({ video_id: "a" })], () => [])
    expect(out).toHaveLength(1)
    expect(out[0].topic_id).toBeNull()
  })

  it("sorts groups by summed views, biggest first", () => {
    const rows = [
      row({ video_id: "a", view_count: 10 }),
      row({ video_id: "b", view_count: 900 }),
    ]
    const out = groupFeedByTopic(rows, (id) => (id === "a" ? ["small"] : ["big"]))
    expect(out.map((g) => g.topic_id)).toEqual(["big", "small"])
  })

  it("keeps the untopiced group last however big it is", () => {
    const rows = [
      row({ video_id: "a", view_count: 10 }),
      row({ video_id: "b", view_count: 90_000 }),
    ]
    const out = groupFeedByTopic(rows, (id) => (id === "a" ? ["small"] : []))
    expect(out[out.length - 1].topic_id).toBeNull()
  })

  it("counts distinct creators, not videos", () => {
    const rows = [
      row({ video_id: "a", channel_id: "UC1" }),
      row({ video_id: "b", channel_id: "UC1" }),
      row({ video_id: "c", channel_id: "UC2" }),
    ]
    const out = groupFeedByTopic(rows, () => ["t"])
    expect(out[0].creators).toBe(2)
  })

  it("averages only the scores vidIQ returned, and reports null when it returned none", () => {
    const rows = [row({ video_id: "a", breakout_score: 6 }), row({ video_id: "b", breakout_score: null })]
    expect(groupFeedByTopic(rows, () => ["t"])[0].avgBreakout).toBe(6)
    expect(groupFeedByTopic([row({ breakout_score: null })], () => ["t"])[0].avgBreakout).toBeNull()
  })

  it("returns an empty array for an empty feed", () => {
    expect(groupFeedByTopic([], () => ["t"])).toEqual([])
  })

  it("treats a null view_count as unknown, not as zero, when summing", () => {
    const out = groupFeedByTopic([row({ view_count: null })], () => ["t"])
    expect(out[0].views).toBe(0)
    expect(out[0].videos).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/topic-groups.test.ts`
Expected: FAIL — cannot resolve `./topic-groups`

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/topic-groups.ts`:

```ts
import type { RecentRow } from "./types"

export interface TopicGroup {
  /** null is the untopiced group: 46 of the 153 feed videos carry no
   *  assignment, and dropping them would hide 30% of what broke out. */
  topic_id: string | null
  videos: RecentRow[]
  creators: number
  views: number
  /** mean of the vidIQ scores that exist. vidIQ's individual numbers are never
   *  recomputed; averaging them is our arithmetic, so callers label it Derived. */
  avgBreakout: number | null
}

export function groupFeedByTopic(
  rows: RecentRow[],
  topicsOf: (videoId: string) => string[],
): TopicGroup[] {
  const buckets = new Map<string | null, RecentRow[]>()
  for (const r of rows) {
    const topics = topicsOf(r.video_id)
    const keys: (string | null)[] = topics.length > 0 ? topics : [null]
    for (const k of keys) {
      const list = buckets.get(k) ?? []
      list.push(r)
      buckets.set(k, list)
    }
  }

  const groups: TopicGroup[] = [...buckets.entries()].map(([topic_id, videos]) => {
    const scored = videos.map((v) => v.breakout_score).filter((n): n is number => n !== null)
    return {
      topic_id,
      videos,
      creators: new Set(videos.map((v) => v.channel_id)).size,
      views: videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0),
      avgBreakout: scored.length === 0 ? null : scored.reduce((a, b) => a + b, 0) / scored.length,
    }
  })

  // Biggest topic first, with the untopiced group pinned last: it is a state,
  // not a topic, and floating it to the top on volume would read as one.
  return groups.sort((a, b) => {
    if (a.topic_id === null) return 1
    if (b.topic_id === null) return -1
    return b.views - a.views
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/topic-groups.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
rtk git add web/lib/topic-groups.ts web/lib/topic-groups.test.ts
rtk git commit -m "feat(web): group the recent feed by topic"
```

---

### Task 10: Rendering the grouped feed

**Files:**
- Modify: `web/components/recent-feed.tsx`
- Modify: `web/app/topics/page.tsx`

**Interfaces:**
- Consumes: `groupFeedByTopic`, `TopicGroup` from `@/lib/topic-groups`

- [ ] **Step 1: Build the topic lookup server-side**

In `app/topics/page.tsx`, build a plain map from the videos bundle and pass it across the RSC boundary — only for video ids the feed actually contains, matching how `avatars` is already narrowed:

```tsx
const feedIds = new Set(recent.videos.map((v) => v.video_id))
const topicsByVideo = Object.fromEntries(
  videosById([...feedIds]).map((v) => [
    v.video_id,
    (v.topic_assignments as { topic_id: string }[]).map((a) => a.topic_id),
  ])
)
```

Also pass `ownCoverage`: a `Record<string, number>` of topic id to how many of the self channel's videos carry that topic, computed from `channelVideos(meta.self_channel_id)`.

- [ ] **Step 2: Group inside the feed component**

In `recent-feed.tsx`, keep the existing window/format/cap controls untouched, then group the already-selected rows:

```tsx
const groups = useMemo(
  () => groupFeedByTopic(selection.ranked, (id) => topicsByVideo[id] ?? []),
  [selection.ranked, topicsByVideo]
)
```

Render a header per group — `topic_id`, `N videos · M creators`, a `<Derived formula="mean of the vidIQ breakout scores in this group">avg breakout</Derived>`, and `you: {ownCoverage[topic_id] ?? 0} videos` — with the existing video rows nested underneath unchanged.

The untopiced group renders the header `{n} videos have no topic assigned` plus the sentence naming how many of the feed do carry one. Own-coverage does not appear on it, because there is no topic to have covered.

- [ ] **Step 3: Hide the patterns section when it is empty**

Replace the unconditional `<PatternRows patterns={bundle.patterns} ... />` with a guard:

```tsx
{bundle.patterns.length > 0 && <PatternRows patterns={bundle.patterns} ... />}
```

- [ ] **Step 4: Verify by hand**

Run: `cd web && npm run dev`, open `http://localhost:3002/topics`
Expected: videos sit under topic headers, the biggest topic first, an untopiced group last, and no patterns section at all.

- [ ] **Step 5: Run the suite**

Run: `cd web && npx vitest run`
Expected: PASS. `components/still-pulling.test.tsx` and the other existing component tests are unaffected.

- [ ] **Step 6: Commit**

```bash
rtk git add web/components/recent-feed.tsx web/app/topics/page.tsx
rtk git commit -m "feat(web): /topics groups by topic and drops the empty patterns section"
```

---

### Task 11: The by-window table on the channel page

**Files:**
- Create: `web/components/window-table.tsx`
- Modify: `web/app/channels/[id]/page.tsx`

**Interfaces:**
- Consumes: `ChannelRow`, `WINDOWS` from `@/lib/types`; `deltaText`, `pctText`, `stateExplain` from `@/lib/trust`
- Produces: `<WindowTable channel={ChannelRow} videos={VideoRow[]} />`

- [ ] **Step 1: Write the failing test**

Create `web/components/window-table.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { WindowTable } from "./window-table"

const cell = (state: string, value: number | null, extra = {}) => ({ state, value, ...extra })

const channel = {
  subscriber_delta: { "7d": cell("ok", 1400), "365d": cell("blocked", null, { unusable: 1, need: 365 }) },
  subscriber_growth_rate: { "7d": cell("ok", 0.069), "365d": cell("blocked", null, { unusable: 1 }) },
  view_delta: { "7d": cell("ok", 142_000), "365d": cell("blocked", null, { unusable: 1 }) },
  subs_per_1k_views: { "7d": cell("ok", 14.4), "365d": cell("blocked", null, { unusable: 1 }) },
} as never

describe("WindowTable", () => {
  it("renders one row per window", () => {
    render(<WindowTable channel={channel} videos={[]} />)
    for (const w of ["7d", "14d", "30d", "90d", "180d", "365d"]) {
      expect(screen.getByText(w)).toBeTruthy()
    }
  })

  it("shows an ok delta as a signed number", () => {
    render(<WindowTable channel={channel} videos={[]} />)
    expect(screen.getByText("+1,400")).toBeTruthy()
  })

  it("renders a blocked window as its reason, never as a zero", () => {
    render(<WindowTable channel={channel} videos={[]} />)
    expect(screen.getAllByText("1 bad day").length).toBeGreaterThan(0)
    expect(screen.queryByText("0")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/window-table.test.tsx`
Expected: FAIL — cannot resolve `./window-table`

- [ ] **Step 3: Write minimal implementation**

Create `web/components/window-table.tsx`: a plain table with `WINDOWS.map` producing one `<tr>` each, columns `window · Δsubs · growth · Δviews · subs/1k · videos`. Use `deltaText` and `pctText` so every non-ok state renders as itself, and attach `stateExplain(cell)` as the `title` where it returns a sentence. The `videos` column is `videosInWindow(videos, w, new Date()).length`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run components/window-table.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Mount it and drop the private picker**

In `app/channels/[id]/page.tsx`, render `<WindowTable channel={channel} videos={uploads} />` above `<ChannelGrowth ... />`.

In `components/channel-growth.tsx`, delete `WINDOW_CHOICES` and the `windowDays` state, take the window as a prop instead, and keep only the `subscribers | views` metric toggle. The page passes `parseWindow(w)` from its own `searchParams`.

- [ ] **Step 6: Run the suite and check the page**

Run: `cd web && npx vitest run && npm run dev`, open a channel page.
Expected: six windows in the table, the chart following the shared window, no second 30/90/365 control anywhere.

- [ ] **Step 7: Commit**

```bash
rtk git add web/components/window-table.tsx web/components/window-table.test.tsx web/app/channels/\[id\]/page.tsx web/components/channel-growth.tsx
rtk git commit -m "feat(web): by-window table and shared window on the channel page"
```

---

### Task 12: Collapse the comment table

**Files:**
- Modify: `web/app/channels/[id]/page.tsx`

- [ ] **Step 1: Wrap the comment section**

Wrap the existing `<CommentTable ... />` and its section-kicker in a `<details>` whose `<summary>` reads `comments · {n} ingested`, placed **below** `StillPulling`. Do not change `CommentTable` itself — `components/comment-table.test.tsx` covers it and must keep passing.

- [ ] **Step 2: Run the suite**

Run: `cd web && npx vitest run`
Expected: PASS, `comment-table.test.tsx` included.

- [ ] **Step 3: Verify by hand**

Run: `cd web && npm run dev`, open a channel page.
Expected: comments are collapsed, open on click, and sit last.

- [ ] **Step 4: Commit**

```bash
rtk git add web/app/channels/\[id\]/page.tsx
rtk git commit -m "refactor(web): demote the comment table below the performance blocks"
```

---

### Task 13: Carry the window across links

**Files:**
- Modify: `web/components/leaderboard-table.tsx`
- Modify: `web/components/channel-directory.tsx`
- Modify: `web/components/compare-table.tsx`
- Modify: `web/app/page.tsx`, `web/app/channels/page.tsx`

- [ ] **Step 1: Read the window from the URL on every page that shows it**

Each of `app/page.tsx`, `app/channels/page.tsx`, `app/channels/[id]/page.tsx`, and `app/compare/page.tsx` accepts `searchParams` with `w?: string`, resolves `parseWindow(w)`, and passes it as `initialWindow` to its client component. Replace the `useState<WindowKey>("90d")` initialisers with `useState<WindowKey>(initialWindow)`.

- [ ] **Step 2: Write the window back on change**

In each client component, when `WindowTabs` fires, also push the param so a reload and an onward link keep it:

```tsx
const router = useRouter()
const pathname = usePathname()
const onWindow = (w: WindowKey) => {
  setWin(w)
  router.replace(withWindow(pathname, w), { scroll: false })
}
```

- [ ] **Step 3: Carry it onto every internal link**

Wrap channel-page and compare hrefs in `withWindow(href, win)` in `leaderboard-table.tsx`, `channel-directory.tsx`, and the `compare with you →` link on the channel page.

- [ ] **Step 4: Verify by hand**

Run: `cd web && npm run dev`
Expected: pick `7d` on `/`, click a channel — the channel page opens on `7d`. Click `compare with you` — the comparison opens on `7d`. Reload — still `7d`.

- [ ] **Step 5: Run the full suite**

Run: `cd web && npx vitest run`
Expected: PASS, every file.

- [ ] **Step 6: Commit**

```bash
rtk git add web/components web/app
rtk git commit -m "feat(web): the window follows you across routes"
```

---

### Task 14: Full verification

- [ ] **Step 1: Run every web test**

Run: `cd web && npx vitest run`
Expected: PASS. Record the file and test counts in the commit message.

- [ ] **Step 2: Type-check and build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 3: Confirm the deletions actually happened**

Run: `cd web && grep -rn "coverageByTopic\|comparePartition\|ChannelsTable\|WINDOW_CHOICES" app components lib`
Expected: no matches.

- [ ] **Step 4: Walk all five routes**

Run: `cd web && npm run dev`, then visit `/`, `/channels`, `/compare`, `/topics`, and one `/channels/[id]`.
Check against the spec's wireframes. Every number that is not `ok` must render its state, never a zero.

- [ ] **Step 5: Commit any fixes**

```bash
rtk git add -A web
rtk git commit -m "test(web): verify the five-route refinement end to end"
```

---

## Self-review notes

Spec sections and the task that implements each:

| spec section | task |
|---|---|
| Window shared app-wide | 1, 13 |
| Format only where video-derived | 3, 5 |
| Comparisons start on `/` | 7 |
| `/` leaderboard | 7 |
| `/channels` directory | 8 |
| `/compare` gap column | 2, 4, 5 |
| `/compare` Output row semantics | 3, 5 |
| `/compare` row expansion | 6 |
| `/topics` grouping | 9, 10 |
| `/topics` patterns removal | 10 |
| `/channels/[id]` shared window | 11, 13 |
| `/channels/[id]` by-window table | 11 |
| `/channels/[id]` comments demoted | 12 |
| Honesty constraints | asserted in tests across 2, 3, 9, 11 |

Not covered by any task, and deliberately so: the **roster health** open flag. The spec records it as unresolved with Eric as owner, and nothing regresses — the old `/channels` table's absent/corrupt columns had no reader.

## Follow-on

Once this plan is executed, run the `frontend-design` skill over the five routes. This plan fixes structure and semantics; it does not settle typography, spacing, the gap cell's final rendering, or the directory row layout.
