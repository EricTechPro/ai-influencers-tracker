# Web Dashboard (Steps 9-10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `web/`, the Next.js dashboard on port 3002 that answers the Monday question: home (gamified top-5 growth grid + opportunity table with expandable derivations), the full leaderboard, and topic pages, all rendering the real `_db/` bundles with honest cold-start states.

**Architecture:** A Next.js App Router app in `web/` that reads the eight `_db/*.json` bundles server-side only (`web/lib/bundles.ts` is the single read path; big files are sliced on the server and never shipped wholesale to the client). Pure rendering rules live in `web/lib/*.ts` with vitest suites beside them; components are thin over those libs. Chrome and tokens are copied from `docs/mockups/board.css` (the locked, already de-domained design), and the two high-value social-invest ports (`sortable-table.tsx`, `chain-map.tsx`) are copied and rewritten, never imported.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript 5, vitest 3, plain CSS from `docs/mockups/board.css` (no Tailwind, no Radix, no icon library: the mockup CSS is complete and native `title=` / `<details>` cover hover and collapse).

## Global Constraints

Every task's requirements implicitly include all of these.

- **Scope:** spec §10 steps 9 and 10 ONLY. Channel pages, the comment table with the lag column, and `/compare` are plan 3. Do not build them; do not link to routes that do not exist.
- **Run everything from the project root** `/Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker` unless a step says otherwise. It is its own git repository.
- **Port 3002.** `"dev": "next dev -p 3002"`. Port 3001 is social-invest and both run at once.
- **`predev` rebuilds `_db/`:** `"predev": "cd .. && python3 -m pipeline.build_data"` (runs with cwd `web/`, so `cd ..` lands at the project root). It reads only local files, no API calls.
- **`web/` reads `_db/` only.** Never `pipeline/`, `_raw/`, `_synthesize/`, `config/`, or `.env`. `web/lib/bundles.ts` is the only file that touches the filesystem. If a computation is missing from `_db/`, it belongs in the pipeline, not here.
- **`videos.json` is 16.7 MB and `comments.json` is 59 MB.** Neither is ever imported into a client component or shipped wholesale. `videos.json` is read once server-side and sliced by id (`videosById`). `comments.json` is never read at all in this plan; `bundles.test.ts` enforces that.
- **Cold-start states are the DEFAULT first render, not edge cases.** Live data today: `snapshot_health.days_present: 1`, every growth cell `building`, `comment_health.classified: 0`, every topic's `nodes`/`edges` null, `blurb`/`niche` null. The honest-state rendering is the heart of this plan and has first-class tests (`web/lib/trust.test.ts`).
- **Rendering rules (locked, from spec §7 / CONTEXT.md):**
  - `--` for `INSUFFICIENT_DATA` and absent channels. Sorts last in BOTH directions. Never `0`, never hidden. (Use the two-character `--`, not an em/en dash.)
  - `bounded` renders `< N` with its bucket width disclosed, never a bare number, never blank. Sorts below every `ok` row, above every unmeasured row; bounded rows order among themselves by `upper`.
  - `building` renders `building, N of M days` and no number.
  - `x / 75` renders inline (not only on expand) whenever a score component's weight is excluded; only a full `/ 100` may omit its denominator. A missing component expands to `no data, weight excluded`.
  - Subscriber deltas always render their bucket width (`±1,000`).
  - Parents never show a score or a verdict, only rollup counts.
  - Suppressed own-covered rows sit behind a toggle, never deleted, and show the covering video.
- **Trust tiers render distinctly:** Oracle plain · Derived dotted underline with the formula on hover (`.derived` + `title=`) · Inference violet tint + source chip (`.inference` + `.src-chip`). An Inference styled as a measurement is the failure mode. Never render a Derived value without its formula or bucket.
- **Terminology is load-bearing in UI copy:** `staleness` never `recency`; `bounded` never `unknown`; missing is a state, never a hiding place. See `docs/CONTEXT.md` before renaming anything.
- **Copy the shape, share no code.** Zero imports from `projects/social-invest/`. Ported files are copied into this repo and rewritten.
- **Avatar image files do not exist** (`_db/assets/` was never built; `channels.json` avatar paths dangle). Render initials placeholders only. Do not build a downloader.
- **`channels.json` does NOT carry** `view_growth_pct`, `upload_cadence_days`, `breakout_count`, `top_topics`. Render only what exists; no invented columns.
- **Tests:** vitest, files at `web/lib/*.test.ts`, run bare (`npx vitest run` from `web/`). Lib files import each other with relative paths only (vitest has no `@/` alias); components use `@/`.
- **Commits:** conventional commits (`feat` `fix` `docs` `test` `chore`), every git command prefixed with `rtk`, e.g. `rtk git add web && rtk git commit -m "feat(web): ..."`. Commit at the end of every task.
- **No em dashes anywhere:** not in this plan, not in code comments, not in UI copy. Use periods, commas, colons, parens, or the two-character `--`.

## File Structure

```
web/
├── package.json            scripts: predev, dev (3002), build, start, test
├── tsconfig.json           standard Next TS config, @/* alias
├── next.config.ts          empty default config
├── vitest.config.ts        include lib/**/*.test.ts, node env
├── .gitignore              node_modules, .next, next-env.d.ts
├── public/fonts/           google-sans-code woff2, copied from docs/mockups/fonts/
├── app/
│   ├── globals.css         ported board.css (tokens + components) + app-shell additions
│   ├── layout.tsx          appnav chrome + snapshot freshness from meta.json
│   ├── page.tsx            home: WHO IS GROWING + WHAT TO MAKE NEXT
│   ├── not-found.tsx
│   ├── leaderboard/page.tsx
│   └── topics/
│       ├── page.tsx        topic tree index
│       └── [id]/page.tsx   leaf or parent view
├── lib/                    pure logic, all vitest-covered
│   ├── types.ts            bundle shapes the UI reads
│   ├── bundles.ts          the ONLY fs read path; caches; slices videos.json
│   ├── bundles.test.ts     schema parity vs the REAL _db/
│   ├── trust.ts            honest-state text: deltaText, pctText, scoreText, verdict maps
│   ├── trust.test.ts
│   ├── sort.ts             three-way comparator ok > bounded > unmeasured
│   ├── sort.test.ts
│   ├── growth.ts           card models, panelBuilding, slimChannel, sparks
│   ├── growth.test.ts
│   ├── opportunity.ts      row models, creators cluster, score sort value
│   ├── opportunity.test.ts
│   ├── chain.ts            VERB map, verbClass, visibleEdges
│   ├── chain.test.ts
│   ├── topic.ts            findTopic, findOpp, creatorTrail, multText
│   ├── topic.test.ts
│   ├── rollup.ts           videosPerWeek, rollupLine
│   └── rollup.test.ts
└── components/
    ├── nav-links.tsx       client, active-link styling
    ├── trust.tsx           Derived, Inference, VerdictBadge, Chip
    ├── sortable-table.tsx  useTableSort + SortableHeader + ColGroup (the port)
    ├── sparkline.tsx
    ├── building-callout.tsx
    ├── growth-card.tsx
    ├── growth-panel.tsx    client: mode/window/niche controls + grid or callout
    ├── avatar-cluster.tsx
    ├── opportunity-table.tsx  client: filters, expandable derivation rows
    ├── leaderboard-table.tsx  client
    ├── chain-map.tsx       the de-domained port
    ├── trend-area.tsx      SVG area chart for the parent rollup
    ├── topic-leaf.tsx      leaf page sections
    └── topic-parent.tsx    parent page sections
```

Live `_db/` facts the code is written against (verified 2026-07-28): 8 bundles (no 9th; `review_queue.json` was deleted per decision 0003). Verdict enum in the data: `MAKE_THIS_NOW | ONLY_IF_UNSERVED | TOO_EARLY | SKIP | INSUFFICIENT_DATA` (pipeline/verdict.py; the wireframe's "CROWDED" cell is the `SKIP` verdict). Cell states: `ok | bounded | building | insufficient_data | no_baseline | unavailable`. `score.out_of` is null when `score.value` is null. `own_coverage` is always present with `covered: boolean`. `videos_published` and `median_views_per_video` carry only a `"30d"` key. `comment_stats` is null on ~29% of video rows.

---

### Task 1: Bundle reader + schema parity test against the real `_db/`

The first deliverable is proof the UI's assumed schema matches what the pipeline actually wrote. Minimal npm scaffolding is folded in because vitest needs a package.

**Files:**
- Create: `web/package.json`
- Create: `web/.gitignore`
- Create: `web/vitest.config.ts`
- Create: `web/lib/types.ts`
- Create: `web/lib/bundles.ts`
- Test: `web/lib/bundles.test.ts`

**Interfaces:**
- Consumes: the real `_db/*.json` files at the project root (already built, build_step 8).
- Produces (every later task relies on these exact names):
  - `lib/types.ts`: `WindowKey`, `WINDOWS`, `CellState`, `StateCell`, `RankMode`, `ChannelRow`, `ChannelsBundle`, `ScoreComponent`, `ScoreBlock`, `Verdict`, `RepoEvidence`, `OpportunityRow`, `OpportunitiesBundle`, `ChainCite`, `Relation`, `ChainEdge`, `LeafTopicPage`, `ParentTopicPage`, `TopicPage`, `TopicPagesBundle`, `VideoRow`, `SnapshotDay`, `SnapshotsBundle`, `Meta`
  - `lib/bundles.ts`: `loadMeta(): Meta`, `loadChannels(): ChannelsBundle`, `loadOpportunities(): OpportunitiesBundle`, `loadTopicPages(): TopicPagesBundle`, `loadSnapshots(): SnapshotsBundle`, `videosById(ids: string[]): VideoRow[]`

- [ ] **Step 1: Create the package skeleton**

`web/package.json`:

```json
{
  "name": "ai-influencers-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "predev": "cd .. && python3 -m pipeline.build_data",
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

`web/.gitignore`:

```
node_modules/
.next/
next-env.d.ts
*.tsbuildinfo
```

`web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
})
```

- [ ] **Step 2: Install**

Run: `cd web && npm install`
Expected: completes without errors; `node_modules/` appears; lockfile `web/package-lock.json` created.

- [ ] **Step 3: Write the bundle types**

`web/lib/types.ts`. These are the shapes the UI reads. Fields the UI never touches (e.g. `subscriber_daily`, `topic_assignments` internals) are typed loosely or omitted; extra JSON keys are fine.

```ts
// Shapes of the _db/ bundles the UI reads. bundles.test.ts checks every field
// listed here against the real files, so a pipeline schema change fails loudly
// here instead of rendering a wrong number.

export type WindowKey = "7d" | "14d" | "30d" | "90d" | "180d" | "365d"
export const WINDOWS: WindowKey[] = ["7d", "14d", "30d", "90d", "180d", "365d"]

export type CellState =
  | "ok"
  | "bounded"
  | "building"
  | "insufficient_data"
  | "no_baseline"
  | "unavailable"

export interface StateCell {
  state: CellState
  value: number | null
  /** bounded only: the measurement floor the delta sits under */
  upper?: number
  /** subscriber cells: the channel's bucket width, always disclosed in the UI */
  bucket?: number
  /** building only */
  have?: number
  need?: number
}

export type RankMode = "growth" | "general" | "subscribers" | "views"
export const RANK_MODES: RankMode[] = ["growth", "general", "subscribers", "views"]

export interface ChannelRow {
  channel_id: string
  name: string
  handle: string
  avatar: string
  blurb: string | null
  niche: string | null
  lang: string | null
  category: "ai-creator" | "company" | "adjacent" | "own" | "unknown"
  is_self: boolean
  status: "ok" | "absent"
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  video_count: number | null
  rank: Record<RankMode, Record<WindowKey, number | null>>
  subscriber_delta: Record<WindowKey, StateCell>
  subscriber_growth_rate: Record<WindowKey, StateCell>
  subs_per_1k_views: Record<WindowKey, StateCell>
  view_delta: Record<string, StateCell>
  videos_published: Record<string, number | null>
  median_views_per_video: Record<string, number | null>
  still_growing_video_ids: string[]
}

export interface ChannelsBundle {
  generated_at: string
  version: number
  self_channel_id: string
  channels: ChannelRow[]
}

export interface ScoreComponent {
  key: string
  raw: number | null
  raw_label: string | null
  norm: number | null
  weight: number
  points: number | null
  source: string
  state: "ok" | "no_data"
}

export interface ScoreBlock {
  components: ScoreComponent[]
  out_of: number | null
  value: number | null
}

export type Verdict =
  | "MAKE_THIS_NOW"
  | "ONLY_IF_UNSERVED"
  | "TOO_EARLY"
  | "SKIP"
  | "INSUFFICIENT_DATA"

export interface RepoEvidence {
  kind: string
  github_id: number
  full_name: string
  stars: number
  velocity: number
  age_days: number
  discovered_via: string
  indie: { score: number; owner_type: string; contributors: number; trust: string }
}

export interface OpportunityRow {
  topic_id: string
  verdict: Verdict
  shape: "tutorial" | "review" | null
  hunch: boolean
  score: ScoreBlock
  demand: {
    band: string
    fired: string[]
    repo_velocity: number | null
    keyword_volume: number | null
  }
  supply: {
    band: string
    fired: string[]
    videos: number
    creators: number
    window_days: number
  }
  evidence: RepoEvidence[]
  own_coverage: {
    covered: boolean
    suppressed: boolean
    video_id: string | null
    published_at: string | null
  }
  trust: Record<string, string>
}

export interface OpportunitiesBundle {
  generated_at: string
  version: number
  thresholds_version: number
  rows: OpportunityRow[]
}

export interface ChainCite {
  handle: string
  said_on: string
  evidence: string
  url?: string | null
}

export type Relation = "then" | "requires" | "alternative_to" | "contradicts"

export interface ChainEdge {
  from: string
  to: string
  relation: Relation
  voices: number
  cites: ChainCite[]
}

export interface LeafTopicPage {
  topic_id: string
  label: string
  is_leaf: true
  parent_id: string | null
  shape: string | null
  state: string
  video_count: number
  creator_count: number
  min_videos: number
  newest_video_at: string | null
  window_days: number
  video_ids: string[]
  nodes: unknown[] | null
  edges: ChainEdge[] | null
}

export interface ParentTopicPage {
  topic_id: string
  label: string
  is_leaf: false
  parent_id: string | null
  children: string[]
  leaf_count: number
  video_count: number
  creator_count: number
  window_days: number
}

export type TopicPage = LeafTopicPage | ParentTopicPage

export interface TopicPagesBundle {
  generated_at: string
  version: number
  topics: TopicPage[]
}

export interface VideoRow {
  video_id: string
  channel_id: string
  title: string
  published_at: string
  type: "short" | "long"
  view_count: number | null
  duration_s: number | null
  topic_assignments: unknown[]
  multiplier: {
    state: string
    value: number | null
    baseline: number | null
    baseline_n: number | null
    source: string
  }
  /** null for ~29% of videos (not yet ingested). Renders a missing state, never zero. */
  comment_stats: unknown | null
  traction: {
    still_growing: boolean | null
    share_recent_7d: number | null
    views_gained: Record<string, StateCell>
  }
}

export interface VideosBundle {
  generated_at: string
  version: number
  videos: VideoRow[]
}

export interface SnapshotDay {
  date: string
  status: string
  source: string
  subscriber_count: number | null
  subscriber_bucket: number | null
  view_count: number | null
  video_count: number | null
}

export interface SnapshotsBundle {
  generated_at: string
  version: number
  dates_present: string[]
  dates_missing: string[]
  channels: Record<string, { handle: string; series: SnapshotDay[] }>
}

export interface Meta {
  version: number
  generated_at: string
  build_step: number
  thresholds_version: number
  partial_run: boolean
  self_channel_id: string
  channels: { total: number; ok: number; absent: number }
  snapshot_health: { days_present: number; days_missing: number; first_date: string | null }
  video_snapshot_health: { days_present: number; videos_tracked: number }
  comment_health: { ingested: number; classified: number; channels_with_comments: number }
  coverage_rate: number | null
  discovery: { trending_ok: boolean; reason: string | null }
  target: { mode: string; rank: number; window_days: number }
}
```
- [ ] **Step 4: Write the failing parity test**

`web/lib/bundles.test.ts`. It runs against the REAL `_db/` output, not fixtures. That is the point: when the pipeline schema drifts, this fails before a page renders a wrong number.

```ts
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadSnapshots,
  loadTopicPages,
  videosById,
} from "./bundles"
import { RANK_MODES, WINDOWS } from "./types"
import type { LeafTopicPage, StateCell } from "./types"

const CELL_STATES = ["ok", "bounded", "building", "insufficient_data", "no_baseline", "unavailable"]
const VERDICTS = ["MAKE_THIS_NOW", "ONLY_IF_UNSERVED", "TOO_EARLY", "SKIP", "INSUFFICIENT_DATA"]

/** haveNeed: subscriber_delta, growth-rate and view_delta building cells carry
 *  have/need; subs_per_1k_views building cells do not (growth.py passes the
 *  views cell's state through without the window bookkeeping). */
function expectCell(cell: StateCell, path: string, opts: { haveNeed?: boolean } = {}) {
  expect(CELL_STATES, `${path}.state`).toContain(cell.state)
  if (cell.state === "ok") {
    expect(typeof cell.value, `${path}.value`).toBe("number")
  } else {
    expect(cell.value, `${path}.value must be null when not ok`).toBeNull()
  }
  if (cell.state === "bounded") expect(typeof cell.upper, `${path}.upper`).toBe("number")
  if (cell.state === "building" && opts.haveNeed !== false) {
    expect(typeof cell.have, `${path}.have`).toBe("number")
    expect(typeof cell.need, `${path}.need`).toBe("number")
  }
}

describe("meta.json", () => {
  it("carries every field the chrome reads", () => {
    const meta = loadMeta()
    expect(typeof meta.generated_at).toBe("string")
    expect(typeof meta.build_step).toBe("number")
    expect(typeof meta.self_channel_id).toBe("string")
    expect(typeof meta.channels.total).toBe("number")
    expect(typeof meta.snapshot_health.days_present).toBe("number")
    expect(typeof meta.comment_health.ingested).toBe("number")
    expect(typeof meta.comment_health.classified).toBe("number")
    expect(typeof meta.target.window_days).toBe("number")
    expect(typeof meta.partial_run).toBe("boolean")
  })
})

describe("channels.json", () => {
  it("has rows and exactly one self channel", () => {
    const bundle = loadChannels()
    expect(bundle.channels.length).toBeGreaterThan(0)
    expect(bundle.channels.filter((c) => c.is_self).length).toBe(1)
    expect(typeof bundle.self_channel_id).toBe("string")
  })

  it("every row carries the card and leaderboard fields", () => {
    for (const c of loadChannels().channels) {
      const p = c.handle
      expect(typeof c.channel_id, p).toBe("string")
      expect(typeof c.name, p).toBe("string")
      expect(typeof c.handle, p).toBe("string")
      expect(["ok", "absent"], p).toContain(c.status)
      expect(typeof c.is_self, p).toBe("boolean")
      expect(["ai-creator", "company", "adjacent", "own", "unknown"], p).toContain(c.category)
      if (c.status === "ok") {
        expect(typeof c.subscriber_count, p).toBe("number")
        expect(typeof c.subscriber_bucket, p).toBe("number")
      }
      for (const mode of RANK_MODES) {
        for (const w of WINDOWS) {
          const r = c.rank[mode][w]
          expect(r === null || typeof r === "number", `${p}.rank.${mode}.${w}`).toBe(true)
        }
      }
      for (const w of WINDOWS) {
        expectCell(c.subscriber_delta[w], `${p}.subscriber_delta.${w}`)
        expectCell(c.subscriber_growth_rate[w], `${p}.subscriber_growth_rate.${w}`)
        expectCell(c.subs_per_1k_views[w], `${p}.subs_per_1k_views.${w}`, { haveNeed: false })
        expectCell(c.view_delta[w], `${p}.view_delta.${w}`)
      }
      expect(c.videos_published, p).toHaveProperty("30d")
      expect(c.median_views_per_video, p).toHaveProperty("30d")
    }
  })
})

describe("opportunities.json", () => {
  it("every verdict is a known enum value", () => {
    const bundle = loadOpportunities()
    expect(bundle.rows.length).toBeGreaterThan(0)
    for (const r of bundle.rows) expect(VERDICTS, r.topic_id).toContain(r.verdict)
  })

  it("score blocks are honest: weights sum to 100, out_of matches included weights", () => {
    for (const r of loadOpportunities().rows) {
      const total = r.score.components.reduce((s, c) => s + c.weight, 0)
      expect(total, r.topic_id).toBe(100)
      const included = r.score.components
        .filter((c) => c.state === "ok")
        .reduce((s, c) => s + c.weight, 0)
      if (r.score.value === null) {
        expect(r.score.out_of, r.topic_id).toBeNull()
      } else {
        expect(r.score.out_of, r.topic_id).toBe(included)
        expect(r.score.value, r.topic_id).toBeLessThanOrEqual(included)
      }
      for (const c of r.score.components) {
        expect(["ok", "no_data"], `${r.topic_id}.${c.key}`).toContain(c.state)
        if (c.state === "ok") expect(typeof c.points, `${r.topic_id}.${c.key}`).toBe("number")
      }
      expect(typeof r.own_coverage.covered, r.topic_id).toBe("boolean")
      expect(typeof r.supply.videos, r.topic_id).toBe("number")
      expect(typeof r.supply.creators, r.topic_id).toBe("number")
      expect(Array.isArray(r.demand.fired), r.topic_id).toBe(true)
      for (const e of r.evidence) {
        expect(typeof e.full_name, r.topic_id).toBe("string")
        expect(typeof e.velocity, r.topic_id).toBe("number")
        expect(typeof e.indie.score, r.topic_id).toBe("number")
      }
    }
  })
})

describe("topic_pages.json", () => {
  it("discriminates leaf and parent rows", () => {
    const bundle = loadTopicPages()
    expect(bundle.topics.length).toBeGreaterThan(0)
    for (const t of bundle.topics) {
      expect(typeof t.topic_id).toBe("string")
      expect(typeof t.label).toBe("string")
      expect(typeof t.video_count).toBe("number")
      expect(typeof t.creator_count).toBe("number")
      expect(typeof t.window_days).toBe("number")
      if (t.is_leaf) {
        expect(Array.isArray(t.video_ids), t.topic_id).toBe(true)
        expect(t.edges === null || Array.isArray(t.edges), t.topic_id).toBe(true)
        expect(
          t.newest_video_at === null || typeof t.newest_video_at === "string",
          t.topic_id
        ).toBe(true)
      } else {
        expect(Array.isArray(t.children), t.topic_id).toBe(true)
        expect(typeof t.leaf_count, t.topic_id).toBe("number")
      }
    }
  })
})

describe("snapshots.json", () => {
  it("has a dated series per channel", () => {
    const bundle = loadSnapshots()
    expect(Array.isArray(bundle.dates_present)).toBe(true)
    const entries = Object.values(bundle.channels)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(typeof e.handle).toBe("string")
      for (const day of e.series) {
        expect(typeof day.date).toBe("string")
        expect(typeof day.status).toBe("string")
      }
    }
  })
})

describe("videos.json server-side slice", () => {
  it("returns rows by id with the fields the topic pages read", () => {
    const topics = loadTopicPages().topics
    const leaf = topics.find(
      (t): t is LeafTopicPage => t.is_leaf && t.video_ids.length > 0
    )
    if (!leaf) throw new Error("no leaf topic with videos in _db/")
    const rows = videosById(leaf.video_ids.slice(0, 20))
    expect(rows.length).toBeGreaterThan(0)
    for (const v of rows) {
      expect(typeof v.video_id).toBe("string")
      expect(typeof v.channel_id).toBe("string")
      expect(typeof v.title).toBe("string")
      expect(typeof v.published_at).toBe("string")
      expect(["short", "long"]).toContain(v.type)
      expect(v.view_count === null || typeof v.view_count === "number").toBe(true)
      expect(typeof v.multiplier.state).toBe("string")
      expect(v.comment_stats === null || typeof v.comment_stats === "object").toBe(true)
    }
  })

  it("unknown ids are skipped, not fabricated", () => {
    expect(videosById(["definitely-not-a-video-id"])).toEqual([])
  })

  it("the bundles module never touches comments.json", () => {
    const src = readFileSync(new URL("./bundles.ts", import.meta.url), "utf8")
    expect(src.includes("comments.json")).toBe(false)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd web && npx vitest run lib/bundles.test.ts`
Expected: FAIL with `Cannot find module './bundles'` (or equivalent resolve error). `types.ts` exists; `bundles.ts` does not yet.

- [ ] **Step 6: Implement the reader**

`web/lib/bundles.ts`:

```ts
// The ONLY file in web/ that touches the filesystem. Reads _db/ and nothing
// else: never _raw/, _synthesize/, config/, .env, or pipeline/. videos.json
// (16.7 MB) is parsed once per process and served as id slices so it is never
// shipped wholesale; comments.json (59 MB) is not read at all in this build.
import { readFileSync } from "node:fs"
import path from "node:path"
import type {
  ChannelsBundle,
  Meta,
  OpportunitiesBundle,
  SnapshotsBundle,
  TopicPagesBundle,
  VideoRow,
  VideosBundle,
} from "./types"

const DB_DIR = process.env.AIT_DB_DIR ?? path.resolve(process.cwd(), "..", "_db")

const cache = new Map<string, unknown>()

function load<T>(name: string): T {
  let hit = cache.get(name)
  if (hit === undefined) {
    hit = JSON.parse(readFileSync(path.join(DB_DIR, name), "utf8"))
    cache.set(name, hit)
  }
  return hit as T
}

export function loadMeta(): Meta {
  return load("meta.json")
}

export function loadChannels(): ChannelsBundle {
  return load("channels.json")
}

export function loadOpportunities(): OpportunitiesBundle {
  return load("opportunities.json")
}

export function loadTopicPages(): TopicPagesBundle {
  return load("topic_pages.json")
}

export function loadSnapshots(): SnapshotsBundle {
  return load("snapshots.json")
}

let videoIndex: Map<string, VideoRow> | null = null

/** Server-side slice of videos.json. Unknown ids are dropped, never invented. */
export function videosById(ids: string[]): VideoRow[] {
  if (!videoIndex) {
    const bundle = load<VideosBundle>("videos.json")
    videoIndex = new Map(bundle.videos.map((v) => [v.video_id, v]))
  }
  const out: VideoRow[] = []
  for (const id of ids) {
    const v = videoIndex.get(id)
    if (v) out.push(v)
  }
  return out
}
```

Note on `DB_DIR`: `process.cwd()` is `web/` for both `next dev` and vitest, so `../_db` resolves to the project's `_db/`. `AIT_DB_DIR` exists so a test could point at a fixture directory; this plan's tests deliberately use the real one.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd web && npx vitest run lib/bundles.test.ts`
Expected: PASS, all describe blocks green, running against the real bundles.

- [ ] **Step 8: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): bundle reader with schema parity test against real _db"
```

---

### Task 2: Next.js shell on port 3002 with the ported tokens

The app boots, wears the locked mockup chrome, and renders honest meta stats on the home route (replaced by the real panels in Task 7).

**Files:**
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/app/globals.css` (ported from `docs/mockups/board.css`)
- Create: `web/public/fonts/` (copied woff2 files)
- Create: `web/app/layout.tsx`
- Create: `web/components/nav-links.tsx`
- Create: `web/app/page.tsx` (interim, replaced in Task 7)
- Create: `web/app/not-found.tsx`

**Interfaces:**
- Consumes: `loadMeta()` from Task 1.
- Produces: the CSS class vocabulary every later component uses (`.appnav`, `.section-kicker`, `.kicker`, `.cap`, `.rule`, `.tbl`, `.badge`, `.b-filled`, `.v-*`, `.chip`, `.derived`, `.inference`, `.src-chip`, `.cardgrid`, `.gcard`, `.hero`, `.statline`, `.gfoot`, `.rank-numeral`, `.avatar`, `.av18`, `.av20`, `.av-you`, `.chain`, `.quote`, `.tabs`, `.cattabs`, `.callout`, `.empty`, `.btn`, `.card`, `.pad`, `.note`, `.num`, `.muted`, `.vb`, `.bigsec`, plus the app-shell additions `.thsort`, `.controls`, `.spark`, `.avcluster`, `.overlay`, `.dialogbox`, `details.sect`, `.topichead`, `.trow`); the layout chrome with `<main className="page">`.

- [ ] **Step 1: TypeScript and Next config**

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 2: Port the stylesheet and fonts**

```bash
cp docs/mockups/board.css web/app/globals.css
mkdir -p web/public/fonts
cp docs/mockups/fonts/google-sans-code-latin.woff2 web/public/fonts/
cp docs/mockups/fonts/google-sans-code-latin-ext.woff2 web/public/fonts/
```

Then edit `web/app/globals.css`:

1. In both `@font-face` blocks, change `url("fonts/google-sans-code-latin.woff2")` to `url("/fonts/google-sans-code-latin.woff2")` and `url("fonts/google-sans-code-latin-ext.woff2")` to `url("/fonts/google-sans-code-latin-ext.woff2")`.
2. Delete the mockup-board harness rules entirely (each is a full one-line rule; remove the whole line): `.wrap`, `.lede`, `.pageframe`, `.framebar`, `.framebar .dots`, `.framebar .dots i`, `.framebar .url`, `.framebar .vlabel`, `.framebar .vdesc`, `.pickbtn`, `.pickbtn:hover`, `.pageframe.selected`, `.pageframe.selected .pickbtn`, `.framebody`, `.vc .framebody`, `.pagenav`.
3. Keep everything else unchanged: the `:root` token block, base element rules, `.appnav`, `.page`, all component classes, and the `.vb`/`.vc` variant scopes (home opts into the gamified B personality via a `vb` wrapper class).
4. Append this app-shell block at the end of the file:

```css
/* app shell additions (not from the mockup board) */
body { margin: 0; }
.page { padding-bottom: 6rem; }
.thsort { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0; text-transform: inherit; letter-spacing: inherit; }
.thsort:hover { color: var(--foreground); }
.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0.6rem 0 0.9rem; }
.controls select, .controls label { font: inherit; font-size: 12px; }
.controls select { border: 1px solid var(--border); background: var(--card); padding: 3px 8px; }
.spark { width: 100%; height: 28px; margin-top: 6px; }
.avcluster { display: inline-flex; gap: 2px; align-items: center; }
.overlay { position: fixed; inset: 0; background: rgba(40, 39, 40, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialogbox { background: var(--card); border: 1px solid var(--border); max-width: 28rem; width: calc(100% - 2rem); max-height: 85vh; overflow-y: auto; padding: 1.2rem 1.4rem; }
details.sect > summary { cursor: pointer; list-style: none; }
details.sect > summary::-webkit-details-marker { display: none; }
details.sect > summary .kicker::before { content: "\25B8  "; }
details.sect[open] > summary .kicker::before { content: "\25BE  "; }
.topichead h1 { font-size: 1.3rem; margin: 0 0 2px; }
.trow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tbl tr.youcard td { background: color-mix(in srgb, var(--primary) 3%, transparent); }
```

- [ ] **Step 3: Layout with the appnav chrome**

`web/app/layout.tsx`:

```tsx
import type { Metadata } from "next"
import type { ReactNode } from "react"
import { loadMeta } from "@/lib/bundles"
import { NavLinks } from "@/components/nav-links"
import "./globals.css"

export const metadata: Metadata = {
  title: "AI Influencers Tracker",
  description: "72 AI/automation YouTube channels and what to make next",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const meta = loadMeta()
  return (
    <html lang="en">
      <body>
        <div className="navrule">
          <header className="appnav">
            <span className="logo">AI INFLUENCERS</span>
            <NavLinks />
            <div className="right">
              <span className="num">
                snapshot {meta.generated_at.slice(0, 10)} · {meta.snapshot_health.days_present} of{" "}
                {meta.target.window_days} days
              </span>
              <span
                className="livedot"
                style={meta.partial_run ? { background: "var(--warning)" } : undefined}
              />
            </div>
          </header>
        </div>
        <main className="page">{children}</main>
      </body>
    </html>
  )
}
```

`web/components/nav-links.tsx`:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "home" },
  { href: "/leaderboard", label: "leaderboard" },
  { href: "/topics", label: "topics" },
]

export function NavLinks() {
  const path = usePathname()
  return (
    <nav>
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : undefined}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

Nav carries only the three routes this plan builds. `channels` and `compare` join in plan 3; a dead link is a lie.

- [ ] **Step 4: Interim home page and 404**

`web/app/page.tsx` (real data, replaced by the full panels in Task 7):

```tsx
import { loadMeta } from "@/lib/bundles"

export default function HomePage() {
  const meta = loadMeta()
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">PIPELINE STATE</span>
        <span className="rule" />
        <span className="cap">build step {meta.build_step}</span>
      </div>
      <div className="callout warn">
        <b>
          building, {meta.snapshot_health.days_present} of {meta.target.window_days} days
        </b>
        <p className="note">
          {meta.channels.ok} of {meta.channels.total} channels ok ·{" "}
          {meta.comment_health.ingested.toLocaleString("en-US")} comments ingested ·{" "}
          {meta.comment_health.classified} classified
        </p>
      </div>
    </section>
  )
}
```

`web/app/not-found.tsx`:

```tsx
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: "3rem" }}>
      no such page
      <br />
      <Link href="/">back to home</Link>
    </div>
  )
}
```

- [ ] **Step 5: Boot and verify**

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s http://localhost:3002/ | grep -c "AI INFLUENCERS"
curl -s http://localhost:3002/ | grep -c "building, 1 of 90 days"
kill "$(cat /tmp/ait-web-dev.pid)"
```

Expected: both greps print `1` (or more). Note `predev` runs `python3 -m pipeline.build_data` first; that is intended and takes a moment. If port 3002 is busy, find the stray process with `lsof -i :3002` and kill it (3001 is social-invest and must be left alone).

- [ ] **Step 6: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): next shell on 3002 with ported mockup tokens and chrome"
```
---

### Task 3: Honest-state text lib + trust-tier components

The heart of steps 9-10: every state renders as itself, never as a number it does not have.

**Files:**
- Create: `web/lib/trust.ts`
- Create: `web/components/trust.tsx`
- Test: `web/lib/trust.test.ts`

**Interfaces:**
- Consumes: `StateCell`, `ScoreBlock`, `Verdict` from `lib/types.ts`; `loadOpportunities` from `lib/bundles.ts` (one live-data assertion).
- Produces:
  - `lib/trust.ts`: `deltaText(cell: StateCell): string`, `pctText(cell: StateCell): string`, `scoreText(score: ScoreBlock): string`, `fmtInt(n: number): string`, `signedInt(n: number): string`, `signedPct(f: number): string`, `compactM(n: number): string`, `bucketText(width: number | null): string`, `fmtDate(iso: string | null): string`, `agoText(iso: string | null, now?: Date): string`, `initials(name: string): string`, `VERDICT_CLASS: Record<Verdict, string>`, `VERDICT_LABEL: Record<Verdict, string>`, `VERDICT_RANK: Record<Verdict, number>`
  - `components/trust.tsx`: `Derived({ formula, children })`, `Inference({ source, children })`, `VerdictBadge({ verdict })`, `Chip({ variant?, children })`

- [ ] **Step 1: Write the failing test**

`web/lib/trust.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadOpportunities } from "./bundles"
import {
  agoText,
  bucketText,
  compactM,
  deltaText,
  fmtDate,
  fmtInt,
  initials,
  pctText,
  scoreText,
  signedInt,
  signedPct,
  VERDICT_CLASS,
  VERDICT_LABEL,
  VERDICT_RANK,
} from "./trust"
import type { StateCell } from "./types"

const ok = (value: number, bucket?: number): StateCell => ({ state: "ok", value, bucket })
const bounded = (upper: number): StateCell => ({ state: "bounded", value: null, upper })
const building = (have: number, need: number): StateCell => ({
  state: "building",
  value: null,
  have,
  need,
})

describe("deltaText: a bounded delta renders < N and never a bare number", () => {
  it("measured", () => {
    expect(deltaText(ok(15000))).toBe("+15,000")
    expect(deltaText(ok(-180))).toBe("-180")
  })
  it("bounded", () => {
    expect(deltaText(bounded(50000))).toBe("< 50,000")
  })
  it("bounded ignores a stray value; belt over the pipeline's braces", () => {
    expect(deltaText({ state: "bounded", value: 12345, upper: 50000 })).toBe("< 50,000")
  })
  it("building renders the window state and no number", () => {
    expect(deltaText(building(1, 90))).toBe("building, 1 of 90 days")
  })
  it("building without window bookkeeping still names its state (subs_per_1k cells)", () => {
    expect(deltaText({ state: "building", value: null })).toBe("building")
  })
  it("everything unmeasured renders --", () => {
    expect(deltaText({ state: "insufficient_data", value: null })).toBe("--")
    expect(deltaText({ state: "unavailable", value: null })).toBe("--")
    expect(deltaText({ state: "no_baseline", value: null })).toBe("--")
  })
})

describe("pctText", () => {
  it("measured growth is a signed percent", () => {
    expect(pctText(ok(0.074))).toBe("+7.4%")
    expect(pctText(ok(-0.021))).toBe("-2.1%")
  })
  it("bounded growth renders < N%", () => {
    expect(pctText(bounded(0.02))).toBe("< 2.0%")
  })
  it("building matches deltaText exactly", () => {
    expect(pctText(building(1, 90))).toBe("building, 1 of 90 days")
  })
})

describe("scoreText: only a full / 100 may omit its denominator", () => {
  it("full score", () => {
    expect(scoreText({ components: [], out_of: 100, value: 71.9 })).toBe("71.9")
  })
  it("partial score renders its denominator inline", () => {
    expect(scoreText({ components: [], out_of: 75, value: 40.3 })).toBe("40.3 / 75")
  })
  it("INSUFFICIENT_DATA scores --, never 0", () => {
    expect(scoreText({ components: [], out_of: null, value: null })).toBe("--")
  })
})

describe("formatting helpers", () => {
  it("fmtInt and signedInt", () => {
    expect(fmtInt(2940000)).toBe("2,940,000")
    expect(signedInt(0)).toBe("+0")
  })
  it("signedPct", () => {
    expect(signedPct(0.074)).toBe("+7.4%")
  })
  it("compactM renders millions like the wireframe", () => {
    expect(compactM(3100000)).toBe("+3.1M")
    expect(compactM(20000)).toBe("+0.02M")
    expect(compactM(-1200000)).toBe("-1.2M")
  })
  it("bucketText always discloses the bucket", () => {
    expect(bucketText(1000)).toBe("±1,000")
    expect(bucketText(null)).toBe("")
  })
  it("fmtDate and agoText", () => {
    expect(fmtDate("2026-07-18T13:00:11Z")).toBe("2026-07-18")
    expect(fmtDate(null)).toBe("--")
    expect(agoText("2026-07-22T00:00:00Z", new Date("2026-07-28T12:00:00Z"))).toBe("6d")
    expect(agoText(null)).toBe("never")
  })
  it("initials", () => {
    expect(initials("Dan Martell")).toBe("DM")
    expect(initials("AICodeKing")).toBe("A")
  })
})

describe("verdict maps", () => {
  it("cover every verdict in the live bundle", () => {
    for (const r of loadOpportunities().rows) {
      expect(VERDICT_CLASS[r.verdict]).toBeTruthy()
      expect(VERDICT_LABEL[r.verdict]).toBeTruthy()
      expect(VERDICT_RANK[r.verdict]).toBeGreaterThanOrEqual(0)
    }
  })
  it("SKIP wears the crowded hue and INSUFFICIENT_DATA renders shortened", () => {
    expect(VERDICT_CLASS.SKIP).toBe("v-crowded")
    expect(VERDICT_LABEL.INSUFFICIENT_DATA).toBe("INSUFFICIENT")
    expect(VERDICT_RANK.MAKE_THIS_NOW).toBeGreaterThan(VERDICT_RANK.ONLY_IF_UNSERVED)
    expect(VERDICT_RANK.ONLY_IF_UNSERVED).toBeGreaterThan(VERDICT_RANK.TOO_EARLY)
    expect(VERDICT_RANK.TOO_EARLY).toBeGreaterThan(VERDICT_RANK.SKIP)
    expect(VERDICT_RANK.SKIP).toBeGreaterThan(VERDICT_RANK.INSUFFICIENT_DATA)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/trust.test.ts`
Expected: FAIL with `Cannot find module './trust'`.

- [ ] **Step 3: Implement the lib**

`web/lib/trust.ts`:

```ts
// The honest-state rendering rules from spec section 7 and CONTEXT.md, as pure
// functions. Bounded never a bare number; building never a number at all;
// unmeasured is always the two-character "--"; a partial score always names
// its denominator.
import type { ScoreBlock, StateCell, Verdict } from "./types"

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

export function signedInt(n: number): string {
  return (n >= 0 ? "+" : "-") + fmtInt(Math.abs(n))
}

export function signedPct(fraction: number): string {
  return (fraction >= 0 ? "+" : "-") + (Math.abs(fraction) * 100).toFixed(1) + "%"
}

/** Wireframe view-delta format: +3.1M, +0.02M. */
export function compactM(n: number): string {
  const m = Math.abs(n) / 1_000_000
  const digits = m >= 0.1 ? 1 : 2
  return (n >= 0 ? "+" : "-") + m.toFixed(digits) + "M"
}

export function bucketText(width: number | null): string {
  return width === null ? "" : "±" + fmtInt(width)
}

function buildingText(cell: StateCell): string {
  // subs_per_1k_views building cells carry no window bookkeeping; the state
  // still renders as itself, never as a number and never as fake bookkeeping.
  return cell.have !== undefined && cell.need !== undefined
    ? `building, ${cell.have} of ${cell.need} days`
    : "building"
}

export function deltaText(cell: StateCell): string {
  if (cell.state === "ok") return signedInt(cell.value ?? 0)
  if (cell.state === "bounded") return `< ${fmtInt(cell.upper ?? 0)}`
  if (cell.state === "building") return buildingText(cell)
  return "--"
}

export function pctText(cell: StateCell): string {
  if (cell.state === "ok") return signedPct(cell.value ?? 0)
  if (cell.state === "bounded") return `< ${((cell.upper ?? 0) * 100).toFixed(1)}%`
  if (cell.state === "building") return buildingText(cell)
  return "--"
}

export function scoreText(score: ScoreBlock): string {
  if (score.value === null || score.out_of === null) return "--"
  const v = score.value.toFixed(1)
  return score.out_of === 100 ? v : `${v} / ${score.out_of}`
}

export function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "--"
}

export function agoText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never"
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
  return `${days}d`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? "?"
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

export const VERDICT_CLASS: Record<Verdict, string> = {
  MAKE_THIS_NOW: "v-make",
  ONLY_IF_UNSERVED: "v-unserved",
  TOO_EARLY: "v-early",
  SKIP: "v-crowded",
  INSUFFICIENT_DATA: "v-none",
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  MAKE_THIS_NOW: "MAKE_THIS_NOW",
  ONLY_IF_UNSERVED: "ONLY_IF_UNSERVED",
  TOO_EARLY: "TOO_EARLY",
  SKIP: "SKIP",
  INSUFFICIENT_DATA: "INSUFFICIENT",
}

export const VERDICT_RANK: Record<Verdict, number> = {
  MAKE_THIS_NOW: 4,
  ONLY_IF_UNSERVED: 3,
  TOO_EARLY: 2,
  SKIP: 1,
  INSUFFICIENT_DATA: 0,
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/trust.test.ts`
Expected: PASS.

- [ ] **Step 5: The trust-tier components**

`web/components/trust.tsx` (server-safe, no state):

```tsx
import type { ReactNode } from "react"
import type { Verdict } from "@/lib/types"
import { VERDICT_CLASS, VERDICT_LABEL } from "@/lib/trust"

/** Derived tier: dotted underline, formula on hover. Never render one without
 *  a formula; the prop is mandatory for exactly that reason. */
export function Derived({ formula, children }: { formula: string; children: ReactNode }) {
  return (
    <span className="derived num" title={formula}>
      {children}
    </span>
  )
}

/** Inference tier: violet tint plus the source it came from, always adjacent. */
export function Inference({ source, children }: { source: string; children: ReactNode }) {
  return (
    <span className="inference">
      {children} <span className="src-chip">{source}</span>
    </span>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`badge b-filled ${VERDICT_CLASS[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
}

export function Chip({
  variant,
  children,
}: {
  variant?: "warn" | "you" | "rank1"
  children: ReactNode
}) {
  return <span className={variant ? `chip ${variant}` : "chip"}>{children}</span>
}
```

- [ ] **Step 6: Full suite still green**

Run: `cd web && npx vitest run`
Expected: PASS (bundles + trust).

- [ ] **Step 7: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): trust tiers and honest-state rendering lib with tests"
```

---

### Task 4: Three-way sort + the sortable-table port

`components/sortable-table.tsx` is the highest-value social-invest port. It arrives with nulls-last-both-ways; this copy extends it to the three-way ordering `ok > bounded > insufficient_data` (the pipeline already emits the states; the web side only consumes them, mirroring `pipeline/growth.py rank_value`).

**Files:**
- Create: `web/lib/sort.ts`
- Create: `web/components/sortable-table.tsx`
- Test: `web/lib/sort.test.ts`

**Interfaces:**
- Consumes: `StateCell` from `lib/types.ts`.
- Produces:
  - `lib/sort.ts`: `type SortDir = 1 | -1`, `interface Tiered { tier: 0 | 1 | 2; v: number }`, `type SortValue = string | number | null | undefined | Tiered`, `tiered(cell: StateCell): Tiered`, `compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number`
  - `components/sortable-table.tsx`: `interface SortColumn<K extends string> { key: K; label: string; align?: "right"; tip?: string; sortable?: boolean }`, `useTableSort<T, K extends string>(rows, value, initialKey, initialDir?)` returning `{ sorted, sortKey, sortDir, toggle }`, `SortableHeader<K>({ columns, sortKey, sortDir, onSort })`

- [ ] **Step 1: Write the failing test**

`web/lib/sort.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { compareSortValues, tiered, type SortValue } from "./sort"

function order(values: SortValue[], dir: 1 | -1): SortValue[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => compareSortValues(a.v, b.v, dir) || a.i - b.i)
    .map((x) => x.v)
}

describe("tiered mirrors pipeline rank_value", () => {
  it("measured is tier 2, bounded tier 1 on upper, unmeasured tier 0", () => {
    expect(tiered({ state: "ok", value: 15000 })).toEqual({ tier: 2, v: 15000 })
    expect(tiered({ state: "bounded", value: null, upper: 50000 })).toEqual({ tier: 1, v: 50000 })
    expect(tiered({ state: "building", value: null, have: 1, need: 90 })).toEqual({ tier: 0, v: 0 })
    expect(tiered({ state: "insufficient_data", value: null })).toEqual({ tier: 0, v: 0 })
  })
})

describe("compareSortValues: ok > bounded > unmeasured in BOTH directions", () => {
  const okBig = { tier: 2, v: 15000 } as const
  const okSmall = { tier: 2, v: 180 } as const
  const boundedBig = { tier: 1, v: 50000 } as const
  const boundedSmall = { tier: 1, v: 500 } as const

  it("descending", () => {
    expect(order([null, boundedSmall, okSmall, boundedBig, okBig], -1)).toEqual([
      okBig,
      okSmall,
      boundedBig,
      boundedSmall,
      null,
    ])
  })

  it("ascending still keeps bounded under ok and unmeasured last", () => {
    expect(order([null, boundedSmall, okSmall, boundedBig, okBig], 1)).toEqual([
      okSmall,
      okBig,
      boundedSmall,
      boundedBig,
      null,
    ])
  })

  it("null, undefined and NaN all sort last both ways", () => {
    expect(order([null, 5, undefined, 3, NaN], -1)).toEqual([5, 3, null, undefined, NaN])
    expect(order([null, 5, undefined, 3, NaN], 1)).toEqual([3, 5, null, undefined, NaN])
  })

  it("plain numbers and strings still sort", () => {
    expect(order([2, 9, 4], -1)).toEqual([9, 4, 2])
    expect(order(["b", "a", "c"], 1)).toEqual(["a", "b", "c"])
  })

  it("ties are stable (comparator returns 0)", () => {
    expect(compareSortValues(5, 5, -1)).toBe(0)
    expect(compareSortValues(null, undefined, -1)).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/sort.test.ts`
Expected: FAIL with `Cannot find module './sort'`.

- [ ] **Step 3: Implement the comparator**

`web/lib/sort.ts`:

```ts
// Three-way table ordering. The pipeline decided the states (growth.py
// rank_value: measured 2, bounded 1, unmeasured 0); the web side only
// consumes them. Tiers never flip with sort direction: reversing a plain key
// would put the unmeasured rows first, which is exactly the lie the
// INSUFFICIENT_DATA rule forbids.
import type { StateCell } from "./types"

export type SortDir = 1 | -1

export interface Tiered {
  tier: 0 | 1 | 2
  v: number
}

export type SortValue = string | number | null | undefined | Tiered

export function tiered(cell: StateCell): Tiered {
  if (cell.state === "ok") return { tier: 2, v: cell.value ?? 0 }
  if (cell.state === "bounded") return { tier: 1, v: cell.upper ?? 0 }
  return { tier: 0, v: 0 }
}

function resolve(v: SortValue): { tier: number; v: number | string } {
  if (v === null || v === undefined) return { tier: 0, v: 0 }
  if (typeof v === "number") return Number.isNaN(v) ? { tier: 0, v: 0 } : { tier: 2, v }
  if (typeof v === "string") return { tier: 2, v }
  return v
}

/** Negative when a sorts before b. dir orders only within a tier. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ra = resolve(a)
  const rb = resolve(b)
  if (ra.tier !== rb.tier) return rb.tier - ra.tier
  if (ra.tier === 0) return 0
  if (ra.v < rb.v) return -dir
  if (ra.v > rb.v) return dir
  return 0
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/sort.test.ts`
Expected: PASS.

- [ ] **Step 5: The table component**

`web/components/sortable-table.tsx` (ported shape: hook + header; `<colgroup>` dropped since the plain-CSS tables size themselves; native `title=` replaces the Radix tooltip; text glyphs replace lucide icons):

```tsx
"use client"

import { useCallback, useMemo, useState } from "react"
import { compareSortValues, type SortDir, type SortValue } from "@/lib/sort"

export interface SortColumn<K extends string> {
  key: K
  label: string
  align?: "right"
  /** hover explanation for headers that are not self-explanatory */
  tip?: string
  /** default true; set false for display-only columns */
  sortable?: boolean
}

/**
 * Shared table sort. Click header: desc first, click again: asc.
 * ok rows first, bounded under them, unmeasured last, in both directions.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  value: (row: T, key: K) => SortValue,
  initialKey: K,
  initialDir: SortDir = -1
) {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  const sorted = useMemo(() => {
    const indexed = rows.map((row, i) => ({ row, i, v: value(row, sortKey) }))
    indexed.sort((a, b) => compareSortValues(a.v, b.v, sortDir) || a.i - b.i)
    return indexed.map((x) => x.row)
  }, [rows, sortKey, sortDir, value])

  const toggle = useCallback(
    (key: K) => {
      if (key === sortKey) {
        setSortDir((d) => (d === -1 ? 1 : -1))
      } else {
        setSortKey(key)
        setSortDir(-1)
      }
    },
    [sortKey]
  )

  return { sorted, sortKey, sortDir, toggle }
}

export function SortableHeader<K extends string>({
  columns,
  sortKey,
  sortDir,
  onSort,
}: {
  columns: SortColumn<K>[]
  sortKey: K
  sortDir: SortDir
  onSort: (key: K) => void
}) {
  return (
    <thead>
      <tr>
        {columns.map((col) => {
          const active = col.key === sortKey
          const sortable = col.sortable !== false
          const ariaSort = !sortable
            ? undefined
            : active
              ? sortDir === -1
                ? ("descending" as const)
                : ("ascending" as const)
              : ("none" as const)
          const arrow = !sortable ? "" : active ? (sortDir === -1 ? " ▾" : " ▴") : " ↕"
          return (
            <th
              key={col.key}
              aria-sort={ariaSort}
              className={col.align === "right" ? "r" : undefined}
              title={col.tip}
            >
              {sortable ? (
                <button type="button" className="thsort" onClick={() => onSort(col.key)}>
                  {col.label}
                  {arrow}
                </button>
              ) : (
                col.label
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
```

- [ ] **Step 6: Full suite green, commit**

Run: `cd web && npx vitest run`
Expected: PASS.

```bash
rtk git add web
rtk git commit -m "feat(web): sortable-table port with three-way ok/bounded/unmeasured comparator"
```
---

### Task 5: Growth card grid + cold-start callout

Home panel 1, wireframe home-B: ghost rank numerals, medal chips on the top 3, bucket chip beside every delta, bounded cards explain their floor, and the whole panel collapses to `building, N of M days` when no channel is measurable (which is the live state today).

**Files:**
- Create: `web/lib/growth.ts`
- Create: `web/components/sparkline.tsx`
- Create: `web/components/building-callout.tsx`
- Create: `web/components/growth-card.tsx`
- Create: `web/components/growth-panel.tsx`
- Test: `web/lib/growth.test.ts`

**Interfaces:**
- Consumes: `tiered` not needed here; `deltaText`, `pctText`, `bucketText`, `fmtInt`, `initials` from `lib/trust.ts`; `Derived`, `Chip` from `components/trust.tsx`; types from `lib/types.ts`.
- Produces:
  - `lib/growth.ts`: `type SlimChannel` (the exact client payload), `slimChannel(row: ChannelRow): SlimChannel`, `interface CardModel`, `cardModel(row: SlimChannel, window: WindowKey, mode: RankMode, spark: number[]): CardModel`, `rankedChannels(channels: SlimChannel[], mode: RankMode, window: WindowKey): SlimChannel[]`, `panelBuilding(channels: SlimChannel[], window: WindowKey): { have: number; need: number } | null`, `sparkAll(snapshots: SnapshotsBundle, channelId: string): number[]`
  - `components/growth-panel.tsx`: `GrowthPanel({ channels, sparks }: { channels: SlimChannel[]; sparks: Record<string, number[]> })` (client component with mode/window/niche state)

- [ ] **Step 1: Write the failing test**

`web/lib/growth.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadChannels, loadSnapshots } from "./bundles"
import { cardModel, panelBuilding, rankedChannels, slimChannel, sparkAll } from "./growth"
import type { SlimChannel } from "./growth"
import type { StateCell, WindowKey } from "./types"

const W: WindowKey = "90d"

function cell(partial: Partial<StateCell> & { state: StateCell["state"] }): StateCell {
  return { value: null, ...partial }
}

function chan(over: Partial<SlimChannel>): SlimChannel {
  const windows = { "7d": 0, "14d": 0, "30d": 0, "90d": 0, "180d": 0, "365d": 0 }
  const cells = Object.fromEntries(
    Object.keys(windows).map((w) => [w, cell({ state: "building", have: 1, need: 90 })])
  ) as Record<WindowKey, StateCell>
  return {
    channel_id: "c1",
    name: "Test Channel",
    handle: "test",
    is_self: false,
    status: "ok",
    category: "ai-creator",
    niche: null,
    subscriber_bucket: 1000,
    subscriber_count: 219000,
    view_count: 1000000,
    video_count: 100,
    rank: {
      growth: { ...windows, "90d": 1 },
      general: { ...windows, "90d": 1 },
      subscribers: { ...windows, "90d": 1 },
      views: { ...windows, "90d": 1 },
    },
    subscriber_delta: { ...cells },
    subscriber_growth_rate: { ...cells },
    subs_per_1k_views: { ...cells },
    view_delta: { ...cells },
    videos_published: { "30d": 12 },
    median_views_per_video: { "30d": 25246 },
    ...over,
  }
}

describe("rankedChannels", () => {
  it("orders by the mode's rank, absent channels excluded, null ranks last", () => {
    const a = chan({ channel_id: "a", rank: rankAt(2) })
    const b = chan({ channel_id: "b", rank: rankAt(1) })
    const gone = chan({ channel_id: "gone", status: "absent" })
    const unranked = chan({ channel_id: "u", rank: rankAt(null) })
    const out = rankedChannels([a, gone, unranked, b], "growth", W)
    expect(out.map((c) => c.channel_id)).toEqual(["b", "a", "u"])
  })
})

function rankAt(n: number | null) {
  const windows = {
    "7d": null,
    "14d": null,
    "30d": null,
    "90d": n,
    "180d": null,
    "365d": null,
  }
  return { growth: windows, general: windows, subscribers: windows, views: windows }
}

describe("panelBuilding: the cold-start default", () => {
  it("fires when no channel has a measured or bounded growth cell", () => {
    const out = panelBuilding([chan({}), chan({ channel_id: "c2" })], W)
    expect(out).toEqual({ have: 1, need: 90 })
  })
  it("stands down as soon as one channel is measurable", () => {
    const warm = chan({
      channel_id: "warm",
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "ok", value: 0.074 }),
      },
    })
    expect(panelBuilding([chan({}), warm], W)).toBeNull()
  })
  it("a bounded fleet is measurable, not building", () => {
    const bounded = chan({
      subscriber_growth_rate: {
        ...chan({}).subscriber_growth_rate,
        "90d": cell({ state: "bounded", upper: 0.02 }),
      },
    })
    expect(panelBuilding([bounded], W)).toBeNull()
  })
})

describe("cardModel", () => {
  it("carries the window cells and the 30d stats verbatim", () => {
    const m = cardModel(chan({}), W, "growth", [1, 2, 3])
    expect(m.rank).toBe(1)
    expect(m.growth.state).toBe("building")
    expect(m.bucket).toBe(1000)
    expect(m.videos30d).toBe(12)
    expect(m.medianViews30d).toBe(25246)
    expect(m.spark).toEqual([1, 2, 3])
  })
})

describe("against the real bundles", () => {
  it("slims and models all channels without throwing", () => {
    const channels = loadChannels().channels.map(slimChannel)
    const snapshots = loadSnapshots()
    for (const c of rankedChannels(channels, "growth", W).slice(0, 5)) {
      const spark = sparkAll(snapshots, c.channel_id)
      const m = cardModel(c, W, "growth", spark)
      expect(typeof m.name).toBe("string")
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/growth.test.ts`
Expected: FAIL with `Cannot find module './growth'`.

- [ ] **Step 3: Implement the lib**

`web/lib/growth.ts`:

```ts
// Card models for home panel 1. Pure and client-safe: the server slims the
// channel rows and precomputes sparkline series; this module never touches fs.
import type {
  ChannelRow,
  RankMode,
  SnapshotsBundle,
  StateCell,
  WindowKey,
} from "./types"

export type SlimChannel = Pick<
  ChannelRow,
  | "channel_id"
  | "name"
  | "handle"
  | "is_self"
  | "status"
  | "category"
  | "niche"
  | "subscriber_bucket"
  | "subscriber_count"
  | "view_count"
  | "video_count"
  | "rank"
  | "subscriber_delta"
  | "subscriber_growth_rate"
  | "subs_per_1k_views"
  | "view_delta"
  | "videos_published"
  | "median_views_per_video"
>

export function slimChannel(row: ChannelRow): SlimChannel {
  return {
    channel_id: row.channel_id,
    name: row.name,
    handle: row.handle,
    is_self: row.is_self,
    status: row.status,
    category: row.category,
    niche: row.niche,
    subscriber_bucket: row.subscriber_bucket,
    subscriber_count: row.subscriber_count,
    view_count: row.view_count,
    video_count: row.video_count,
    rank: row.rank,
    subscriber_delta: row.subscriber_delta,
    subscriber_growth_rate: row.subscriber_growth_rate,
    subs_per_1k_views: row.subs_per_1k_views,
    view_delta: row.view_delta,
    videos_published: row.videos_published,
    median_views_per_video: row.median_views_per_video,
  }
}

export interface CardModel {
  rank: number | null
  channel_id: string
  name: string
  handle: string
  is_self: boolean
  growth: StateCell
  delta: StateCell
  subsPer1k: StateCell
  bucket: number | null
  videos30d: number | null
  medianViews30d: number | null
  spark: number[]
}

export function cardModel(
  row: SlimChannel,
  window: WindowKey,
  mode: RankMode,
  spark: number[]
): CardModel {
  return {
    rank: row.rank[mode][window],
    channel_id: row.channel_id,
    name: row.name,
    handle: row.handle,
    is_self: row.is_self,
    growth: row.subscriber_growth_rate[window],
    delta: row.subscriber_delta[window],
    subsPer1k: row.subs_per_1k_views[window],
    bucket: row.subscriber_bucket,
    videos30d: row.videos_published["30d"] ?? null,
    medianViews30d: row.median_views_per_video["30d"] ?? null,
    spark,
  }
}

/** Absent channels never rank; null ranks sort after every numbered rank. */
export function rankedChannels(
  channels: SlimChannel[],
  mode: RankMode,
  window: WindowKey
): SlimChannel[] {
  return channels
    .filter((c) => c.status === "ok")
    .slice()
    .sort(
      (a, b) =>
        (a.rank[mode][window] ?? Number.POSITIVE_INFINITY) -
        (b.rank[mode][window] ?? Number.POSITIVE_INFINITY)
    )
}

/** Whole-panel cold start: nothing measured, nothing bounded, so the grid
 *  would be five building cards. Render one callout instead. */
export function panelBuilding(
  channels: SlimChannel[],
  window: WindowKey
): { have: number; need: number } | null {
  const cells = channels
    .filter((c) => c.status === "ok")
    .map((c) => c.subscriber_growth_rate[window])
  if (cells.length === 0) return null
  if (cells.some((c) => c.state === "ok" || c.state === "bounded")) return null
  const building = cells.find((c) => c.state === "building")
  return { have: building?.have ?? 0, need: building?.need ?? 0 }
}

/** Full subscriber-count series for one channel; the client slices per window. */
export function sparkAll(snapshots: SnapshotsBundle, channelId: string): number[] {
  const series = snapshots.channels[channelId]?.series ?? []
  return series
    .filter((d) => d.status === "ok" && d.subscriber_count !== null)
    .map((d) => d.subscriber_count as number)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/growth.test.ts`
Expected: PASS.

- [ ] **Step 5: The components**

`web/components/sparkline.tsx`:

```tsx
/** Inline SVG sparkline. Fewer than 2 points renders nothing: a one-day
 *  history is not a trend, and faking a flat line would be a claim. */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 26 - ((p - min) / range) * 22
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
      <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
    </svg>
  )
}
```

`web/components/building-callout.tsx` (copy is the wireframe's cold-start box, verbatim):

```tsx
export function BuildingCallout({ have, need }: { have: number; need: number }) {
  return (
    <div className="callout warn">
      <b>
        building, {have} of {need} days
      </b>
      <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
        Growth needs a window of snapshots. You have {have} {have === 1 ? "day" : "days"}. Run the
        vidIQ backfill (360 credits) to buy 365 days of history and this fills in immediately.
      </p>
    </div>
  )
}
```

`web/components/growth-card.tsx`:

```tsx
import { bucketText, deltaText, fmtInt, initials, pctText } from "@/lib/trust"
import type { CardModel } from "@/lib/growth"
import { Chip, Derived } from "./trust"
import { Sparkline } from "./sparkline"

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export function GrowthCard({ card, window }: { card: CardModel; window: string }) {
  const g = card.growth
  const classes = ["gcard"]
  if (card.rank === 1) classes.push("top1")
  if (card.is_self) classes.push("youcard")
  const measurable = g.state === "ok" || g.state === "bounded"
  return (
    <div className={classes.join(" ")}>
      <span className="rank-numeral">{card.rank ?? "--"}</span>
      <div className="id">
        <span className="rank">{MEDALS[card.rank ?? 0] ?? `#${card.rank ?? "--"}`}</span>
        <span className={card.is_self ? "avatar av20 av-you" : "avatar av20"}>
          {initials(card.name)}
        </span>
        <div className="who">
          <b>
            {card.is_self ? "★ " : ""}
            {card.name}
          </b>
          <span>@{card.handle}</span>
        </div>
        {card.is_self && <Chip variant="you">YOU</Chip>}
      </div>
      <div className="hero">
        {measurable ? (
          <span className="n">
            <Derived formula={`subscriber delta ÷ subscribers at window start, ${window}`}>
              {pctText(g)}
            </Derived>
          </span>
        ) : (
          <span className="n muted">{pctText(g)}</span>
        )}
        <span className="u">subscriber growth {window}</span>
      </div>
      {measurable && (
        <>
          <div className="statline">
            <span className="v">
              <Derived formula="subscriber_count newest minus oldest in window">
                {deltaText(card.delta)}
              </Derived>
            </span>{" "}
            subs <Chip>{bucketText(card.bucket)}</Chip>
          </div>
          <div className="statline">
            <span className="v">
              <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
                {card.subsPer1k.state === "ok"
                  ? (card.subsPer1k.value ?? 0).toFixed(1)
                  : deltaText(card.subsPer1k)}
              </Derived>
            </span>{" "}
            subs / 1k views
          </div>
          <div className="statline">
            {card.videos30d ?? "--"} videos ·{" "}
            {card.medianViews30d !== null ? fmtInt(card.medianViews30d) : "--"} med · 30d
          </div>
          {g.state === "bounded" ? (
            <p className="note">
              below this channel&apos;s floor: bucket {bucketText(card.bucket)}, so anything under{" "}
              {deltaText(card.delta).replace("< ", "")} cannot be measured
            </p>
          ) : (
            <Sparkline points={card.spark} />
          )}
        </>
      )}
      <div className="gfoot">
        <span>{window}</span>
        <span>{bucketText(card.bucket)}</span>
      </div>
    </div>
  )
}
```

The bounded caption reuses `deltaText(card.delta)` (which reads `< 50,000` for a bounded subscriber delta) and strips the `< ` prefix, so the floor amount is stated once and cannot drift from the cell that carries it.

`web/components/growth-panel.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES, WINDOWS } from "@/lib/types"
import { cardModel, panelBuilding, rankedChannels, type SlimChannel } from "@/lib/growth"
import { BuildingCallout } from "./building-callout"
import { GrowthCard } from "./growth-card"

export function GrowthPanel({
  channels,
  sparks,
}: {
  channels: SlimChannel[]
  sparks: Record<string, number[]>
}) {
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>("90d")
  const [niche, setNiche] = useState<string>("all")

  const niches = useMemo(
    () =>
      [...new Set(channels.map((c) => c.niche).filter((n): n is string => n !== null))].sort(),
    [channels]
  )
  const pool = niche === "all" ? channels : channels.filter((c) => c.niche === niche)
  const building = panelBuilding(pool, win)
  const ranked = rankedChannels(pool, mode, win)
  const top5 = ranked.slice(0, 5)
  const self = ranked.find((c) => c.is_self)
  const selfRank = self?.rank[mode][win] ?? null
  const windowDays = parseInt(win, 10)

  return (
    <>
      <div className="controls">
        <div className="tabs">
          {RANK_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? "on" : undefined}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="tabs">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === win ? "on" : undefined}
              onClick={() => setWin(w)}
            >
              {w}
            </button>
          ))}
        </div>
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          title={niches.length === 0 ? "no niche data in this build yet" : undefined}
        >
          <option value="all">all niches</option>
          {niches.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      {building ? (
        <BuildingCallout have={building.have} need={building.need} />
      ) : (
        <>
          <div className="cardgrid">
            {top5.map((c) => (
              <GrowthCard
                key={c.channel_id}
                card={cardModel(c, win, mode, (sparks[c.channel_id] ?? []).slice(-windowDays))}
                window={win}
              />
            ))}
          </div>
          {self && selfRank !== null && selfRank > 5 && (
            <p className="note">
              ⓘ You are #{selfRank}. Your card sits at its true rank on{" "}
              <a href="/leaderboard">/leaderboard</a>.
            </p>
          )}
        </>
      )}
    </>
  )
}
```

- [ ] **Step 6: Full suite green, commit**

Run: `cd web && npx vitest run`
Expected: PASS.

```bash
rtk git add web
rtk git commit -m "feat(web): growth card grid with bounded and cold-start states"
```
---

### Task 6: Opportunity table with expandable derivations

Home panel 2: sortable, formula printed above as the definition, `--` sorts last both ways, `x / 75` inline, rows expand into the full component breakdown with `fired` conditions and repo evidence, suppression is a toggle never a deletion.

**Files:**
- Create: `web/lib/opportunity.ts`
- Create: `web/components/avatar-cluster.tsx`
- Create: `web/components/opportunity-table.tsx`
- Test: `web/lib/opportunity.test.ts`

**Interfaces:**
- Consumes: `useTableSort`, `SortableHeader`, `SortColumn` from `components/sortable-table.tsx`; `Tiered` from `lib/sort.ts`; `scoreText`, `agoText`, `fmtInt`, `fmtDate`, `initials`, `VERDICT_RANK` from `lib/trust.ts`; `Derived`, `VerdictBadge`, `Chip` from `components/trust.tsx`.
- Produces:
  - `lib/opportunity.ts`: `interface CreatorRef { channel_id: string; name: string; is_self: boolean }`, `interface OppRowModel { row: OpportunityRow; label: string; newest_video_at: string | null; creators: CreatorRef[] }`, `oppRowModels(rows, topics, channels, videosFor): OppRowModel[]`, `scoreSortValue(row: OpportunityRow): Tiered`
  - `components/avatar-cluster.tsx`: `AvatarCluster({ creators, max? })`
  - `components/opportunity-table.tsx`: `OpportunityTable({ models }: { models: OppRowModel[] })` (client)

- [ ] **Step 1: Write the failing test**

`web/lib/opportunity.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadChannels, loadOpportunities, loadTopicPages, videosById } from "./bundles"
import { oppRowModels, scoreSortValue } from "./opportunity"
import type { OpportunityRow } from "./types"

function oppRow(over: Partial<OpportunityRow>): OpportunityRow {
  return {
    topic_id: "t1",
    verdict: "SKIP",
    shape: "tutorial",
    hunch: false,
    score: { components: [], out_of: 75, value: 40.3 },
    demand: { band: "HIGH", fired: [], repo_velocity: 1, keyword_volume: null },
    supply: { band: "CROWDED", fired: [], videos: 10, creators: 4, window_days: 90 },
    evidence: [],
    own_coverage: { covered: false, suppressed: false, video_id: null, published_at: null },
    trust: {},
    ...over,
  }
}

describe("scoreSortValue", () => {
  it("a scored row is measured tier", () => {
    expect(scoreSortValue(oppRow({}))).toEqual({ tier: 2, v: 40.3 })
  })
  it("INSUFFICIENT_DATA is tier 0: sorts last in both directions, never zero", () => {
    const r = oppRow({ verdict: "INSUFFICIENT_DATA", score: { components: [], out_of: null, value: null } })
    expect(scoreSortValue(r)).toEqual({ tier: 0, v: 0 })
  })
})

describe("oppRowModels against the real bundles", () => {
  const models = oppRowModels(
    loadOpportunities().rows,
    loadTopicPages().topics,
    loadChannels().channels,
    videosById
  )

  it("models every row with a label", () => {
    expect(models.length).toBe(loadOpportunities().rows.length)
    for (const m of models) {
      expect(typeof m.label).toBe("string")
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it("creators come from the topic's videos, deduplicated", () => {
    const withCreators = models.find((m) => m.creators.length > 0)
    if (!withCreators) throw new Error("no opportunity row with creators in _db/")
    const ids = withCreators.creators.map((c) => c.channel_id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of withCreators.creators) {
      expect(typeof c.name).toBe("string")
      expect(typeof c.is_self).toBe("boolean")
    }
  })

  it("suppressed covered rows exist in the models: suppression is a filter, not a deletion", () => {
    const suppressed = models.filter((m) => m.row.own_coverage.suppressed)
    expect(suppressed.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/opportunity.test.ts`
Expected: FAIL with `Cannot find module './opportunity'`.

- [ ] **Step 3: Implement the lib**

`web/lib/opportunity.ts`:

```ts
// Row models for the opportunity table. The "who's on it" cluster is derived
// server-side from the topic's video_ids so videos.json never reaches the
// client; the client receives only names.
import type { ChannelRow, LeafTopicPage, OpportunityRow, TopicPage, VideoRow } from "./types"
import type { Tiered } from "./sort"

export interface CreatorRef {
  channel_id: string
  name: string
  is_self: boolean
}

export interface OppRowModel {
  row: OpportunityRow
  label: string
  newest_video_at: string | null
  creators: CreatorRef[]
}

/** null score is tier 0: -- sorts last in BOTH directions, never zero. */
export function scoreSortValue(row: OpportunityRow): Tiered {
  return row.score.value === null ? { tier: 0, v: 0 } : { tier: 2, v: row.score.value }
}

export function oppRowModels(
  rows: OpportunityRow[],
  topics: TopicPage[],
  channels: ChannelRow[],
  videosFor: (ids: string[]) => VideoRow[]
): OppRowModel[] {
  const topicById = new Map(topics.map((t) => [t.topic_id, t]))
  const channelById = new Map(channels.map((c) => [c.channel_id, c]))
  return rows.map((row) => {
    const topic = topicById.get(row.topic_id)
    const leaf = topic && topic.is_leaf ? (topic as LeafTopicPage) : null
    const counts = new Map<string, number>()
    if (leaf) {
      for (const v of videosFor(leaf.video_ids)) {
        counts.set(v.channel_id, (counts.get(v.channel_id) ?? 0) + 1)
      }
    }
    const creators: CreatorRef[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([id]) => {
        const c = channelById.get(id)
        return c ? [{ channel_id: id, name: c.name, is_self: c.is_self }] : []
      })
    return {
      row,
      label: topic?.label ?? row.topic_id,
      newest_video_at: leaf?.newest_video_at ?? null,
      creators,
    }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/opportunity.test.ts`
Expected: PASS.

- [ ] **Step 5: Avatar cluster**

`web/components/avatar-cluster.tsx` (initials only; the avatar image files were never built):

```tsx
import { initials } from "@/lib/trust"
import type { CreatorRef } from "@/lib/opportunity"

export function AvatarCluster({ creators, max = 7 }: { creators: CreatorRef[]; max?: number }) {
  if (creators.length === 0) return <span className="muted">--</span>
  const shown = creators.slice(0, max)
  return (
    <span className="avcluster">
      {shown.map((c) => (
        <span
          key={c.channel_id}
          className={c.is_self ? "avatar av18 av-you" : "avatar av18"}
          title={c.name}
        >
          {initials(c.name)}
        </span>
      ))}
      {creators.length > max && <span className="chip">+{creators.length - max}</span>}
    </span>
  )
}
```

- [ ] **Step 6: The table**

`web/components/opportunity-table.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { OppRowModel } from "@/lib/opportunity"
import { scoreSortValue } from "@/lib/opportunity"
import type { SortValue } from "@/lib/sort"
import type { OpportunityRow, Verdict } from "@/lib/types"
import { agoText, fmtDate, fmtInt, scoreText, VERDICT_RANK } from "@/lib/trust"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { AvatarCluster } from "./avatar-cluster"
import { Chip, Derived, VerdictBadge } from "./trust"

type Key = "topic" | "verdict" | "who" | "score" | "newest"

const COLUMNS: SortColumn<Key>[] = [
  { key: "topic", label: "topic" },
  { key: "verdict", label: "verdict", tip: "demand band × supply band; expand a row for what fired" },
  { key: "who", label: "who's on it", sortable: false },
  {
    key: "score",
    label: "score",
    align: "right",
    tip: "score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness; -- sorts last both ways",
  },
  { key: "newest", label: "newest", align: "right", tip: "days since the newest video on this topic" },
]

const VERDICTS: Verdict[] = [
  "MAKE_THIS_NOW",
  "ONLY_IF_UNSERVED",
  "TOO_EARLY",
  "SKIP",
  "INSUFFICIENT_DATA",
]

export function OpportunityTable({ models }: { models: OppRowModel[] }) {
  const [hideCovered, setHideCovered] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState<"all" | Verdict>("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      models.filter((m) => {
        if (hideCovered && m.row.own_coverage.suppressed) return false
        if (verdictFilter !== "all" && m.row.verdict !== verdictFilter) return false
        return true
      }),
    [models, hideCovered, verdictFilter]
  )

  const { sorted, sortKey, sortDir, toggle } = useTableSort<OppRowModel, Key>(
    filtered,
    (m, key): SortValue => {
      switch (key) {
        case "topic":
          return m.label.toLowerCase()
        case "verdict":
          return VERDICT_RANK[m.row.verdict]
        case "who":
          return null
        case "score":
          return scoreSortValue(m.row)
        case "newest":
          return m.newest_video_at ? new Date(m.newest_video_at).getTime() : null
      }
    },
    "score"
  )

  return (
    <>
      <div className="controls">
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value as "all" | Verdict)}
        >
          <option value="all">all verdicts</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={hideCovered}
            onChange={(e) => setHideCovered(e.target.checked)}
          />{" "}
          hide covered
        </label>
      </div>
      <table className="tbl">
        <SortableHeader columns={COLUMNS} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
        <tbody>
          {sorted.map((m) => (
            <Row
              key={m.row.topic_id}
              model={m}
              expanded={expanded === m.row.topic_id}
              onToggle={() =>
                setExpanded(expanded === m.row.topic_id ? null : m.row.topic_id)
              }
            />
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="empty">no rows match these filters</div>}
    </>
  )
}

function Row({
  model,
  expanded,
  onToggle,
}: {
  model: OppRowModel
  expanded: boolean
  onToggle: () => void
}) {
  const r = model.row
  return (
    <>
      <tr className="rowlink" onClick={onToggle}>
        <td>
          <Link href={`/topics/${r.topic_id}`} onClick={(e) => e.stopPropagation()}>
            {r.topic_id}
          </Link>
          {r.hunch && (
            <>
              {" "}
              <Chip>hunch</Chip>
            </>
          )}
          {r.own_coverage.suppressed && (
            <>
              {" "}
              <Chip>covered</Chip>
            </>
          )}
        </td>
        <td>
          <VerdictBadge verdict={r.verdict} />
        </td>
        <td>
          <AvatarCluster creators={model.creators} />
        </td>
        <td className="r num">
          <Derived formula="score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness">
            {scoreText(r.score)}
          </Derived>
        </td>
        <td className="r num">{agoText(model.newest_video_at)}</td>
      </tr>
      {expanded && (
        <tr className="sub">
          <Derivation row={r} />
        </tr>
      )}
    </>
  )
}

function Derivation({ row }: { row: OpportunityRow }) {
  const fired = [...row.demand.fired, ...row.supply.fired]
  return (
    <td colSpan={5}>
      <table className="tbl">
        <thead>
          <tr>
            <th>component</th>
            <th className="r">raw</th>
            <th className="r">norm</th>
            <th className="r">wt</th>
            <th className="r">points</th>
            <th>source</th>
          </tr>
        </thead>
        <tbody>
          {row.score.components.map((c) => (
            <tr key={c.key}>
              <td>{c.key.replace(/_/g, " ")}</td>
              {c.state === "ok" ? (
                <>
                  <td className="r num">{c.raw_label ?? String(c.raw)}</td>
                  <td className="r num">{c.norm?.toFixed(2)}</td>
                  <td className="r num">{c.weight}</td>
                  <td className="r num">{c.points?.toFixed(1)}</td>
                </>
              ) : (
                <>
                  <td className="r muted" colSpan={3}>
                    no data, weight excluded
                  </td>
                  <td className="r muted">--</td>
                </>
              )}
              <td className="muted">{c.source}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="r">
              <b className="num">{scoreText(row.score)}</b>
            </td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      {fired.length > 0 && <p className="note num">fired: {fired.join(" · ")}</p>}
      {row.evidence.map((e) => (
        <p className="note num" key={e.github_id}>
          repo:{" "}
          <a href={`https://github.com/${e.full_name}`} target="_blank" rel="noreferrer">
            {e.full_name}
          </a>{" "}
          {fmtInt(e.stars)}★ {e.age_days}d{" "}
          <Derived formula="stars ÷ max(age_days, 1)">{e.velocity.toFixed(0)} stars/day</Derived>{" "}
          <Derived formula="owner type and contributor count; scores, never filters">
            indie {e.indie.score.toFixed(2)} · {e.indie.owner_type} · {e.indie.contributors}{" "}
            contributors
          </Derived>
        </p>
      ))}
      {row.own_coverage.covered && (
        <p className="note">
          you covered this:{" "}
          <a
            href={`https://www.youtube.com/watch?v=${row.own_coverage.video_id}`}
            target="_blank"
            rel="noreferrer"
          >
            {row.own_coverage.video_id}
          </a>{" "}
          on {fmtDate(row.own_coverage.published_at)}
          {row.own_coverage.suppressed && " · suppressed from the default view"}
        </p>
      )}
    </td>
  )
}
```

- [ ] **Step 7: Full suite green, commit**

Run: `cd web && npx vitest run`
Expected: PASS.

```bash
rtk git add web
rtk git commit -m "feat(web): opportunity table with expandable derivations and suppression toggle"
```

---

### Task 7: Home page assembly

**Files:**
- Modify: `web/app/page.tsx` (replace the Task 2 interim page entirely)

**Interfaces:**
- Consumes: `loadChannels`, `loadMeta`, `loadOpportunities`, `loadSnapshots`, `loadTopicPages`, `videosById` from `lib/bundles.ts`; `slimChannel`, `sparkAll` from `lib/growth.ts`; `oppRowModels` from `lib/opportunity.ts`; `GrowthPanel`, `OpportunityTable`.
- Produces: the `/` route. No later task depends on its internals.

- [ ] **Step 1: Replace the page**

`web/app/page.tsx`:

```tsx
import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadSnapshots,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { slimChannel, sparkAll } from "@/lib/growth"
import { oppRowModels } from "@/lib/opportunity"
import { GrowthPanel } from "@/components/growth-panel"
import { OpportunityTable } from "@/components/opportunity-table"

export default function HomePage() {
  const meta = loadMeta()
  const channels = loadChannels().channels
  const snapshots = loadSnapshots()
  const slim = channels.map(slimChannel)
  const sparks = Object.fromEntries(
    slim.map((c) => [c.channel_id, sparkAll(snapshots, c.channel_id)])
  )
  const models = oppRowModels(
    loadOpportunities().rows,
    loadTopicPages().topics,
    channels,
    videosById
  )

  return (
    <div className="vb">
      <section>
        <div className="section-kicker">
          <span className="kicker bigsec">WHO IS GROWING</span>
          <span className="rule" />
          <a className="cap" href="/leaderboard">
            see all {meta.channels.total} →
          </a>
        </div>
        <p className="note">
          ranked by subscriber growth rate · below a channel&apos;s measurement floor renders
          &quot;&lt; N&quot;
        </p>
        <GrowthPanel channels={slim} sparks={sparks} />
      </section>
      <section>
        <div className="section-kicker">
          <span className="kicker bigsec">WHAT TO MAKE NEXT</span>
          <span className="rule" />
          <span className="cap num">score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness</span>
        </div>
        <OpportunityTable models={models} />
      </section>
    </div>
  )
}
```

The `vb` wrapper opts the home page into the locked gamified B personality (`.vb .bigsec` section titles); every other route stays on the dense A default.

- [ ] **Step 2: Boot and verify against live data**

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s http://localhost:3002/ > /tmp/ait-home.html
grep -c "WHO IS GROWING" /tmp/ait-home.html
grep -c "WHAT TO MAKE NEXT" /tmp/ait-home.html
grep -c "building, 1 of 90 days" /tmp/ait-home.html
grep -c "score = 40·velocity" /tmp/ait-home.html
grep -c "/ 75" /tmp/ait-home.html
kill "$(cat /tmp/ait-web-dev.pid)"
```

Expected: every grep prints at least `1`. The third grep proves the cold-start callout is the real first render; the fifth proves `x / 75` renders inline on live rows (keyword axis has no data today). If `snapshot_health.days_present` has advanced past 1 by execution time, adjust the third grep to `building, ` and expect at least 1 only if the panel still reads building; when the fleet has warmed the grid renders instead, and the correct check is `grep -c "gcard"` ≥ 5.

- [ ] **Step 3: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): home page with top-5 grid and opportunity table"
```
---

### Task 8: `/leaderboard`, the full 72

Wireframe leaderboard-A: dense table, all columns, four rank modes, window selector, category toggles, bounded rows render `< N` and sort below every `ok` row, absent channels render `--` across every column and sort last.

**Files:**
- Create: `web/components/leaderboard-table.tsx`
- Create: `web/app/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `SlimChannel`, `slimChannel` from `lib/growth.ts`; `tiered`, `SortValue` from `lib/sort.ts`; `useTableSort`, `SortableHeader`, `SortColumn` from `components/sortable-table.tsx`; `deltaText`, `pctText`, `compactM`, `bucketText`, `fmtInt`, `initials` from `lib/trust.ts`; `Derived`, `Chip` from `components/trust.tsx`; `loadChannels` from `lib/bundles.ts`.
- Produces: the `/leaderboard` route. No later task depends on its internals.

- [ ] **Step 1: The client table**

`web/components/leaderboard-table.tsx`:

```tsx
"use client"

import { useCallback, useMemo, useState } from "react"
import type { SlimChannel } from "@/lib/growth"
import { tiered, type SortValue } from "@/lib/sort"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES, WINDOWS } from "@/lib/types"
import { bucketText, compactM, deltaText, fmtInt, initials, pctText } from "@/lib/trust"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import { Chip, Derived } from "./trust"

type Key = "rank" | "channel" | "subs" | "dsubs" | "growth" | "dviews" | "per1k" | "vids"

const CATS = ["ai-creator", "company", "adjacent", "unknown"] as const
type Cat = (typeof CATS)[number]

export function LeaderboardTable({ channels }: { channels: SlimChannel[] }) {
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>("90d")
  const [niche, setNiche] = useState<string>("all")
  const [cats, setCats] = useState<Set<Cat>>(new Set(CATS))

  const columns: SortColumn<Key>[] = [
    { key: "rank", label: "#", tip: `rank by ${mode}, ${win}` },
    { key: "channel", label: "channel" },
    { key: "subs", label: "subs", align: "right" },
    {
      key: "dsubs",
      label: `Δsubs ${win}`,
      align: "right",
      tip: "subscriber_count newest minus oldest in window; bucket width always shown",
    },
    { key: "growth", label: "growth", align: "right", tip: "subscriber delta ÷ subscribers at window start" },
    { key: "dviews", label: "views Δ", align: "right", tip: "view_count newest minus oldest in window" },
    { key: "per1k", label: "subs/1k", align: "right", tip: "subscriber delta ÷ (view delta ÷ 1000)" },
    { key: "vids", label: "vids", align: "right", tip: "videos published, 30d only; other windows not computed yet" },
  ]

  const niches = useMemo(
    () =>
      [...new Set(channels.map((c) => c.niche).filter((n): n is string => n !== null))].sort(),
    [channels]
  )

  const filtered = useMemo(
    () =>
      channels.filter((c) => {
        if (!c.is_self && c.category !== "own" && !cats.has(c.category as Cat)) return false
        if (niche !== "all" && c.niche !== niche) return false
        return true
      }),
    [channels, cats, niche]
  )

  const value = useCallback(
    (row: SlimChannel, key: Key): SortValue => {
      if (row.status === "absent") return null
      switch (key) {
        case "rank": {
          const r = row.rank[mode][win]
          return r === null ? null : -r
        }
        case "channel":
          return row.name.toLowerCase()
        case "subs":
          return row.subscriber_count
        case "dsubs":
          return tiered(row.subscriber_delta[win])
        case "growth":
          return tiered(row.subscriber_growth_rate[win])
        case "dviews":
          return tiered(row.view_delta[win])
        case "per1k":
          return tiered(row.subs_per_1k_views[win])
        case "vids":
          return row.videos_published["30d"]
      }
    },
    [mode, win]
  )

  const { sorted, sortKey, sortDir, toggle } = useTableSort<SlimChannel, Key>(
    filtered,
    value,
    "rank"
  )

  return (
    <>
      <div className="controls">
        <span className="note">rank by</span>
        <div className="tabs">
          {RANK_MODES.map((m) => (
            <button key={m} type="button" className={m === mode ? "on" : undefined} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <span className="note">window</span>
        <div className="tabs">
          {WINDOWS.map((w) => (
            <button key={w} type="button" className={w === win ? "on" : undefined} onClick={() => setWin(w)}>
              {w}
            </button>
          ))}
        </div>
        <select
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          title={niches.length === 0 ? "no niche data in this build yet" : undefined}
        >
          <option value="all">all niches</option>
          {niches.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        {CATS.map((cat) => (
          <label key={cat}>
            <input
              type="checkbox"
              checked={cats.has(cat)}
              onChange={(e) => {
                const next = new Set(cats)
                if (e.target.checked) next.add(cat)
                else next.delete(cat)
                setCats(next)
              }}
            />{" "}
            {cat}
          </label>
        ))}
      </div>
      <table className="tbl">
        <SortableHeader columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
        <tbody>
          {sorted.map((c) => (
            <LeaderRow key={c.channel_id} c={c} mode={mode} win={win} />
          ))}
        </tbody>
      </table>
    </>
  )
}

function LeaderRow({ c, mode, win }: { c: SlimChannel; mode: RankMode; win: WindowKey }) {
  if (c.status === "absent") {
    return (
      <tr>
        <td className="muted num">--</td>
        <td>
          <span className="avatar av20">{initials(c.name)}</span> {c.name}{" "}
          <Chip variant="warn">absent</Chip>
        </td>
        {Array.from({ length: 6 }, (_, i) => (
          <td key={i} className="r muted num">
            --
          </td>
        ))}
      </tr>
    )
  }
  const delta = c.subscriber_delta[win]
  const growth = c.subscriber_growth_rate[win]
  const views = c.view_delta[win]
  const per1k = c.subs_per_1k_views[win]
  return (
    <tr className={c.is_self ? "youcard" : undefined}>
      <td className="num">{c.rank[mode][win] ?? "--"}</td>
      <td>
        <span className={c.is_self ? "avatar av20 av-you" : "avatar av20"}>{initials(c.name)}</span>{" "}
        {c.name}
        {c.is_self && (
          <>
            {" ★ "}
            <Chip variant="you">YOU</Chip>
          </>
        )}
      </td>
      <td className="r num">{c.subscriber_count !== null ? fmtInt(c.subscriber_count) : "--"}</td>
      <td className="r num">
        <Derived formula={`subscriber_count newest minus oldest, ${win}; bucket ${bucketText(c.subscriber_bucket)}`}>
          {deltaText(delta)}
        </Derived>{" "}
        <span className="muted">{bucketText(c.subscriber_bucket)}</span>
      </td>
      <td className="r num">
        <Derived formula="subscriber delta ÷ subscribers at window start">{pctText(growth)}</Derived>
      </td>
      <td className="r num">
        {views.state === "ok" ? (
          <Derived formula={`view_count newest minus oldest, ${win}`}>
            {compactM(views.value ?? 0)}
          </Derived>
        ) : (
          <span className="muted">{deltaText(views)}</span>
        )}
      </td>
      <td className="r num">
        {per1k.state === "ok" ? (
          <Derived formula="subscriber delta ÷ (view delta ÷ 1000)">
            {(per1k.value ?? 0).toFixed(1)}
          </Derived>
        ) : (
          <span className="muted">{deltaText(per1k)}</span>
        )}
      </td>
      <td className="r num">{c.videos_published["30d"] ?? "--"}</td>
    </tr>
  )
}
```

- [ ] **Step 2: The route**

`web/app/leaderboard/page.tsx`:

```tsx
import { loadChannels, loadMeta } from "@/lib/bundles"
import { slimChannel } from "@/lib/growth"
import { LeaderboardTable } from "@/components/leaderboard-table"

export default function LeaderboardPage() {
  const meta = loadMeta()
  const channels = loadChannels().channels.map(slimChannel)
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">ALL CHANNELS</span>
        <span className="rule" />
        <span className="cap">{meta.channels.total} tracked</span>
      </div>
      <LeaderboardTable channels={channels} />
    </section>
  )
}
```

- [ ] **Step 3: Boot and verify**

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s http://localhost:3002/leaderboard > /tmp/ait-lb.html
grep -c "ALL CHANNELS" /tmp/ait-lb.html
grep -c "72 tracked" /tmp/ait-lb.html
grep -c "building, 1 of 90 days" /tmp/ait-lb.html
kill "$(cat /tmp/ait-web-dev.pid)"
```

Expected: first two greps print `1`; the third prints at least `1` while the fleet is still building (every Δsubs cell today). Adjust the third to the warmed-up expectation (`< ` bounded rows or signed deltas) if the data has advanced.

- [ ] **Step 4: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): full leaderboard with rank modes and honest bounded/absent rows"
```

---

### Task 9: Chain-map port

The de-domained `chain-map.tsx`: relation vocabulary becomes `then | requires | alternative_to | contradicts`, the circular-financing detector is dropped (finance-specific, no analogue here), the upstream/downstream split is dropped (edges connect steps, not a center node), Radix Dialog becomes a plain overlay, and the mandatory-evidence invariant is kept and tested. Today every topic's `edges` is null, so this component's only live render is via synthetic data in tests; the leaf page (Task 10) wires it behind the empty state.

**Files:**
- Create: `web/lib/chain.ts`
- Create: `web/components/chain-map.tsx`
- Test: `web/lib/chain.test.ts`

**Interfaces:**
- Consumes: `ChainEdge`, `Relation` from `lib/types.ts`; `fmtDate` from `lib/trust.ts`.
- Produces:
  - `lib/chain.ts`: `VERB: Record<Relation, string>`, `verbClass(relation: Relation): string`, `visibleEdges(edges: ChainEdge[] | null): ChainEdge[]`
  - `components/chain-map.tsx`: `ChainMap({ edges }: { edges: ChainEdge[] })` (client; returns null when nothing is visible)

- [ ] **Step 1: Write the failing test**

`web/lib/chain.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/chain.test.ts`
Expected: FAIL with `Cannot find module './chain'`.

- [ ] **Step 3: Implement the lib**

`web/lib/chain.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/chain.test.ts`
Expected: PASS.

- [ ] **Step 5: The component**

`web/components/chain-map.tsx`:

```tsx
"use client"

import { useState } from "react"
import type { ChainEdge } from "@/lib/types"
import { VERB, verbClass, visibleEdges } from "@/lib/chain"
import { fmtDate } from "@/lib/trust"

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

function padStart(s: string, n: number) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}

/** The fork, drawn as a terminal diagram. Click a row for the exact words. */
export function ChainMap({ edges }: { edges: ChainEdge[] }) {
  const rows = visibleEdges(edges)
  const [open, setOpen] = useState<ChainEdge | null>(null)
  if (rows.length === 0) return null

  const nameW = Math.max(...rows.flatMap((e) => [e.from.length, e.to.length]))
  const verbW = Math.max(...Object.values(VERB).map((v) => v.length))

  return (
    <div className="card pad">
      <div className="chain">
        {rows.map((e, i) => (
          <button key={i} type="button" className="row" onClick={() => setOpen(e)}>
            <span className="dim">{padStart(e.from, nameW)}</span>
            <span className="dim">{" ──"}</span>
            <span className={verbClass(e.relation)}>{pad(VERB[e.relation], verbW)}</span>
            <span className="dim">{"──▶ "}</span>
            <span>{pad(e.to, nameW)}</span>
            {e.cites.length > 1 && <span className="dim"> ×{e.cites.length}</span>}
          </button>
        ))}
      </div>
      <p className="note">click any row for the exact words they said</p>
      {open && <CiteDialog edge={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function CiteDialog({ edge, onClose }: { edge: ChainEdge; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="dialogbox" onClick={(e) => e.stopPropagation()}>
        <p className="kicker">
          {edge.from} {VERB[edge.relation]} {edge.to}
        </p>
        <p className="note">
          {edge.cites.length === 1
            ? "Said once, by one person."
            : `Said ${edge.cites.length} times by ${edge.voices} ${
                edge.voices === 1 ? "person" : "people"
              }.`}{" "}
          A claim they made, not a verified fact.
        </p>
        {edge.cites.map((c, i) => (
          <blockquote className="quote" key={i}>
            <p>&ldquo;{c.evidence}&rdquo;</p>
            <p className="cite">
              {c.handle} · {fmtDate(c.said_on)}
              {c.url && (
                <>
                  {" · "}
                  <a href={c.url} target="_blank" rel="noreferrer">
                    open video →
                  </a>
                </>
              )}
            </p>
          </blockquote>
        ))}
        <button type="button" className="btn" onClick={onClose}>
          close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Full suite green, commit**

Run: `cd web && npx vitest run`
Expected: PASS.

```bash
rtk git add web
rtk git commit -m "feat(web): chain-map port with structural relations and mandatory evidence"
```
---

### Task 10: Topic leaf page

The important page. Pre-extraction (today's live state for all 31 topics): header, the WHERE THEY DISAGREE empty state naming build step 14, an honest comment-section stub, EVERY CREATOR'S TRAIL, and VIDEOS ON THIS TOPIC, all real off the spine. When `edges` arrives, the ChainMap replaces the empty state with no further work. EASIEST PATH and WHAT THEY ALL DO have no bundle fields to read yet and do not render at all (they arrive with the step 15 synthesis bundle fields, matching the wireframe's pre-extraction view).

**Files:**
- Create: `web/lib/topic.ts`
- Create: `web/components/topic-leaf.tsx`
- Create: `web/app/topics/[id]/page.tsx`
- Test: `web/lib/topic.test.ts`

**Interfaces:**
- Consumes: `loadTopicPages`, `loadOpportunities`, `loadChannels`, `loadMeta`, `videosById` from `lib/bundles.ts`; `ChainMap`; `Derived`, `Chip`, `VerdictBadge` from `components/trust.tsx`; `scoreText`, `fmtInt`, `fmtDate`, `agoText`, `initials` from `lib/trust.ts`; `visibleEdges` from `lib/chain.ts`.
- Produces:
  - `lib/topic.ts`: `findTopic(topics: TopicPage[], id: string): TopicPage | null`, `findOpp(rows: OpportunityRow[], id: string): OpportunityRow | null`, `interface TrailRow { channel_id: string; name: string; is_self: boolean; count: number; newest: string | null }`, `creatorTrail(videos: VideoRow[], channels: ChannelRow[]): TrailRow[]`, `multText(m: VideoRow["multiplier"]): string`
  - `components/topic-leaf.tsx`: `TopicLeaf({ topic, opp, videos, trail, commentHealth })` (server component)
  - the `/topics/[id]` route (Task 11 adds the parent branch; until then a parent id renders a minimal banner)

- [ ] **Step 1: Write the failing test**

`web/lib/topic.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadChannels, loadTopicPages, videosById } from "./bundles"
import { creatorTrail, findOpp, findTopic, multText } from "./topic"
import type { LeafTopicPage } from "./types"

describe("findTopic and findOpp", () => {
  it("find by id, null when missing", () => {
    const topics = loadTopicPages().topics
    const first = topics[0]
    expect(findTopic(topics, first.topic_id)?.topic_id).toBe(first.topic_id)
    expect(findTopic(topics, "no-such-topic")).toBeNull()
    expect(findOpp([], "anything")).toBeNull()
  })
})

describe("creatorTrail", () => {
  it("groups the real videos of a leaf by channel with counts and newest date", () => {
    const topics = loadTopicPages().topics
    const leaf = topics.find(
      (t): t is LeafTopicPage => t.is_leaf && t.video_ids.length > 0
    )
    if (!leaf) throw new Error("no leaf with videos in _db/")
    const videos = videosById(leaf.video_ids)
    const trail = creatorTrail(videos, loadChannels().channels)
    expect(trail.length).toBeGreaterThan(0)
    const total = trail.reduce((s, t) => s + t.count, 0)
    expect(total).toBe(videos.length)
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i - 1].count).toBeGreaterThanOrEqual(trail[i].count)
    }
    for (const t of trail) {
      expect(typeof t.name).toBe("string")
      expect(t.newest === null || typeof t.newest === "string").toBe(true)
    }
  })
})

describe("multText: a multiplier renders its state, never a fake number", () => {
  it("measured", () => {
    expect(
      multText({ state: "ok", value: 3.2, baseline: 1000, baseline_n: 20, source: "computed" })
    ).toBe("3.2×")
  })
  it("no baseline is a state, not a zero", () => {
    expect(
      multText({ state: "no_baseline", value: null, baseline: null, baseline_n: 14, source: "computed" })
    ).toBe("no baseline")
  })
  it("anything else unmeasured is --", () => {
    expect(
      multText({ state: "building", value: null, baseline: null, baseline_n: 0, source: "computed" })
    ).toBe("--")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/topic.test.ts`
Expected: FAIL with `Cannot find module './topic'`.

- [ ] **Step 3: Implement the lib**

`web/lib/topic.ts`:

```ts
import type { ChannelRow, OpportunityRow, TopicPage, VideoRow } from "./types"

export function findTopic(topics: TopicPage[], id: string): TopicPage | null {
  return topics.find((t) => t.topic_id === id) ?? null
}

export function findOpp(rows: OpportunityRow[], id: string): OpportunityRow | null {
  return rows.find((r) => r.topic_id === id) ?? null
}

export interface TrailRow {
  channel_id: string
  name: string
  is_self: boolean
  count: number
  newest: string | null
}

/** Every creator's trail on the topic: video count and newest upload, most
 *  prolific first. Pure counting over Oracle rows. */
export function creatorTrail(videos: VideoRow[], channels: ChannelRow[]): TrailRow[] {
  const channelById = new Map(channels.map((c) => [c.channel_id, c]))
  const grouped = new Map<string, { count: number; newest: string | null }>()
  for (const v of videos) {
    const g = grouped.get(v.channel_id) ?? { count: 0, newest: null }
    g.count += 1
    if (g.newest === null || v.published_at > g.newest) g.newest = v.published_at
    grouped.set(v.channel_id, g)
  }
  return [...grouped.entries()]
    .map(([channel_id, g]) => {
      const c = channelById.get(channel_id)
      return {
        channel_id,
        name: c?.name ?? channel_id,
        is_self: c?.is_self ?? false,
        count: g.count,
        newest: g.newest,
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function multText(m: VideoRow["multiplier"]): string {
  if (m.state === "ok" && m.value !== null) return `${m.value.toFixed(1)}×`
  if (m.state === "no_baseline") return "no baseline"
  return "--"
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/topic.test.ts`
Expected: PASS.

- [ ] **Step 5: The leaf view**

`web/components/topic-leaf.tsx`:

```tsx
import type { LeafTopicPage, Meta, OpportunityRow, VideoRow } from "@/lib/types"
import type { TrailRow } from "@/lib/topic"
import { multText } from "@/lib/topic"
import { visibleEdges } from "@/lib/chain"
import { agoText, fmtDate, fmtInt, initials, scoreText } from "@/lib/trust"
import { ChainMap } from "./chain-map"
import { Chip, Derived, VerdictBadge } from "./trust"

export function TopicLeaf({
  topic,
  opp,
  videos,
  trail,
  commentHealth,
}: {
  topic: LeafTopicPage
  opp: OpportunityRow | null
  videos: VideoRow[]
  trail: TrailRow[]
  commentHealth: Meta["comment_health"]
}) {
  const edges = visibleEdges(topic.edges)
  return (
    <>
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.topic_id}</h1>
          {opp ? (
            <>
              <VerdictBadge verdict={opp.verdict} />
              <span className="num">
                <Derived formula="score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness">
                  {scoreText(opp.score)}
                </Derived>
              </span>
              {opp.hunch && <Chip>hunch</Chip>}
            </>
          ) : (
            <Chip>not scored in this build</Chip>
          )}
        </div>
        <p className="note">
          {topic.label} · {topic.shape ?? "shape unset"} · {topic.video_count} videos ·{" "}
          {topic.creator_count} creators · {topic.window_days}d
        </p>
        {opp &&
          (opp.own_coverage.covered ? (
            <p className="callout inf" style={{ display: "inline-block" }}>
              you covered this:{" "}
              <a
                href={`https://www.youtube.com/watch?v=${opp.own_coverage.video_id}`}
                target="_blank"
                rel="noreferrer"
              >
                open your video ↗
              </a>{" "}
              on {fmtDate(opp.own_coverage.published_at)}
            </p>
          ) : (
            <p className="callout inf" style={{ display: "inline-block" }}>
              you have not covered this
            </p>
          ))}
      </header>

      <section>
        <div className="section-kicker">
          <span className="kicker">WHERE THEY DISAGREE</span>
          <span className="rule" />
          <span className="cap">the opening</span>
        </div>
        {edges.length > 0 ? (
          <ChainMap edges={edges} />
        ) : (
          <div className="empty">
            not extracted yet
            <br />
            {topic.video_count} videos matched this topic · 0 analyzed
            <br />
            needs build step 14
          </div>
        )}
      </section>

      <section>
        <div className="section-kicker">
          <span className="kicker">WHAT VIEWERS ASKED</span>
          <span className="rule" />
          <span className="cap">real from step 6</span>
        </div>
        <div className="empty">
          comment table not built yet · {fmtInt(commentHealth.ingested)} comments ingested ·{" "}
          {commentHealth.classified} classified · ships with the channel pages plan
        </div>
      </section>

      <details className="sect">
        <summary className="section-kicker">
          <span className="kicker">EVERY CREATOR&apos;S TRAIL</span>
          <span className="rule" />
          <span className="cap">{trail.length} creators</span>
        </summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>creator</th>
              <th className="r">videos</th>
              <th className="r">newest</th>
            </tr>
          </thead>
          <tbody>
            {trail.map((t) => (
              <tr key={t.channel_id}>
                <td>
                  <span className={t.is_self ? "avatar av18 av-you" : "avatar av18"}>
                    {initials(t.name)}
                  </span>{" "}
                  {t.name}
                  {t.is_self && (
                    <>
                      {" "}
                      <Chip variant="you">YOU</Chip>
                    </>
                  )}
                </td>
                <td className="r num">{t.count}</td>
                <td className="r num">{agoText(t.newest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="sect">
        <summary className="section-kicker">
          <span className="kicker">VIDEOS ON THIS TOPIC</span>
          <span className="rule" />
          <span className="cap">{videos.length}</span>
        </summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>title</th>
              <th>creator</th>
              <th className="r">published</th>
              <th className="r">views</th>
              <th className="r" title="views over the channel's median of mature uploads">
                mult
              </th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.video_id}>
                <td>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.video_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {v.title} ↗
                  </a>
                </td>
                <td>{trail.find((t) => t.channel_id === v.channel_id)?.name ?? v.channel_id}</td>
                <td className="r num">{fmtDate(v.published_at)}</td>
                <td className="r num">{v.view_count !== null ? fmtInt(v.view_count) : "--"}</td>
                <td className="r num">
                  {v.multiplier.state === "ok" && v.multiplier.value !== null ? (
                    <Derived formula="views ÷ channel median of the last 20 mature uploads">
                      {multText(v.multiplier)}
                    </Derived>
                  ) : (
                    <span className="muted">{multText(v.multiplier)}</span>
                  )}
                </td>
                <td className="muted">{v.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}
```

- [ ] **Step 6: The route**

`web/app/topics/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { creatorTrail, findOpp, findTopic } from "@/lib/topic"
import { TopicLeaf } from "@/components/topic-leaf"

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const topic = findTopic(loadTopicPages().topics, id)
  if (!topic) notFound()

  if (!topic.is_leaf) {
    // Task 11 replaces this branch with the full parent view.
    return (
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.topic_id}</h1>
          <span className="chip">parent · not scoreable</span>
        </div>
        <p className="note">
          {topic.label} · {topic.leaf_count} leaf topics · {topic.video_count} videos ·{" "}
          {topic.creator_count} creators
        </p>
      </header>
    )
  }

  const channels = loadChannels().channels
  const videos = videosById(topic.video_ids)
  return (
    <TopicLeaf
      topic={topic}
      opp={findOpp(loadOpportunities().rows, id)}
      videos={videos}
      trail={creatorTrail(videos, channels)}
      commentHealth={loadMeta().comment_health}
    />
  )
}
```

- [ ] **Step 7: Boot and verify against a live leaf**

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s http://localhost:3002/topics/agent-evaluation-testing > /tmp/ait-leaf.html
grep -c "WHERE THEY DISAGREE" /tmp/ait-leaf.html
grep -c "not extracted yet" /tmp/ait-leaf.html
grep -c "needs build step 14" /tmp/ait-leaf.html
grep -c "VIDEOS ON THIS TOPIC" /tmp/ait-leaf.html
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/topics/no-such-topic
kill "$(cat /tmp/ait-web-dev.pid)"
```

Expected: the four greps print at least `1` each (the empty state is the live default: every topic's edges are null today); the last curl prints `404`.

- [ ] **Step 8: Commit**

```bash
rtk git add web
rtk git commit -m "feat(web): topic leaf page with honest pre-extraction states"
```
---

### Task 11: Topic parent page with the rollup trend

Wireframe parent-A: the never-scored banner, a leaf table rolling up all children, and one videos/week area chart answering "is this whole area heating or cooling" with a Derived commentary line. Free arithmetic over data the spine already has.

**Files:**
- Create: `web/lib/rollup.ts`
- Create: `web/components/trend-area.tsx`
- Create: `web/components/topic-parent.tsx`
- Modify: `web/app/topics/[id]/page.tsx` (replace the Task 10 interim parent branch)
- Test: `web/lib/rollup.test.ts`

**Interfaces:**
- Consumes: `compareSortValues` from `lib/sort.ts`; `scoreSortValue` from `lib/opportunity.ts`; `scoreText`, `agoText` from `lib/trust.ts`; `VerdictBadge`, `Chip`, `Derived` from `components/trust.tsx`; bundle loaders.
- Produces:
  - `lib/rollup.ts`: `interface WeekPoint { week_start: string; count: number }`, `videosPerWeek(publishedAts: string[], weeks: number, now?: Date): WeekPoint[]`, `rollupLine(points: WeekPoint[]): string | null`
  - `components/trend-area.tsx`: `TrendArea({ points }: { points: WeekPoint[] })`
  - `components/topic-parent.tsx`: `TopicParent({ topic, leaves, points })` (server component)

- [ ] **Step 1: Write the failing test**

`web/lib/rollup.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { rollupLine, videosPerWeek } from "./rollup"

const NOW = new Date("2026-07-28T12:00:00Z") // a Tuesday; week starts Mon 2026-07-27

describe("videosPerWeek", () => {
  it("buckets publish dates into trailing ISO weeks, oldest first", () => {
    const points = videosPerWeek(
      [
        "2026-07-27T09:00:00Z", // current week
        "2026-07-28T01:00:00Z", // current week
        "2026-07-20T10:00:00Z", // previous week
        "2026-05-01T10:00:00Z", // before the window: dropped
      ],
      4,
      NOW
    )
    expect(points).toHaveLength(4)
    expect(points[0].week_start).toBe("2026-07-06")
    expect(points[3].week_start).toBe("2026-07-27")
    expect(points.map((p) => p.count)).toEqual([0, 0, 1, 2])
  })

  it("an empty corpus is all zeros, not an error", () => {
    const points = videosPerWeek([], 3, NOW)
    expect(points.map((p) => p.count)).toEqual([0, 0, 0])
  })
})

describe("rollupLine", () => {
  it("derives the heating-or-cooling sentence", () => {
    const points = videosPerWeek(
      ["2026-07-27T09:00:00Z", "2026-07-28T01:00:00Z", "2026-07-06T10:00:00Z"],
      4,
      NOW
    )
    expect(rollupLine(points)).toBe("2 videos/wk across this branch, up from 1 in July.")
  })
  it("needs at least two points", () => {
    expect(rollupLine([])).toBeNull()
    expect(rollupLine([{ week_start: "2026-07-27", count: 3 }])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/rollup.test.ts`
Expected: FAIL with `Cannot find module './rollup'`.

- [ ] **Step 3: Implement the lib**

`web/lib/rollup.ts`:

```ts
// The parent rollup: videos per week across all children. Weeks start Monday
// UTC. Counting Oracle publish dates is free arithmetic; the sentence below
// the chart is Derived and renders with its formula.

export interface WeekPoint {
  week_start: string
  count: number
}

function startOfWeek(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (out.getUTCDay() + 6) % 7
  out.setUTCDate(out.getUTCDate() - dow)
  return out
}

export function videosPerWeek(
  publishedAts: string[],
  weeks: number,
  now: Date = new Date()
): WeekPoint[] {
  const end = startOfWeek(now)
  const points: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 7 * i)
    points.push({ week_start: start.toISOString().slice(0, 10), count: 0 })
  }
  const first = new Date(points[0].week_start + "T00:00:00Z")
  for (const iso of publishedAts) {
    const w = startOfWeek(new Date(iso))
    if (w < first) continue
    const idx = Math.round((w.getTime() - first.getTime()) / (7 * 86_400_000))
    if (idx >= 0 && idx < points.length) points[idx].count++
  }
  return points
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function rollupLine(points: WeekPoint[]): string | null {
  if (points.length < 2) return null
  const latest = points[points.length - 1]
  const earliest = points[0]
  const month = MONTHS[new Date(earliest.week_start + "T00:00:00Z").getUTCMonth()]
  const dir = latest.count >= earliest.count ? "up" : "down"
  return `${latest.count} videos/wk across this branch, ${dir} from ${earliest.count} in ${month}.`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run lib/rollup.test.ts`
Expected: PASS.

- [ ] **Step 5: The chart and the parent view**

`web/components/trend-area.tsx`:

```tsx
import type { WeekPoint } from "@/lib/rollup"

/** Small SVG area chart for the parent rollup. Empty data renders nothing. */
export function TrendArea({ points }: { points: WeekPoint[] }) {
  if (points.length < 2) return null
  const max = Math.max(...points.map((p) => p.count), 1)
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100
    const y = 38 - (p.count / max) * 32
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "80px" }}
      aria-hidden
    >
      <polygon
        points={`0,40 ${coords.join(" ")} 100,40`}
        fill="color-mix(in srgb, var(--primary) 12%, transparent)"
      />
      <polyline points={coords.join(" ")} fill="none" stroke="var(--primary)" strokeWidth="1" />
    </svg>
  )
}
```

`web/components/topic-parent.tsx`:

```tsx
import Link from "next/link"
import type { LeafTopicPage, OpportunityRow, ParentTopicPage } from "@/lib/types"
import type { WeekPoint } from "@/lib/rollup"
import { rollupLine } from "@/lib/rollup"
import { agoText, scoreText } from "@/lib/trust"
import { Chip, Derived, VerdictBadge } from "./trust"
import { TrendArea } from "./trend-area"

export interface LeafSummary {
  leaf: LeafTopicPage
  opp: OpportunityRow | null
}

export function TopicParent({
  topic,
  leaves,
  points,
}: {
  topic: ParentTopicPage
  leaves: LeafSummary[]
  points: WeekPoint[]
}) {
  const line = rollupLine(points)
  return (
    <>
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.label}</h1>
          <Chip>parent · not scoreable</Chip>
        </div>
        <p className="note">
          {topic.leaf_count} leaf topics · {topic.video_count} videos · {topic.creator_count}{" "}
          creators · {topic.window_days}d
        </p>
        <p className="note">
          ⓘ Parents are never scored. Only leaves get a verdict, because &quot;{topic.label}&quot;
          is not something you can film.
        </p>
      </header>

      <table className="tbl">
        <thead>
          <tr>
            <th>leaf</th>
            <th>verdict</th>
            <th className="r">videos</th>
            <th className="r">creators</th>
            <th className="r">score</th>
            <th className="r">newest</th>
          </tr>
        </thead>
        <tbody>
          {leaves.map(({ leaf, opp }) => (
            <tr key={leaf.topic_id}>
              <td>
                <Link href={`/topics/${leaf.topic_id}`}>{leaf.topic_id}</Link>
              </td>
              <td>{opp ? <VerdictBadge verdict={opp.verdict} /> : <span className="muted">--</span>}</td>
              <td className="r num">{leaf.video_count}</td>
              <td className="r num">{leaf.creator_count}</td>
              <td className="r num">
                {opp ? (
                  <Derived formula="score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness">
                    {scoreText(opp.score)}
                  </Derived>
                ) : (
                  <span className="muted">--</span>
                )}
              </td>
              <td className="r num">{agoText(leaf.newest_video_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <div className="section-kicker">
          <span className="kicker">IS THIS WHOLE AREA HEATING OR COOLING?</span>
          <span className="rule" />
          <span className="cap">videos/wk across all children</span>
        </div>
        <TrendArea points={points} />
        {line && (
          <p className="note">
            <Derived formula="videos published across all children, bucketed by week (Monday UTC)">
              {line}
            </Derived>
          </p>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 6: Wire the route's parent branch**

In `web/app/topics/[id]/page.tsx`, replace the entire interim `if (!topic.is_leaf) { ... }` block from Task 10 with:

```tsx
  if (!topic.is_leaf) {
    const topics = loadTopicPages().topics
    const opps = loadOpportunities().rows
    const leaves: LeafSummary[] = topic.children
      .map((childId) => findTopic(topics, childId))
      .filter((t): t is LeafTopicPage => t !== null && t.is_leaf)
      .map((leaf) => ({ leaf, opp: findOpp(opps, leaf.topic_id) }))
      .sort((a, b) =>
        compareSortValues(
          a.opp ? scoreSortValue(a.opp) : null,
          b.opp ? scoreSortValue(b.opp) : null,
          -1
        )
      )
    const publishedAts = leaves.flatMap(({ leaf }) =>
      videosById(leaf.video_ids).map((v) => v.published_at)
    )
    const weeks = Math.max(2, Math.round(topic.window_days / 7))
    return (
      <TopicParent topic={topic} leaves={leaves} points={videosPerWeek(publishedAts, weeks)} />
    )
  }
```

And extend the file's imports to:

```tsx
import { notFound } from "next/navigation"
import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { compareSortValues } from "@/lib/sort"
import { scoreSortValue } from "@/lib/opportunity"
import { videosPerWeek } from "@/lib/rollup"
import { creatorTrail, findOpp, findTopic } from "@/lib/topic"
import { TopicLeaf } from "@/components/topic-leaf"
import { TopicParent, type LeafSummary } from "@/components/topic-parent"
import type { LeafTopicPage } from "@/lib/types"
```

Note: a parent whose children are themselves parents contributes no leaf rows here beyond its direct leaf children; grandchildren are reachable through their own parent's page. The tree today is two levels, and `/topics` (Task 12) renders the full nesting.

- [ ] **Step 7: Boot and verify against the live parent**

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s http://localhost:3002/topics/agents > /tmp/ait-parent.html
grep -c "Parents are never scored" /tmp/ait-parent.html
grep -c "HEATING OR COOLING" /tmp/ait-parent.html
grep -c "agent-evaluation-testing" /tmp/ait-parent.html
grep -c "videos/wk across this branch" /tmp/ait-parent.html
kill "$(cat /tmp/ait-web-dev.pid)"
```

Expected: every grep prints at least `1` (the `agents` parent has 4 children and 3,302 videos in the live bundle, so the trend line has real data).

- [ ] **Step 8: Full suite green, commit**

Run: `cd web && npx vitest run`
Expected: PASS.

```bash
rtk git add web
rtk git commit -m "feat(web): topic parent page with leaf rollup and trend"
```

---

### Task 12: Topics index, build check, docs

**Files:**
- Create: `web/app/topics/page.tsx`
- Modify: `CLAUDE.md` (project root: the "web/ does not exist yet" line)

**Interfaces:**
- Consumes: `loadTopicPages`, `loadOpportunities`; `VerdictBadge`; `findOpp`.
- Produces: the `/topics` route; a clean `next build`; the final state of the plan.

- [ ] **Step 1: The topics index**

`web/app/topics/page.tsx` (renders the tree at arbitrary depth; parents link to their rollup page, leaves to their leaf page, leaves carry their verdict when scored):

```tsx
import Link from "next/link"
import { loadOpportunities, loadTopicPages } from "@/lib/bundles"
import { findOpp } from "@/lib/topic"
import { VerdictBadge } from "@/components/trust"
import type { OpportunityRow, TopicPage } from "@/lib/types"

export default function TopicsIndexPage() {
  const topics = loadTopicPages().topics
  const opps = loadOpportunities().rows
  const roots = topics.filter((t) => t.parent_id === null)
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">ALL TOPICS</span>
        <span className="rule" />
        <span className="cap">
          {topics.filter((t) => t.is_leaf).length} leaves ·{" "}
          {topics.filter((t) => !t.is_leaf).length} parents
        </span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {roots.map((t) => (
          <TopicNode key={t.topic_id} topic={t} topics={topics} opps={opps} depth={0} />
        ))}
      </ul>
    </section>
  )
}

function TopicNode({
  topic,
  topics,
  opps,
  depth,
}: {
  topic: TopicPage
  topics: TopicPage[]
  opps: OpportunityRow[]
  depth: number
}) {
  const opp = topic.is_leaf ? findOpp(opps, topic.topic_id) : null
  const children = topic.is_leaf
    ? []
    : topic.children
        .map((id) => topics.find((t) => t.topic_id === id))
        .filter((t): t is TopicPage => t !== undefined)
  return (
    <li style={{ paddingLeft: depth * 20, marginBottom: 6 }}>
      <Link href={`/topics/${topic.topic_id}`} className="num">
        {topic.topic_id}
      </Link>{" "}
      <span className="muted">
        {topic.label} · {topic.video_count} videos · {topic.creator_count} creators
      </span>{" "}
      {topic.is_leaf ? (
        opp ? (
          <VerdictBadge verdict={opp.verdict} />
        ) : (
          <span className="chip">not scored</span>
        )
      ) : (
        <span className="chip">parent</span>
      )}
      {children.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
          {children.map((c) => (
            <TopicNode key={c.topic_id} topic={c} topics={topics} opps={opps} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
```

- [ ] **Step 2: Full verification pass**

```bash
cd web && npx vitest run
```
Expected: PASS, all suites (bundles, trust, sort, growth, opportunity, chain, topic, rollup).

```bash
cd web && npm run build
```
Expected: `next build` completes with no type errors. This is the plan's type-consistency gate for all `.tsx` files (vitest only covers `lib/`).

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
for route in / /leaderboard /topics /topics/agents /topics/agent-evaluation-testing; do
  printf "%s %s\n" "$route" "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002$route")"
done
curl -s http://localhost:3002/topics | grep -c "ALL TOPICS"
kill "$(cat /tmp/ait-web-dev.pid)"
```
Expected: every route prints `200`; the grep prints `1`.

- [ ] **Step 3: Update the project CLAUDE.md**

In the project root `CLAUDE.md`, replace the line:

```
**Build steps 0 to 8 are done.** `pipeline/`, its tests, and `_db/` all run for real today; `web/`
does not exist yet; that is the next step.
```

with:

```
**Build steps 0 to 10 are done.** `pipeline/`, its tests, and `_db/` all run for real today.
`web/` is the Next.js dashboard on port 3002 (`cd web && npm run dev`; predev rebuilds `_db/`;
`npx vitest run` from `web/` for the web tests). Channel pages, the comment table, and /compare
are the next phase.
```

And replace the line:

```
**Next is step 9** (`docs/spec.md` §10): the Next.js app on port 3002, the trust tokens, and the
sortable table. **Step 13 is a hard gate**: no extraction work begins until a 20-video manual spike
measures artifact capture against a 50% floor.
```

with:

```
**Next is step 11** (`docs/spec.md` §10): channel pages, then comment classification. **Step 13 is
a hard gate**: no extraction work begins until a 20-video manual spike measures artifact capture
against a 50% floor.
```

- [ ] **Step 4: Final commit**

```bash
rtk git add web CLAUDE.md
rtk git commit -m "feat(web): topics index, build verification, and doc update for steps 9-10"
```

---

## Out of scope for this plan (plan 3)

- `/channels/[id]` (profile card, tabbed charts, still-pulling-views table, comment index, reply queue)
- The comment table anywhere, including its lag column; `comments.json` stays unread
- `/compare`
- Comment classification UI (`meta.comment_health.classified` is 0 and stays 0 here)
- `web/e2e/monday.spec.ts` (system.md §10 names it; it needs the plan-3 routes to be worth scripting, and this plan's curl checks cover the steps 9-10 surface)
- The T13 physical split of `videos.json`/`comments.json` into per-route files (this plan's server-side slicing already keeps them off the wire)
- Avatar image downloading (`_db/assets/` does not exist; initials render instead)
