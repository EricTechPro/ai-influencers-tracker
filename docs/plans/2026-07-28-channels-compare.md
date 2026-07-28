# Channel Pages, Comment Tables, and /compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the web dashboard's plan-3 surface: `/channels/[id]` (T21), the comment table everywhere it appears (T21b), `/compare`, and the T13 physical split of the 59 MB `comments.json` so the web never parses it wholesale.

**Architecture:** One new pipeline change (split the comments bundle into per-channel and per-topic files at build time), then pure additions to `web/`: typed loaders, pure lib helpers with vitest suites, server pages that slice data, and small client components for tabs/sort/expansion. Everything renders the locked mockup Version A (`docs/mockups/channel.html`, `docs/mockups/compare.html`) with the three trust tiers.

**Tech Stack:** Python 3 stdlib (pipeline), Next.js App Router + TypeScript + vitest (web). No new dependencies.

## Global Constraints

Copied from `CLAUDE.md`, `docs/system.md`, and the locked visual language. Every task's requirements implicitly include these.

- **Never assert a number nobody said.** Missing data is a state, never a zero. Three tiers, never blended: Oracle plain, Derived dotted underline with its formula on hover (`<Derived formula="...">`), Inference violet with source chip (`<Inference source="...">`).
- `null`/missing renders `—`, never `0`. `bounded` renders `< N`, never a bare number. `building` renders `building, have of need`.
- `web/lib/bundles.ts` is **the only file in `web/` that touches the filesystem**. It reads `_db/` and nothing else.
- The pipeline never writes into hand-edited `config/`. `_db/` is safe to delete and rebuild; rebuilding must be byte-identical (sorted keys, `generated_at` derived from `today`, no clock reads, no hash-order iteration).
- Comment classification has not run: `category` is `null` on every row today and `by_category` counts sit under `unsorted`. The UI renders that honestly ("not classified yet"), it never hides the rows and never invents categories.
- Fixed category order everywhere, positions never move: `all · requests · questions · corrections · suggestions · other`.
- The lag column formats "3d after" / "same day" and **never renders the comment's absolute date in that column**.
- Visual language: Version A (dense terminal) for `/channels` and `/compare`, per `docs/wireframes.md` "Visual language — locked 2026-07-28". Existing CSS classes in `web/app/globals.css` (`section-kicker`, `kicker`, `card pad`, `tbl`, `cattabs`, `cat`, `chip`, `derived`, `inference`, `src-chip`, `mono10`, `num`, `gain`, `callout warn`, `avatar`, `rowlink`) are the vocabulary; extend, do not fork.
- Eric's craft bar: the UI must end up **better** than social-invest, not a faithful copy: real hover/focus states, tabular numerals, sticky table headers on long tables, `prefers-reduced-motion` respected, no dead links, no layout shift on expansion. No fake polish (no count-up animations on real numbers, no skeletons for data that is simply absent).
- No em dashes in any copy, comment, or doc text this plan writes.
- Prefix every shell command with `rtk`. Conventional commits (`feat`, `fix`, `test`, `docs`, `data`, `chore`). Python: `ruff` line-length 100, tests beside code as `test_*.py`, run `pytest -q` from repo root. Web: `cd web && npx vitest run`.
- **Concurrent session**: another session has uncommitted work in this tree (avatar serving: `web/app/assets/channels/[id]/route.ts` + test, `pipeline/avatars.py`, a comment tweak in `web/lib/bundles.ts`, `web/vitest.config.ts`, `web/components/opportunity-table.tsx`). Never revert it. Stage only the exact files your task created or edited (`rtk git add <explicit paths>`, never a directory). If your task edits a file that carries their uncommitted tweak (`bundles.ts`, `vitest.config.ts`), keep their edit intact; it may ride along in your commit.
- **Images**: channel avatars are served at `/assets/channels/<channel_id>` by the existing route (streams `_db/assets/channels/<id>.jpg`; 72 files exist). Render real avatars with an initials fallback decided server-side. Video thumbnails hotlink YouTube: `https://i.ytimg.com/vi/<video_id>/mqdefault.jpg`, `loading="lazy"`, fixed box, `alt=""`.
- Branch: continue on `feat/data-spine` (plan 2 lives there, unmerged). Commit task by task.
- Port 3002. Dev server: `cd web && npm run dev` (predev rebuilds `_db/`, which takes ~60s; for route checks prefer a server that is already running or start once and reuse).

## Data facts the tasks rely on (verified against the real `_db/` on 2026-07-28)

- `comments.json` (59 MB): `{version: 2, generated_at, by_channel: {<channel_id>: {totals: {ingested, classified, window_days}, top: CommentRow[50], by_category, most_discussed_video_ids}}, by_video: {<video_id>: {totals: {comments}, by_category, top: CommentRow[≤10]}}, by_topic: {<topic_id>: {totals: {comments, videos, creators}, top: CommentRow[50], by_category, unserved: []}}}`. 40 channels have entries, 7,623 videos, 25 topics.
- `CommentRow` fields (all present on every row): `comment_id, video_id, video_title, video_url, video_published_at, author, author_channel_id, text, like_count, reply_count, published_at, answered, lag_days, topic_ids, category, channel_id`. `category` is `null` today.
- `by_category` keys: `video_request, question, correction, suggestion, other, unsorted`.
- Thresholds (`config/thresholds.json` → `comments`): `top_n_per_channel: 50`, `page_size: 5`.
- `channels.json` row: `videos_published` and `median_views_per_video` **only have key `"30d"`**. `view_delta` has `24h/7d/14d/30d/90d/180d/365d`; `subscriber_delta`, `subscriber_growth_rate`, `subs_per_1k_views` have `7d/14d/30d/90d/180d/365d`. `blurb` is `null` for all rows today (LLM blurbs are a later step). Avatars exist as `_db/assets/channels/<id>.jpg` (72 files) but pages render initials this plan; image serving is out of scope.
- `snapshots.json`: `channels[<id>].series` is `SnapshotDay[]` with `date, status, source, subscriber_count, subscriber_bucket, view_count, video_count`. Only 1 day present today, so every growth chart renders its building state; the code must still be correct for N days.
- `videos.json` row: `traction.views_gained` is `Record<string, StateCell>` (the `"7d"` key feeds the `+7d` column), `multiplier.value` may be null, `topic_assignments[]` rows carry `topic_id` (leaf) and `primary`.
- `topic-leaf.tsx` line ~97 currently renders the placeholder "comment table not built yet ... ships with the channel pages plan". This plan replaces it.
- Self channel: `is_self: true` row; `channels.json.self_channel_id` = Eric Tech's id.

## File Structure

```
pipeline/bundles/comments.py       modify: write() splits into _db/comments/{channel,topic}/
pipeline/test_comments.py          modify: add split-writer tests
pipeline/build_data.py             modify: use the new write(), keep comment_health arithmetic
web/lib/types.ts                   modify: CommentRow, CategoryCounts, ChannelCommentsFile, TopicCommentsFile
web/lib/bundles.ts                 modify: loadChannelComments(), loadTopicComments()
web/lib/bundles.test.ts            modify: parity tests for the two new loaders
web/lib/channel.ts                 create: cadence, category tabs, comment sort/filter (pure)
web/lib/channel.test.ts            create
web/lib/compare.ts                 create: per-channel topic coverage, gap partition (pure)
web/lib/compare.test.ts            create
web/components/channel-growth.tsx  create: client tabs+window chart for one channel
web/components/comment-table.tsx   create: client category tabs, sort, pagination, lag column
web/components/still-pulling.tsx   create: client table with inline per-video comment expansion
web/components/compare-picker.tsx  create: client two-select query-param router
web/components/nav-links.tsx       modify: add channels + compare
web/components/leaderboard-table.tsx modify: channel names link to /channels/[id]
web/components/topic-leaf.tsx      modify: replace comment placeholder with the real table
web/app/channels/page.tsx          create: index of 72
web/app/channels/[id]/page.tsx     create: the channel page
web/app/compare/page.tsx           create
web/app/topics/[id]/page.tsx       modify: pass topic comments into TopicLeaf
web/app/globals.css                modify: category chip hues, sticky headers, focus states
CLAUDE.md                          modify: status lines after completion
```

---

### Task 1: T13, split the comments bundle into per-channel and per-topic files

**Files:**
- Modify: `pipeline/bundles/comments.py` (the `write()` at the bottom; `build()` stays untouched)
- Modify: `pipeline/build_data.py:91-100`
- Test: `pipeline/test_comments.py`

**Interfaces:**
- Consumes: `bundles.comments.build(ctx)` (unchanged), `util.write_json(path, obj)`, `config.db_dir()`.
- Produces: `_db/comments/channel/<channel_id>.json` shaped `{"version", "generated_at", "channel": <by_channel entry>, "videos": {<video_id>: <by_video entry>}}` containing **only that channel's videos**; `_db/comments/topic/<topic_id>.json` shaped `{"version", "generated_at", "topic": <by_topic entry>}`. `write(ctx)` returns the full in-memory bundle so `build_data.py` keeps its `comment_health` arithmetic. The 59 MB `_db/comments.json` monolith is no longer written; a stale copy from an earlier build is deleted.

- [ ] **Step 1: Write the failing tests**

Add to `pipeline/test_comments.py` (reuse the existing fixture machinery in that file / `conftest.py` for a ctx; follow how the current bundle test builds one):

```python
def test_split_write_creates_per_channel_and_topic_files(tmp_db_ctx):
    ctx = tmp_db_ctx  # fixture: ctx wired to a tmp _db dir with 2 channels, 3 videos, 1 topic
    bundle = comments_bundle.write(ctx)
    root = config.db_dir() / "comments"
    channel_files = sorted(p.name for p in (root / "channel").glob("*.json"))
    assert channel_files == sorted(f"{cid}.json" for cid in bundle["by_channel"])
    one = json.loads((root / "channel" / channel_files[0]).read_text())
    cid = channel_files[0].removesuffix(".json")
    assert one["channel"] == bundle["by_channel"][cid]
    # only this channel's videos are inside its file
    own_video_ids = {v["video_id"] for v in ctx.videos if v["channel_id"] == cid}
    assert set(one["videos"]) <= own_video_ids

def test_split_write_removes_stale_files_and_monolith(tmp_db_ctx):
    root = config.db_dir() / "comments"
    (root / "channel").mkdir(parents=True, exist_ok=True)
    (root / "channel" / "UCstale.json").write_text("{}")
    (config.db_dir() / "comments.json").write_text("{}")
    comments_bundle.write(tmp_db_ctx)
    assert not (root / "channel" / "UCstale.json").exists()
    assert not (config.db_dir() / "comments.json").exists()

def test_split_write_returns_bundle_for_meta(tmp_db_ctx):
    bundle = comments_bundle.write(tmp_db_ctx)
    assert "by_channel" in bundle and "by_video" in bundle and "by_topic" in bundle
```

If no reusable ctx fixture exists in `test_comments.py`, build one the way `test_build_data.py` does (it constructs a Context against tmp dirs); name it `tmp_db_ctx` in a local fixture.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk pytest pipeline/test_comments.py -q -k split`
Expected: FAIL (write() currently writes nothing per-channel and returns None).

- [ ] **Step 3: Implement the split writer**

Replace `write()` in `pipeline/bundles/comments.py`:

```python
def write(ctx) -> dict:
    """Split by route (T13): one file per channel, one per topic. The monolith
    would ship 59 MB to every page load path; per-route files keep reads O(page)."""
    bundle = build(ctx)
    root = config.db_dir() / "comments"
    if root.exists():
        shutil.rmtree(root)
    (root / "channel").mkdir(parents=True)
    (root / "topic").mkdir(parents=True)
    monolith = config.db_dir() / "comments.json"
    monolith.unlink(missing_ok=True)

    channel_of = {v["video_id"]: v["channel_id"] for v in ctx.videos}
    videos_by_channel: dict[str, dict] = {}
    for video_id, entry in bundle["by_video"].items():
        channel_id = channel_of.get(video_id)
        if channel_id is not None:
            videos_by_channel.setdefault(channel_id, {})[video_id] = entry

    head = {"version": bundle["version"], "generated_at": bundle["generated_at"]}
    for channel_id, entry in bundle["by_channel"].items():
        util.write_json(root / "channel" / f"{channel_id}.json",
                        {**head, "channel": entry,
                         "videos": videos_by_channel.get(channel_id, {})})
    for topic_id, entry in bundle["by_topic"].items():
        util.write_json(root / "topic" / f"{topic_id}.json", {**head, "topic": entry})
    return bundle
```

Add `import shutil` at the top of the module. In `pipeline/build_data.py`, replace lines 91-92:

```python
    comments_bundle = bundles.comments.write(ctx)
```

(the three `ctx.extra` lines below stay exactly as they are; they read the returned bundle).

- [ ] **Step 4: Run the full pipeline suite**

Run: `rtk pytest -q`
Expected: PASS. If any existing test asserts the `comments.json` monolith exists (check `pipeline/test_build_data.py`), update that assertion to the split layout, keeping its intent (the bundle content assertions run against `write()`'s return value or the split files).

Run: `rtk uvx ruff check pipeline test_anchors.py scripts`
Expected: All checks passed.

- [ ] **Step 5: Rebuild the real `_db/` and spot-check**

```bash
rtk python3 -m pipeline.build_data
rtk ls _db/comments/channel | head -3
rtk python3 -c "import json,glob; p=sorted(glob.glob('_db/comments/channel/*.json'))[0]; d=json.load(open(p)); print(p, d['channel']['totals'], len(d['videos']))"
```
Expected: ~40 channel files, ~25 topic files, no `_db/comments.json`, totals matching the old monolith's numbers.

- [ ] **Step 6: Commit**

```bash
rtk git add pipeline/bundles/comments.py pipeline/build_data.py pipeline/test_comments.py
rtk git commit -m "feat(pipeline): split comments bundle by channel and topic (T13)"
```

---

### Task 2: Web comment types and loaders with parity tests

**Files:**
- Modify: `web/lib/types.ts` (append)
- Modify: `web/lib/bundles.ts` (append)
- Test: `web/lib/bundles.test.ts` (append)

**Interfaces:**
- Consumes: the Task 1 file layout under `_db/comments/`.
- Produces (used by Tasks 4-6): types `CommentCategory`, `CategoryCounts`, `CommentRow`, `VideoComments`, `ChannelCommentsFile`, `TopicCommentsFile`; loaders `loadChannelComments(channelId: string): ChannelCommentsFile | null` and `loadTopicComments(topicId: string): TopicCommentsFile | null` (null when the file does not exist, which is the honest "comment ledger has not reached this channel/topic yet" state).

- [ ] **Step 1: Append types to `web/lib/types.ts`**

```ts
export type CommentCategory =
  | "video_request"
  | "question"
  | "correction"
  | "suggestion"
  | "other"

export interface CategoryCounts {
  video_request: number
  question: number
  correction: number
  suggestion: number
  other: number
  /** rows the classification pass has not labeled; they render, just unlabeled */
  unsorted: number
}

export interface CommentRow {
  comment_id: string
  video_id: string
  video_title: string
  video_url: string
  video_published_at: string
  author: string
  author_channel_id: string | null
  text: string
  like_count: number
  reply_count: number
  published_at: string
  answered: boolean
  /** Derived: comment published_at minus video published_at, in whole days */
  lag_days: number
  topic_ids: string[]
  /** Inference when present; null until the classification pass (build step 12) runs */
  category: {
    key: CommentCategory
    trust: string
    model: string
    classified_at: string
  } | null
  channel_id: string
}

export interface VideoComments {
  totals: { comments: number }
  by_category: CategoryCounts
  top: CommentRow[]
}

export interface ChannelCommentsFile {
  version: number
  generated_at: string
  channel: {
    totals: { ingested: number; classified: number; window_days: number }
    top: CommentRow[]
    by_category: CategoryCounts
    most_discussed_video_ids: string[]
  }
  videos: Record<string, VideoComments>
}

export interface TopicCommentsFile {
  version: number
  generated_at: string
  topic: {
    totals: { comments: number; videos: number; creators: number }
    top: CommentRow[]
    by_category: CategoryCounts
    unserved: unknown[]
  }
}
```

- [ ] **Step 2: Write the failing parity tests**

Append to `web/lib/bundles.test.ts`, following the file's existing parity-test style (it asserts real `_db/` shapes):

```ts
import { loadChannelComments, loadTopicComments } from "./bundles"

describe("comment loaders", () => {
  it("loads a real per-channel comments file with full row shape", () => {
    const withComments = loadChannels().channels.find(
      (c) => loadChannelComments(c.channel_id) !== null,
    )
    expect(withComments).toBeDefined()
    const file = loadChannelComments(withComments!.channel_id)!
    expect(file.channel.totals.ingested).toBeGreaterThan(0)
    const row = file.channel.top[0]
    for (const key of [
      "comment_id", "video_id", "video_title", "video_url", "author", "text",
      "like_count", "reply_count", "published_at", "answered", "lag_days",
      "topic_ids", "category", "channel_id",
    ]) expect(row).toHaveProperty(key)
    expect(row.lag_days).toBeGreaterThanOrEqual(0)
    // every embedded video belongs to this channel
    for (const vc of Object.values(file.videos)) {
      expect(vc.top[0]?.channel_id ?? withComments!.channel_id).toBe(withComments!.channel_id)
    }
  })

  it("returns null for a channel the ledger has not reached", () => {
    expect(loadChannelComments("UC_does_not_exist")).toBeNull()
  })

  it("loads a real per-topic comments file", () => {
    const leaf = loadTopicPages().topics.find(
      (t) => t.is_leaf && loadTopicComments(t.topic_id) !== null,
    )
    expect(leaf).toBeDefined()
    const file = loadTopicComments(leaf!.topic_id)!
    expect(file.topic.totals.comments).toBeGreaterThan(0)
    expect(file.topic.by_category).toHaveProperty("unsorted")
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd web && rtk npx vitest run lib/bundles.test.ts`
Expected: FAIL (loaders not exported).

- [ ] **Step 4: Implement the loaders in `web/lib/bundles.ts`**

```ts
import { existsSync, readFileSync } from "node:fs"   // extend the existing import

/** Per-channel comment slice (T13). null is a state: the comment ledger has
 *  not reached this channel yet. Never invent an empty bundle for it. */
export function loadChannelComments(channelId: string): ChannelCommentsFile | null {
  const rel = path.join("comments", "channel", `${channelId}.json`)
  if (!existsSync(path.join(DB_DIR, rel))) return null
  return load<ChannelCommentsFile>(rel)
}

export function loadTopicComments(topicId: string): TopicCommentsFile | null {
  const rel = path.join("comments", "topic", `${topicId}.json`)
  if (!existsSync(path.join(DB_DIR, rel))) return null
  return load<TopicCommentsFile>(rel)
}
```

Also update the file's top comment: the 59 MB monolith no longer exists; comments are read as per-route slices. Import the new types from `./types`.

- [ ] **Step 5: Run tests**

Run: `cd web && rtk npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
rtk git add web/lib/types.ts web/lib/bundles.ts web/lib/bundles.test.ts
rtk git commit -m "feat(web): typed per-channel and per-topic comment loaders"
```

---

### Task 3: Pure helpers, `lib/channel.ts` and `lib/compare.ts`

**Files:**
- Create: `web/lib/channel.ts`, `web/lib/channel.test.ts`
- Create: `web/lib/compare.ts`, `web/lib/compare.test.ts`

**Interfaces:**
- Consumes: types from `web/lib/types.ts` (`CommentRow`, `CategoryCounts`, `CommentCategory`, `VideoRow`, `OpportunityRow`, `Verdict`).
- Produces (used by Tasks 4-6):
  - `CADENCE_FORMULA: string` and `cadenceDays(publishedAts: string[]): number | null`
  - `lagText(lagDays: number): string`
  - `categoryTabs(counts: CategoryCounts, total: number): { key: "all" | CommentCategory; label: string; count: number }[]`
  - `filterByCategory(rows: CommentRow[], key: "all" | CommentCategory): CommentRow[]`
  - `sortComments(rows: CommentRow[], by: "likes" | "replies"): CommentRow[]`
  - `coverageByTopic(videos: VideoRow[], channelId: string): Map<string, { videos: number; views: number }>`
  - `comparePartition(him, you, opps)` returning `{ himOnly: GapRow[]; youOnly: GapRow[]; both: GapRow[] }` with `GapRow = { topic_id: string; him: { videos: number; views: number } | null; you: { videos: number; views: number } | null; verdict: Verdict | null }`

- [ ] **Step 1: Write the failing tests**

`web/lib/channel.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  CADENCE_FORMULA, cadenceDays, categoryTabs, filterByCategory, lagText, sortComments,
} from "./channel"
import type { CommentRow } from "./types"

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

function row(over: Partial<CommentRow>): CommentRow {
  return {
    comment_id: "c", video_id: "v", video_title: "t", video_url: "u",
    video_published_at: day(0), author: "a", author_channel_id: null, text: "x",
    like_count: 0, reply_count: 0, published_at: day(1), answered: false,
    lag_days: 1, topic_ids: [], category: null, channel_id: "ch", ...over,
  }
}

describe("cadenceDays", () => {
  it("is the median gap over the last 10 uploads", () => {
    // gaps of 2,2,4 days: median 2
    expect(cadenceDays([day(0), day(2), day(4), day(8)])).toBe(2)
  })
  it("averages the middle pair on an even gap count", () => {
    // gaps 2,4: median 3
    expect(cadenceDays([day(0), day(2), day(6)])).toBe(3)
  })
  it("uses only the last 10 uploads", () => {
    const dates = [day(0), ...Array.from({ length: 10 }, (_, i) => day(100 + i))]
    expect(cadenceDays(dates)).toBe(1) // the 100-day gap falls outside the last 10
  })
  it("is null below two uploads, never a fake number", () => {
    expect(cadenceDays([])).toBeNull()
    expect(cadenceDays([day(0)])).toBeNull()
  })
  it("names its formula", () => {
    expect(CADENCE_FORMULA).toMatch(/median/)
  })
})

describe("lagText", () => {
  it("renders same day and Nd after", () => {
    expect(lagText(0)).toBe("same day")
    expect(lagText(41)).toBe("41d after")
  })
})

describe("categoryTabs", () => {
  it("keeps the fixed order with counts, all first", () => {
    const tabs = categoryTabs(
      { video_request: 1, question: 2, correction: 3, suggestion: 4, other: 5, unsorted: 6 },
      21,
    )
    expect(tabs.map((t) => t.key)).toEqual([
      "all", "video_request", "question", "correction", "suggestion", "other",
    ])
    expect(tabs[0].count).toBe(21)
    expect(tabs[3].count).toBe(3)
  })
})

describe("filter and sort", () => {
  const rows = [
    row({ comment_id: "1", like_count: 5, reply_count: 9 }),
    row({ comment_id: "2", like_count: 9, reply_count: 1,
          category: { key: "question", trust: "inference", model: "m", classified_at: day(2) } }),
  ]
  it("all keeps unsorted rows visible", () => {
    expect(filterByCategory(rows, "all")).toHaveLength(2)
  })
  it("a category tab shows only its rows", () => {
    expect(filterByCategory(rows, "question").map((r) => r.comment_id)).toEqual(["2"])
  })
  it("sorts by likes or replies, descending, stable input untouched", () => {
    expect(sortComments(rows, "likes")[0].comment_id).toBe("2")
    expect(sortComments(rows, "replies")[0].comment_id).toBe("1")
    expect(rows[0].comment_id).toBe("1")
  })
})
```

`web/lib/compare.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { comparePartition, coverageByTopic } from "./compare"
import type { OpportunityRow, VideoRow } from "./types"

function vid(id: string, channel: string, views: number, topics: string[]): VideoRow {
  return {
    video_id: id, channel_id: channel, title: id, published_at: "2026-06-01T00:00:00Z",
    type: "long", view_count: views, duration_s: 60,
    topic_assignments: topics.map((t) => ({ topic_id: t, primary: true })),
    multiplier: { state: "ok", value: null, baseline: null, baseline_n: null, source: "s" },
    comment_stats: null,
    traction: { still_growing: null, share_recent_7d: null, views_gained: {} },
  }
}

const videos = [
  vid("a1", "HIM", 100, ["rag"]), vid("a2", "HIM", 50, ["rag"]),
  vid("a3", "HIM", 10, ["subagents"]),
  vid("b1", "YOU", 7, ["skills"]), vid("b2", "YOU", 3, ["subagents"]),
]

describe("coverageByTopic", () => {
  it("counts videos and sums exact views per topic for one channel", () => {
    const him = coverageByTopic(videos, "HIM")
    expect(him.get("rag")).toEqual({ videos: 2, views: 150 })
    expect(him.get("skills")).toBeUndefined()
  })
  it("a null view_count adds 0 views but still counts the video", () => {
    const m = coverageByTopic([{ ...videos[0], view_count: null }], "HIM")
    expect(m.get("rag")).toEqual({ videos: 1, views: 0 })
  })
})

describe("comparePartition", () => {
  const opp = { topic_id: "rag", verdict: "MAKE_THIS_NOW" } as OpportunityRow
  it("partitions him-only, you-only, both; him-only sorted by his views desc", () => {
    const out = comparePartition(
      coverageByTopic(videos, "HIM"), coverageByTopic(videos, "YOU"), [opp])
    expect(out.himOnly.map((g) => g.topic_id)).toEqual(["rag"])
    expect(out.himOnly[0].verdict).toBe("MAKE_THIS_NOW")
    expect(out.youOnly.map((g) => g.topic_id)).toEqual(["skills"])
    expect(out.youOnly[0].verdict).toBeNull()
    expect(out.both.map((g) => g.topic_id)).toEqual(["subagents"])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && rtk npx vitest run lib/channel.test.ts lib/compare.test.ts`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `web/lib/channel.ts`**

```ts
// Pure helpers for the channel page. No fs, no react.
import type { CategoryCounts, CommentCategory, CommentRow } from "./types"

export const CADENCE_FORMULA = "median days between uploads, last 10 uploads"

/** Derived. Median gap in days across the channel's last 10 uploads.
 *  Below two uploads there is no gap to measure: null, never a fake number. */
export function cadenceDays(publishedAts: string[]): number | null {
  const last = [...publishedAts].sort().slice(-10)
  if (last.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < last.length; i++) {
    gaps.push((Date.parse(last[i]) - Date.parse(last[i - 1])) / 86_400_000)
  }
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.round(median * 10) / 10
}

/** The lag column never shows an absolute date. */
export function lagText(lagDays: number): string {
  return lagDays === 0 ? "same day" : `${lagDays}d after`
}

const CATEGORY_LABEL: Record<CommentCategory, string> = {
  video_request: "requests",
  question: "questions",
  correction: "corrections",
  suggestion: "suggestions",
  other: "other",
}

/** Fixed order, positions never move between channels. */
export const CATEGORY_ORDER: CommentCategory[] = [
  "video_request", "question", "correction", "suggestion", "other",
]

export function categoryTabs(
  counts: CategoryCounts,
  total: number,
): { key: "all" | CommentCategory; label: string; count: number }[] {
  return [
    { key: "all" as const, label: "all", count: total },
    ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABEL[key], count: counts[key] })),
  ]
}

export function filterByCategory(
  rows: CommentRow[],
  key: "all" | CommentCategory,
): CommentRow[] {
  if (key === "all") return rows
  return rows.filter((r) => r.category?.key === key)
}

export function sortComments(rows: CommentRow[], by: "likes" | "replies"): CommentRow[] {
  const field = by === "likes" ? "like_count" : "reply_count"
  return [...rows].sort((a, b) => b[field] - a[field] || a.comment_id.localeCompare(b.comment_id))
}
```

Implement `web/lib/compare.ts`:

```ts
// Pure helpers for /compare. No fs, no react.
import type { OpportunityRow, Verdict, VideoRow } from "./types"

export interface CoverageCell {
  videos: number
  views: number
}

export interface GapRow {
  topic_id: string
  him: CoverageCell | null
  you: CoverageCell | null
  verdict: Verdict | null
}

/** Per-leaf-topic coverage for one channel. Views are exact viewCounts (Oracle);
 *  a null view_count contributes 0 views but the video still counts. */
export function coverageByTopic(
  videos: VideoRow[],
  channelId: string,
): Map<string, CoverageCell> {
  const out = new Map<string, CoverageCell>()
  for (const v of videos) {
    if (v.channel_id !== channelId) continue
    const topicIds = new Set(
      (v.topic_assignments as { topic_id: string }[]).map((a) => a.topic_id),
    )
    for (const id of topicIds) {
      const cell = out.get(id) ?? { videos: 0, views: 0 }
      cell.videos += 1
      cell.views += v.view_count ?? 0
      out.set(id, cell)
    }
  }
  return out
}

export function comparePartition(
  him: Map<string, CoverageCell>,
  you: Map<string, CoverageCell>,
  opps: OpportunityRow[],
): { himOnly: GapRow[]; youOnly: GapRow[]; both: GapRow[] } {
  const verdictOf = new Map(opps.map((o) => [o.topic_id, o.verdict]))
  const row = (id: string): GapRow => ({
    topic_id: id,
    him: him.get(id) ?? null,
    you: you.get(id) ?? null,
    verdict: verdictOf.get(id) ?? null,
  })
  const ids = new Set([...him.keys(), ...you.keys()])
  const himOnly: GapRow[] = []
  const youOnly: GapRow[] = []
  const both: GapRow[] = []
  for (const id of ids) {
    const r = row(id)
    if (r.him && !r.you) himOnly.push(r)
    else if (!r.him && r.you) youOnly.push(r)
    else both.push(r)
  }
  const byHisViews = (a: GapRow, b: GapRow) =>
    (b.him?.views ?? 0) - (a.him?.views ?? 0) || a.topic_id.localeCompare(b.topic_id)
  himOnly.sort(byHisViews)
  both.sort(byHisViews)
  youOnly.sort(
    (a, b) => (b.you?.videos ?? 0) - (a.you?.videos ?? 0) || a.topic_id.localeCompare(b.topic_id),
  )
  return { himOnly, youOnly, both }
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && rtk npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
rtk git add web/lib/channel.ts web/lib/channel.test.ts web/lib/compare.ts web/lib/compare.test.ts
rtk git commit -m "feat(web): cadence, category, and coverage helpers for channel pages"
```

---

### Task 4: `/channels/[id]` header + growth section, `/channels` index, nav

**Files:**
- Create: `web/app/channels/[id]/page.tsx`, `web/app/channels/page.tsx`, `web/components/channel-growth.tsx`
- Modify: `web/components/nav-links.tsx` (add channels, compare), `web/components/leaderboard-table.tsx` (name cell links to `/channels/[id]`)

**Interfaces:**
- Consumes: `loadChannels`, `loadSnapshots`, `videosById` from `@/lib/bundles`; `cadenceDays`, `CADENCE_FORMULA` from `@/lib/channel`; `fmtInt`, `bucketText`, `deltaText`, `pctText`, `initials`, `fmtDate` from `@/lib/trust`; `Derived`, `Chip` from `@/components/trust`; `BuildingCallout` from `@/components/building-callout`.
- Produces: routes `/channels` and `/channels/[id]`; `<ChannelGrowth series={...} delta={...} rate={...} bucket={...} />` client component. Later tasks add the two comment sections under this page's two kickers; this task leaves clearly marked slots (`{/* still pulling views: Task 5 */}`).

- [ ] **Step 1: `channel-growth.tsx`, the tabbed chart**

```tsx
"use client"

import { useMemo, useState } from "react"
import { deltaText, fmtInt, pctText } from "@/lib/trust"
import { BuildingCallout } from "@/components/building-callout"
import type { SnapshotDay, StateCell } from "@/lib/types"

type Metric = "subscribers" | "views"
const WINDOW_CHOICES = [30, 90, 365] as const

export function ChannelGrowth({
  series,
  delta,
  rate,
  bucket,
}: {
  series: SnapshotDay[]
  delta: Record<string, StateCell>
  rate: Record<string, StateCell>
  bucket: number | null
}) {
  const [metric, setMetric] = useState<Metric>("subscribers")
  const [windowDays, setWindowDays] = useState<(typeof WINDOW_CHOICES)[number]>(90)

  const points = useMemo(() => {
    const cutoff = Date.parse(series.at(-1)?.date ?? "") - windowDays * 86_400_000
    return series
      .filter((d) => d.status === "ok" && Date.parse(d.date) >= cutoff)
      .map((d) => ({
        date: d.date,
        value: metric === "subscribers" ? d.subscriber_count : d.view_count,
      }))
      .filter((p): p is { date: string; value: number } => p.value !== null)
  }, [series, metric, windowDays])

  const windowKey = `${windowDays}d`
  const cell = metric === "subscribers" ? delta[windowKey] : undefined

  return (
    <div className="card pad">
      <div className="controls" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="tabs">
          {(["subscribers", "views"] as const).map((m) => (
            <button key={m} className={metric === m ? "on" : undefined}
              onClick={() => setMetric(m)}>{m}</button>
          ))}
        </span>
        <span className="tabs" style={{ marginLeft: "auto" }}>
          {WINDOW_CHOICES.map((w) => (
            <button key={w} className={windowDays === w ? "on" : undefined}
              onClick={() => setWindowDays(w)}>{w}d</button>
          ))}
        </span>
      </div>
      {points.length < 2 ? (
        <div style={{ marginTop: 10 }}>
          <BuildingCallout state={{ kind: "building", have: points.length, need: windowDays }} />
        </div>
      ) : (
        <>
          <GrowthLine points={points} />
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {cell ? (
              <>
                <span className={`num derived ${cell.state === "ok" && (cell.value ?? 0) > 0 ? "gain" : ""}`}
                  title="last snapshot minus first snapshot in window">
                  {deltaText(cell)} subs
                </span>{" "}
                over {windowKey}
                {bucket ? <> · bucket {fmtInt(bucket)}</> : null}
                {rate[windowKey] ? <> · {pctText(rate[windowKey])}</> : null}
              </>
            ) : (
              <span className="muted">
                exact daily views: first {fmtInt(points[0].value)}, latest{" "}
                {fmtInt(points[points.length - 1].value)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GrowthLine({ points }: { points: { date: string; value: number }[] }) {
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coords = points
    .map((p, i) => {
      const x = 4 + (i / (points.length - 1)) * 92
      const y = 34 - ((p.value - min) / range) * 28
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <svg viewBox="0 0 100 44" preserveAspectRatio="none"
      style={{ width: "100%", height: 110 }} aria-hidden>
      <polygon points={`4,40 ${coords} 96,40`}
        fill="color-mix(in srgb, var(--primary) 8%, transparent)" />
      <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1" />
      <text x="4" y="43.5" fontSize="3.4" fill="var(--muted-2, #6b6a6b)">{points[0].date}</text>
      <text x="78" y="43.5" fontSize="3.4" fill="var(--muted-2, #6b6a6b)">
        {points[points.length - 1].date}
      </text>
    </svg>
  )
}
```

If `deltaText`/`pctText` signatures differ, read `web/lib/trust.ts` and adapt the call sites, not the lib.

- [ ] **Step 2: The channel page (header + growth; comment sections land in Task 5)**

`web/app/channels/[id]/page.tsx`:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { loadChannels, loadSnapshots, videosById } from "@/lib/bundles"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, fmtInt, initials } from "@/lib/trust"
import { Chip, Derived } from "@/components/trust"
import { ChannelGrowth } from "@/components/channel-growth"

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bundle = loadChannels()
  const channel = bundle.channels.find((c) => c.channel_id === id || c.handle === id)
  if (!channel) notFound()

  const snapshots = loadSnapshots().channels[channel.channel_id]?.series ?? []
  const growthRank = channel.rank.growth["90d"]
  const cadence = cadenceDays(
    videosById(channel.still_growing_video_ids).map((v) => v.published_at),
  )
  // cadence needs the channel's uploads, not just still-growing ones; see Step 3

  return (
    <section>
      <div className="card pad" style={{ marginTop: "1.2rem" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span className={`avatar av56${channel.is_self ? " av-you" : ""}`}>
            {initials(channel.name)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: "1.2rem" }}>{channel.name}</b>
              <span className="mono10">
                @{channel.handle}
                {channel.niche ? ` · ${channel.niche}` : ""}
                {channel.lang ? ` · ${channel.lang}` : ""}
              </span>
              {growthRank !== null && growthRank <= 3 && (
                <Chip variant="rank1">★ #{growthRank} by growth 90d</Chip>
              )}
              {channel.is_self ? (
                <Chip variant="you">★ you</Chip>
              ) : (
                <Link href={`/compare?a=${channel.channel_id}`}
                  style={{ marginLeft: "auto", fontSize: 12 }}>
                  compare with you →
                </Link>
              )}
            </div>
            <div className="num"
              style={{ marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
              <span>
                {channel.subscriber_count === null ? "—" : <b>{fmtInt(channel.subscriber_count)}</b>}{" "}
                subs <Chip>{bucketText(channel.subscriber_bucket)}</Chip>
              </span>
              <span>
                {channel.view_count === null ? "—" : <b>{fmtInt(channel.view_count)}</b>} views
              </span>
              <span>
                {channel.video_count === null ? "—" : <b>{fmtInt(channel.video_count)}</b>} videos
              </span>
              <span>
                {cadence === null ? "—" : <Derived formula={CADENCE_FORMULA}><b>{cadence}d</b></Derived>}{" "}
                cadence
              </span>
            </div>
            {channel.blurb && (
              <p className="inference" style={{ margin: "10px 0 0", fontSize: 12, maxWidth: "36rem" }}>
                {channel.blurb}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="section-kicker">
        <span className="kicker">▸ growth</span>
        <span className="rule" />
      </div>
      <ChannelGrowth
        series={snapshots}
        delta={channel.subscriber_delta}
        rate={channel.subscriber_growth_rate}
        bucket={channel.subscriber_bucket}
      />

      {/* still pulling views: Task 5 */}
      {/* what viewers ask: Task 5 */}
    </section>
  )
}
```

- [ ] **Step 2b: Real avatars with a server-side fallback**

Add to `web/lib/bundles.ts`:

```ts
/** True when the downloaded avatar exists on disk; the page then renders the
 *  image route, otherwise initials. Decided server-side so no broken img flashes. */
export function hasChannelAvatar(channelId: string): boolean {
  return existsSync(path.join(DB_DIR, "assets", "channels", `${channelId}.jpg`))
}
```

In the channel header (and everywhere this plan renders an avatar circle: `/channels` index, compare picker row), render:

```tsx
{hasChannelAvatar(channel.channel_id) ? (
  <img className={`avatar av56${channel.is_self ? " av-you" : ""}`}
    src={`/assets/channels/${channel.channel_id}`} alt="" width={56} height={56} />
) : (
  <span className={`avatar av56${channel.is_self ? " av-you" : ""}`}>{initials(channel.name)}</span>
)}
```

with `img.avatar { object-fit: cover }` added to globals.css if not present. The serving route `web/app/assets/channels/[id]/route.ts` already exists in the tree (another session's work); do not rewrite it, just consume it. Pass a `hasAvatar` boolean from server components into any client component that draws the circle; client components never call `hasChannelAvatar` themselves.

- [ ] **Step 3: Fix the cadence input honestly**

`still_growing_video_ids` is not "the channel's uploads". Add to `web/lib/bundles.ts`:

```ts
let videosByChannel: Map<string, VideoRow[]> | null = null

/** Server-side slice: all registered videos for one channel, newest last. */
export function channelVideos(channelId: string): VideoRow[] {
  if (!videosByChannel) {
    const bundle = load<VideosBundle>("videos.json")
    videosByChannel = new Map()
    for (const v of bundle.videos) {
      const list = videosByChannel.get(v.channel_id) ?? []
      list.push(v)
      videosByChannel.set(v.channel_id, list)
    }
    for (const list of videosByChannel.values()) {
      list.sort((a, b) => a.published_at.localeCompare(b.published_at))
    }
  }
  return videosByChannel.get(channelId) ?? []
}
```

Then in the page: `const uploads = channelVideos(channel.channel_id)` and `cadenceDays(uploads.map((v) => v.published_at))`. Add a parity test in `bundles.test.ts`: `channelVideos` of a known channel returns only that channel's rows, sorted ascending, and `channelVideos("nope")` is `[]`.

- [ ] **Step 4: `/channels` index and nav**

`web/app/channels/page.tsx`: a dense A-style table of all 72, default order growth rank 90d (nulls last, reuse `compareSortValues` semantics by sorting with rank ?? Infinity), columns: `#` (growth 90d rank or `—`), avatar initials + name (Link to the page), handle, subs (+bucket chip), views, videos, status chip when `absent`. Kicker: `ALL CHANNELS · 72 tracked · N absent`. Rows use `rowlink` class; self row carries the `you` chip.

`web/components/nav-links.tsx`: extend `LINKS` with `{ href: "/channels", label: "channels" }` and `{ href: "/compare", label: "compare" }`.

`web/components/leaderboard-table.tsx`: the channel-name cell becomes `<Link href={`/channels/${row.channel_id}`}>` keeping its current styling (read the file first; keep sort behavior untouched).

- [ ] **Step 5: Verify by running the app**

```bash
cd web && rtk npx vitest run
cd web && rtk npm run build
```
Expected: tests pass; build clean (the type gate for the new tsx).

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
SELF=$(rtk python3 -c "import json;print(json.load(open('../_db/channels.json'))['self_channel_id'])")
ANY=$(rtk python3 -c "import json;print(json.load(open('../_db/channels.json'))['channels'][0]['channel_id'])")
for r in /channels "/channels/$SELF" "/channels/$ANY" /nope-404; do
  printf "%s %s\n" "$r" "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002$r")"
done
kill "$(cat /tmp/ait-web-dev.pid)"
```
Expected: `/channels` and both channel pages `200`, `/nope-404` route `404`; unknown channel id under `/channels/` also `404`.

- [ ] **Step 6: Commit**

```bash
rtk git add web/app/channels web/components/channel-growth.tsx web/components/nav-links.tsx web/components/leaderboard-table.tsx web/lib/bundles.ts web/lib/bundles.test.ts
rtk git commit -m "feat(web): channel page header and growth, channels index, nav links"
```

---

### Task 5: Comment tables: "what viewers ask", inline video expansion, topic cross-creator view

**Files:**
- Create: `web/components/comment-table.tsx`, `web/components/comment-table.test.tsx`, `web/components/still-pulling.tsx`
- Modify: `web/app/channels/[id]/page.tsx` (fill the two Task 4 slots)
- Modify: `web/components/topic-leaf.tsx` and `web/app/topics/[id]/page.tsx` (replace the placeholder with the real table)

**Interfaces:**
- Consumes: `loadChannelComments`, `loadTopicComments`, `channelVideos`, `videosById` (Tasks 2/4); `categoryTabs`, `filterByCategory`, `sortComments`, `lagText` (Task 3); `fmtInt`, `fmtDate`, `deltaText` from `@/lib/trust`.
- Produces: `<CommentTable rows totals showVideo showCreator creatorNames />` (client) reused in three places: channel page main table, per-video expansion, topic page. `<StillPulling rows comments />` (client). Both are presentational: all data arrives as props from server components; client components never import `@/lib/bundles`.

- [ ] **Step 1: Write the failing component test**

`web/components/comment-table.test.tsx` (follow the render style of `sortable-table.test.tsx` / `topic-leaf.test.tsx`, which use vitest + testing-library already configured):

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CommentTable } from "./comment-table"
import type { CommentRow } from "@/lib/types"

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
  it("caps honestly: showing n of ingested when top is a slice", () => {
    render(<CommentTable rows={Array.from({ length: 8 }, (_, i) => row({ like_count: i }))}
      byCategory={counts} totals={totals} />)
    expect(screen.getByText(/showing 5 of 120/)).toBeTruthy()
    fireEvent.click(screen.getByText("show 10"))
    expect(screen.getByText(/showing 8 of 120/)).toBeTruthy()
  })
  it("sorts by replies when toggled", () => {
    render(<CommentTable
      rows={[row({ text: "L", like_count: 9, reply_count: 0 }),
             row({ text: "R", like_count: 0, reply_count: 9 })]}
      byCategory={counts} totals={totals} />)
    fireEvent.click(screen.getByText("replies"))
    const cells = screen.getAllByTestId("comment-text")
    expect(cells[0].textContent).toBe("R")
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && rtk npx vitest run components/comment-table.test.tsx`
Expected: FAIL (component does not exist).

- [ ] **Step 3: Implement `comment-table.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  categoryTabs, filterByCategory, lagText, sortComments,
} from "@/lib/channel"
import { fmtInt } from "@/lib/trust"
import type { CategoryCounts, CommentCategory, CommentRow } from "@/lib/types"

const CAT_ABBR: Record<CommentCategory, string> = {
  video_request: "req", question: "que", correction: "cor", suggestion: "sug", other: "oth",
}

export function CommentTable({
  rows,
  byCategory,
  totals,
  showVideo = true,
  creatorNames,
}: {
  rows: CommentRow[]
  byCategory: CategoryCounts
  totals: { ingested: number; classified: number }
  showVideo?: boolean
  /** topic view: channel_id -> display name; adds the who-said-it column */
  creatorNames?: Record<string, string>
}) {
  const [tab, setTab] = useState<"all" | CommentCategory>("all")
  const [sortBy, setSortBy] = useState<"likes" | "replies">("likes")
  const [shown, setShown] = useState(5)

  const visible = useMemo(
    () => sortComments(filterByCategory(rows, tab), sortBy),
    [rows, tab, sortBy],
  )
  const page = visible.slice(0, shown)
  const unclassified = totals.classified === 0

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="cattabs">
          {categoryTabs(byCategory, totals.ingested).map((t) => (
            <button
              key={t.key}
              className={`t${tab === t.key ? " on" : ""}`}
              disabled={t.key !== "all" && unclassified}
              onClick={() => { setTab(t.key); setShown(5) }}
            >
              {t.label} <b>{unclassified && t.key !== "all" ? "—" : fmtInt(t.count)}</b>
            </button>
          ))}
        </div>
        <span className="mono10" style={{ marginLeft: "auto" }}>
          sort{" "}
          {(["likes", "replies"] as const).map((s) => (
            <button key={s} className={`linklike${sortBy === s ? " on" : ""}`}
              onClick={() => setSortBy(s)}>{s}</button>
          ))}
        </span>
      </div>
      {unclassified && (
        <p className="note" style={{ margin: "6px 0 0", fontSize: 11 }}>
          not classified yet: the classification pass is build step 12. All{" "}
          {fmtInt(byCategory.unsorted)} ingested comments render unlabeled below.
        </p>
      )}
      <div className="card" style={{ marginTop: 8, overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {creatorNames && <th>creator</th>}
              <th>who</th>
              <th>comment</th>
              <th>cat</th>
              <th className="r">likes</th>
              <th className="r">repl</th>
              {showVideo && <th>video</th>}
              <th>topic</th>
              <th className="r">
                <span className="derived" title="days between the video going up and the comment">
                  lag
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.map((r) => (
              <tr key={r.comment_id}>
                {creatorNames && (
                  <td className="mono10">{creatorNames[r.channel_id] ?? r.channel_id}</td>
                )}
                <td className="mono10">{r.author}</td>
                <td data-testid="comment-text" style={{ maxWidth: "26rem" }}>{r.text}</td>
                <td>
                  {r.category ? (
                    <span className={`cat cat-${CAT_ABBR[r.category.key]}`}>
                      {CAT_ABBR[r.category.key]}
                    </span>
                  ) : (
                    <span className="cat muted">·</span>
                  )}
                </td>
                <td className="r num">{fmtInt(r.like_count)}</td>
                <td className="r num">{fmtInt(r.reply_count)}</td>
                {showVideo && (
                  <td className="mono10" style={{ maxWidth: "12rem" }}>
                    <a href={r.video_url} target="_blank" rel="noreferrer">
                      {r.video_title.length > 28 ? `${r.video_title.slice(0, 28)}…` : r.video_title} ↗
                    </a>
                  </td>
                )}
                <td className="mono10">
                  {r.topic_ids[0] ? (
                    <Link href={`/topics/${r.topic_ids[0]}`}>{r.topic_ids[0]}</Link>
                  ) : ("—")}
                </td>
                <td className="r num">{lagText(r.lag_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mono10" style={{ marginTop: 6, display: "flex", gap: 10 }}>
        <span>
          showing {Math.min(shown, visible.length)} of {fmtInt(totals.ingested)}
          {rows.length < totals.ingested ? ` · top ${rows.length} by likes` : ""}
        </span>
        {shown < visible.length && (
          <button className="linklike" onClick={() => setShown(shown === 5 ? 10 : shown + 20)}>
            {shown === 5 ? "show 10" : "show more"}
          </button>
        )}
      </div>
    </div>
  )
}
```

Add to `globals.css` (near the existing `.cat` rule): a `.linklike` button reset (transparent bg, primary color, underline on hover, `cursor: pointer`, visible `:focus-visible` outline) and category hues:

```css
.cat-req { background: color-mix(in srgb, #0e7490 14%, transparent); color: #0e7490; }
.cat-que { background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); }
.cat-cor { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
.cat-sug { background: color-mix(in srgb, #f5a623 20%, transparent); color: #9a6a00; }
.cat-oth { background: var(--secondary); color: var(--muted-fg, #6b6a6b); }
```

(match the actual token names present in globals.css; read it first.)

- [ ] **Step 4: Run the component test**

Run: `cd web && rtk npx vitest run components/comment-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: `still-pulling.tsx` with inline expansion**

```tsx
"use client"

import { useState } from "react"
import { deltaText, fmtDate, fmtInt } from "@/lib/trust"
import { CommentTable } from "./comment-table"
import type { CommentRow, CategoryCounts, StateCell } from "@/lib/types"

export interface StillPullingRow {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
  gained7d: StateCell | null
  multiplier: number | null
  topic_id: string | null
  comments: {
    totals: { comments: number }
    by_category: CategoryCounts
    top: CommentRow[]
  } | null
}

export function StillPulling({ rows }: { rows: StillPullingRow[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) {
    return (
      <div className="card pad">
        <p className="note" style={{ margin: 0 }}>
          No video currently clears the still-growing bar (traction thresholds in
          config/thresholds.json). That is a measurement, not an error.
        </p>
      </div>
    )
  }
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="tbl" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>video</th>
            <th className="r">published</th>
            <th className="r">views</th>
            <th className="r">
              <span className="derived" title="exact viewCount delta over the last 7 daily snapshots">+7d</span>
            </th>
            <th className="r">
              <span className="derived" title="30d views divided by channel median">mult</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <FragmentRow key={r.video_id} row={r}
              open={open === r.video_id}
              onToggle={() => setOpen(open === r.video_id ? null : r.video_id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({ row, open, onToggle }: {
  row: StillPullingRow; open: boolean; onToggle: () => void
}) {
  return (
    <>
      <tr className="rowlink" onClick={onToggle} aria-expanded={open}
        style={{ cursor: "pointer" }}>
        <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="mono10">{open ? "▾" : "▸"}</span>
          <img src={`https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`} alt=""
            width={64} height={36} loading="lazy"
            style={{ objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
          <span>{row.title}</span>
        </td>
        <td className="r num">{fmtDate(row.published_at)}</td>
        <td className="r num">{row.view_count === null ? "—" : fmtInt(row.view_count)}</td>
        <td className="r num gain">{row.gained7d ? deltaText(row.gained7d) : "—"}</td>
        <td className="r num">{row.multiplier === null ? "—" : `${row.multiplier.toFixed(1)}×`}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: "0.8rem 1rem", background: "var(--secondary)" }}>
            {row.comments ? (
              <>
                <div className="mono10" style={{ marginBottom: 6 }}>
                  <b className="num">{fmtInt(row.comments.totals.comments)}</b> comments
                  {row.topic_id ? <> · topic: <a href={`/topics/${row.topic_id}`}>{row.topic_id}</a></> : null}
                  {" · "}
                  <a href={`https://youtu.be/${row.video_id}`} target="_blank" rel="noreferrer">
                    open video ↗
                  </a>
                </div>
                <CommentTable rows={row.comments.top} byCategory={row.comments.by_category}
                  totals={{ ingested: row.comments.totals.comments, classified: 0 }}
                  showVideo={false} />
              </>
            ) : (
              <span className="mono10">no comments ingested for this video yet</span>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
```

Note: `totals.classified` for a video is not in the bundle per-video; pass the channel-level `classified` down from the server component instead of hardcoding 0 (adjust the prop where wired in Step 6).

- [ ] **Step 6: Wire both sections into the channel page**

In `web/app/channels/[id]/page.tsx`, replace the two Task 4 slots:

```tsx
const comments = loadChannelComments(channel.channel_id)
const growing = videosById(channel.still_growing_video_ids)
  .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
const stillRows = growing.map((v) => ({
  video_id: v.video_id,
  title: v.title,
  published_at: v.published_at,
  view_count: v.view_count,
  gained7d: v.traction.views_gained["7d"] ?? null,
  multiplier: v.multiplier.value,
  topic_id: (v.topic_assignments as { topic_id: string }[])[0]?.topic_id ?? null,
  comments: comments?.videos[v.video_id] ?? null,
}))
```

```tsx
<div className="section-kicker">
  <span className="kicker">▸ still pulling views</span><span className="rule" />
</div>
<StillPulling rows={stillRows} />

<div className="section-kicker">
  <span className="kicker">▸ what {channel.is_self ? "your" : "their"} viewers ask</span>
  <span className="rule" />
  {comments && (
    <span className="cap">{fmtInt(comments.channel.totals.ingested)} in {comments.channel.totals.window_days}d</span>
  )}
</div>
{comments ? (
  <CommentTable rows={comments.channel.top} byCategory={comments.channel.by_category}
    totals={comments.channel.totals} />
) : (
  <div className="card pad">
    <p className="note" style={{ margin: 0 }}>
      The comment ledger has not reached this channel yet. It fills on the next daily
      sweep with spare quota; 40 of 72 channels are in so far.
    </p>
  </div>
)}
```

(`CommentTable` and `StillPulling` are client components receiving plain props; keep every `loadX` call in the server page.)

- [ ] **Step 7: Topic page cross-creator table**

In `web/app/topics/[id]/page.tsx`: load `const topicComments = loadTopicComments(id)` and `const names = Object.fromEntries(loadChannels().channels.map((c) => [c.channel_id, c.name]))`, pass both into `TopicLeaf`. In `web/components/topic-leaf.tsx`: replace the placeholder block at ~line 97 with:

```tsx
{topicComments ? (
  <CommentTable rows={topicComments.topic.top} byCategory={topicComments.topic.by_category}
    totals={{ ingested: topicComments.topic.totals.comments, classified: 0 }}
    creatorNames={creatorNames} />
) : (
  <p className="note">no comments ingested for this topic yet</p>
)}
```

with props `topicComments` and `creatorNames` added to `TopicLeaf`'s prop type (keep `commentHealth` if still used elsewhere in the component, otherwise remove it and its call-site prop). Use the real classified total: `topicComments.topic.by_category` has real category counts once classification runs; derive `classified` as `totals.comments - by_category.unsorted`.

Update `web/components/topic-leaf.test.tsx` if the placeholder text it asserts changed.

- [ ] **Step 8: Full verification**

```bash
cd web && rtk npx vitest run && rtk npm run build
```
Expected: PASS + clean build.

Dev-server spot checks (channel with comments, channel without, topic):

```bash
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
WITH=$(rtk python3 -c "import glob,os;print(os.path.basename(sorted(glob.glob('_db/comments/channel/*.json'))[0])[:-5])")
curl -s "http://localhost:3002/channels/$WITH" | grep -c "viewers ask"
curl -s "http://localhost:3002/topics/claude-code-mcp-setup" | grep -c "not classified yet"
kill "$(cat /tmp/ait-web-dev.pid)"
```
Expected: both greps ≥ 1.

- [ ] **Step 9: Commit**

```bash
rtk git add web/components/comment-table.tsx web/components/comment-table.test.tsx web/components/still-pulling.tsx web/components/topic-leaf.tsx web/components/topic-leaf.test.tsx "web/app/channels/[id]/page.tsx" "web/app/topics/[id]/page.tsx" web/app/globals.css
rtk git commit -m "feat(web): comment tables with honest unclassified state, still-pulling expansion, topic cross-creator view"
```

---

### Task 6: `/compare`

**Files:**
- Create: `web/app/compare/page.tsx`, `web/components/compare-picker.tsx`

**Interfaces:**
- Consumes: `loadChannels`, `channelVideos`, `loadOpportunities` (bundles); `coverageByTopic`, `comparePartition` (Task 3); `cadenceDays`, `CADENCE_FORMULA` (Task 3); `fmtInt`, `bucketText`, `deltaText`, `pctText`, `initials` (trust); `VerdictBadge`, `Chip`, `Derived` (components).
- Produces: route `/compare?a=<id>&b=<id>`; defaults `b` = self channel, `a` = the top growth-90d ranked non-self channel.

- [ ] **Step 1: The picker (client)**

`web/components/compare-picker.tsx`:

```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"

export function ComparePicker({
  side,
  value,
  options,
  selfId,
}: {
  side: "a" | "b"
  value: string
  options: { channel_id: string; name: string; is_self: boolean }[]
  selfId: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <select
      className="chip"
      value={value}
      aria-label={side === "a" ? "left channel" : "right channel"}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString())
        next.set(side, e.target.value)
        router.replace(`/compare?${next.toString()}`)
      }}
    >
      {options.map((o) => (
        <option key={o.channel_id} value={o.channel_id}>
          {o.name}{o.channel_id === selfId ? " ★ you" : ""}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: The page**

`web/app/compare/page.tsx` (server), mockup A: picker row, gaps table with the three sub-sections, caveat callout, stacked numbers table.

```tsx
import { loadChannels, loadOpportunities, channelVideos } from "@/lib/bundles"
import { comparePartition, coverageByTopic } from "@/lib/compare"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, deltaText, fmtInt, initials, pctText } from "@/lib/trust"
import { Chip, Derived, VerdictBadge } from "@/components/trust"
import { ComparePicker } from "@/components/compare-picker"
import Link from "next/link"

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a, b } = await searchParams
  const bundle = loadChannels()
  const byId = new Map(bundle.channels.map((c) => [c.channel_id, c]))
  const self = bundle.channels.find((c) => c.is_self)
  const defaultA = bundle.channels
    .filter((c) => !c.is_self && c.rank.growth["90d"] !== null)
    .sort((x, y) => (x.rank.growth["90d"]! - y.rank.growth["90d"]!))[0]
  const him = byId.get(a ?? "") ?? defaultA ?? bundle.channels[0]
  const you = byId.get(b ?? "") ?? self ?? bundle.channels[1]

  const opps = loadOpportunities().rows
  const gaps = comparePartition(
    coverageByTopic(channelVideos(him.channel_id), him.channel_id),
    coverageByTopic(channelVideos(you.channel_id), you.channel_id),
    opps,
  )
  const bucketsDiffer = him.subscriber_bucket !== you.subscriber_bucket
  const options = bundle.channels.map((c) => ({
    channel_id: c.channel_id, name: c.name, is_self: c.is_self,
  }))

  const hisCadence = cadenceDays(channelVideos(him.channel_id).map((v) => v.published_at))
  const yourCadence = cadenceDays(channelVideos(you.channel_id).map((v) => v.published_at))

  return (
    <section>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: "1.2rem", fontSize: 13 }}>
        <span className="avatar av18">{initials(him.name)}</span>
        <ComparePicker side="a" value={him.channel_id} options={options}
          selfId={bundle.self_channel_id} />
        <span className="mono10">vs</span>
        <span className="avatar av18 av-you">{initials(you.name)}</span>
        <ComparePicker side="b" value={you.channel_id} options={options}
          selfId={bundle.self_channel_id} />
      </div>

      <div className="section-kicker">
        <span className="kicker">▸ what {him.name} covers that {you.is_self ? "you do" : `${you.name} does`} not</span>
        <span className="rule" /><span className="cap">the actionable part</span>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead><tr><th>topic</th><th className="r">him</th><th className="r">you</th>
            <th className="r">his views</th><th>verdict</th></tr></thead>
          <tbody>
            {gaps.himOnly.map((g) => (
              <tr key={g.topic_id} className="rowlink">
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num">{g.him!.videos} videos</td>
                <td className="r num muted">0</td>
                <td className="r num">{fmtInt(g.him!.views)}</td>
                <td>{g.verdict ? <VerdictBadge verdict={g.verdict} /> : <span className="mono10">not scored</span>}</td>
              </tr>
            ))}
            {gaps.youOnly.length > 0 && (
              <tr><td colSpan={5} className="sub mono10">— you cover, he does not —</td></tr>
            )}
            {gaps.youOnly.map((g) => (
              <tr key={g.topic_id} className="rowlink">
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num muted">0</td>
                <td className="r num">{g.you!.videos}</td>
                <td className="r num muted">—</td>
                <td className="mono10">—</td>
              </tr>
            ))}
            {gaps.both.length > 0 && (
              <tr><td colSpan={5} className="sub mono10">— both —</td></tr>
            )}
            {gaps.both.map((g) => (
              <tr key={g.topic_id} className="rowlink">
                <td><Link href={`/topics/${g.topic_id}`}>{g.topic_id}</Link></td>
                <td className="r num">{g.him!.videos} videos</td>
                <td className="r num">{g.you!.videos}</td>
                <td className="r num">{fmtInt(g.him!.views)}</td>
                <td>{g.verdict ? <VerdictBadge verdict={g.verdict} /> : <span className="mono10">not scored</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-kicker">
        <span className="kicker">▸ the numbers</span><span className="rule" />
      </div>
      {bucketsDiffer && (
        <div className="callout warn" style={{ marginBottom: 8, fontSize: 12 }}>
          ⚠ Different bucket widths. {him.name} rounds to {fmtInt(him.subscriber_bucket ?? 0)},{" "}
          {you.is_self ? "you round" : `${you.name} rounds`} to {fmtInt(you.subscriber_bucket ?? 0)}.
          A subscriber comparison across this size gap is not like-for-like. Views carry no such caveat.
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead><tr><th></th><th className="r">{him.name}</th>
            <th className="r">{you.name}{you.is_self ? " ★" : ""}</th></tr></thead>
          <tbody>
            <tr><td>subscribers</td>
              <td className="r num">{him.subscriber_count === null ? "—" : fmtInt(him.subscriber_count)} <Chip>{bucketText(him.subscriber_bucket)}</Chip></td>
              <td className="r num">{you.subscriber_count === null ? "—" : fmtInt(you.subscriber_count)} <Chip>{bucketText(you.subscriber_bucket)}</Chip></td></tr>
            <tr><td><Derived formula="last snapshot minus first snapshot in window">Δ subs 90d</Derived></td>
              <td className="r num">{deltaText(him.subscriber_delta["90d"])}</td>
              <td className="r num">{deltaText(you.subscriber_delta["90d"])}</td></tr>
            <tr><td><Derived formula="Δ subs divided by subs at window start">growth rate 90d</Derived></td>
              <td className="r num">{pctText(him.subscriber_growth_rate["90d"])}</td>
              <td className="r num">{pctText(you.subscriber_growth_rate["90d"])}</td></tr>
            <tr><td>views</td>
              <td className="r num">{him.view_count === null ? "—" : fmtInt(him.view_count)}</td>
              <td className="r num">{you.view_count === null ? "—" : fmtInt(you.view_count)}</td></tr>
            <tr><td><Derived formula="exact viewCount delta over window">Δ views 90d</Derived></td>
              <td className="r num">{deltaText(him.view_delta["90d"])}</td>
              <td className="r num">{deltaText(you.view_delta["90d"])}</td></tr>
            <tr><td><Derived formula="Δ subs divided by Δ views, times 1000">subs / 1k views 90d</Derived>{" "}<span className="mono10">the real gap</span></td>
              <td className="r num"><b>{subsPerK(him)}</b></td>
              <td className="r num"><b>{subsPerK(you)}</b></td></tr>
            <tr><td>videos 30d</td>
              <td className="r num">{him.videos_published["30d"] ?? "—"}</td>
              <td className="r num">{you.videos_published["30d"] ?? "—"}</td></tr>
            <tr><td><Derived formula="median of exact viewCounts, last 30d uploads">median views 30d</Derived></td>
              <td className="r num">{him.median_views_per_video["30d"] === null ? "—" : fmtInt(him.median_views_per_video["30d"]!)}</td>
              <td className="r num">{you.median_views_per_video["30d"] === null ? "—" : fmtInt(you.median_views_per_video["30d"]!)}</td></tr>
            <tr><td><Derived formula={CADENCE_FORMULA}>cadence</Derived></td>
              <td className="r num">{hisCadence === null ? "—" : `${hisCadence}d`}</td>
              <td className="r num">{yourCadence === null ? "—" : `${yourCadence}d`}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function subsPerK(c: { subs_per_1k_views: Record<string, { state: string; value: number | null }> }) {
  const cell = c.subs_per_1k_views["90d"]
  return cell && cell.state === "ok" && cell.value !== null ? cell.value.toFixed(1) : "—"
}
```

Wrap the `ComparePicker` usage in a `<Suspense>` boundary if `next build` demands it for `useSearchParams` (it will when the page is statically analyzed; the page itself reads `searchParams` so it is dynamic already, but if the build errors, add `export const dynamic = "force-dynamic"` to the page).

Note today's honest reality: with 1 snapshot day, every `90d` cell renders `building, 1 of N`; the page must look correct in that state, not just the populated one.

- [ ] **Step 3: Verify**

```bash
cd web && rtk npx vitest run && rtk npm run build
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
curl -s -o /dev/null -w "compare %{http_code}\n" http://localhost:3002/compare
SELF=$(rtk python3 -c "import json;print(json.load(open('../_db/channels.json'))['self_channel_id'])")
ANY=$(rtk python3 -c "import json;print(json.load(open('../_db/channels.json'))['channels'][0]['channel_id'])")
curl -s -o /dev/null -w "compare?a %{http_code}\n" "http://localhost:3002/compare?a=$ANY&b=$SELF"
kill "$(cat /tmp/ait-web-dev.pid)"
```
Expected: both `200`.

- [ ] **Step 4: Commit**

```bash
rtk git add web/app/compare web/components/compare-picker.tsx
rtk git commit -m "feat(web): compare page, gaps lead and numbers follow"
```

---

### Task 7: Craft pass, full verification, docs

This is where "better than social-invest" gets enforced. The visual language stays locked; the elevation is in details social-invest never polished.

**Files:**
- Modify: `web/app/globals.css`, any component the audit touches
- Modify: `CLAUDE.md`

- [ ] **Step 1: The craft checklist, applied to every page this plan built**

Work through each item; fix in place:

1. **Tabular numerals everywhere numbers align**: `.num { font-variant-numeric: tabular-nums }` if not already present.
2. **Sticky headers** on tables longer than one screen (`/channels` index, leaderboard, comment tables): `thead th { position: sticky; top: 0; background: var(--background); z-index: 1 }` scoped to a `.tbl-sticky` class applied to those tables.
3. **Row affordance**: `.rowlink:hover` background tint and `cursor: pointer` only where a row actually navigates or expands; expanding rows get `aria-expanded` (done in Task 5) and respond to Enter/Space via `tabIndex={0}` + `onKeyDown`.
4. **Focus visibility**: every interactive element shows `:focus-visible` outline (`outline: 2px solid var(--primary); outline-offset: 2px`).
5. **Motion**: transitions at most 150ms on hover/expand, wrapped in `@media (prefers-reduced-motion: no-preference)`.
6. **No layout shift**: comment expansion pushes rows down (fine) but tab switches and sort toggles must not reflow column widths; give `.tbl` fixed column hints where needed (`table-layout: fixed` on comment tables with explicit widths).
7. **Empty and building states read as designed states**, not as errors: consistent `callout`/`note` styling across the channel page, topic page, compare (already written in Tasks 4-6; verify visually).
8. **Long text**: comment text clamps at 3 lines with `-webkit-line-clamp`, full text on click (toggle a `.expanded` class).
9. **Dark parity**: if globals.css carries a dark scheme, check every new hue (cat chips, callouts) in both; use `color-mix` against tokens rather than hardcoded darks.

- [ ] **Step 2: Visual QA with screenshots**

Start the dev server, then use the playwright-cli skill (or the Playwright MCP browser tools) to screenshot at 1280 and 780 widths: `/channels`, `/channels/<id with comments>`, `/compare`, `/topics/claude-code-mcp-setup`. Review each against `docs/mockups/channel.html` and `compare.html` Version A: section order, kicker style, chip placement, table density. Fix deviations that make it worse than the mockup; keep deviations that make it better (that is the point of this pass), and note them in the commit message.

- [ ] **Step 3: Full verification, whole project**

```bash
rtk pytest -q
rtk uvx ruff check pipeline test_anchors.py scripts
cd web && rtk npx vitest run
cd web && rtk npm run build
cd web && (npm run dev > /tmp/ait-web-dev.log 2>&1 & echo $! > /tmp/ait-web-dev.pid)
sleep 20
for r in / /leaderboard /topics /channels /compare; do
  printf "%s %s\n" "$r" "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002$r")"
done
kill "$(cat /tmp/ait-web-dev.pid)"
```
Expected: pytest all pass, ruff clean, vitest all pass, build clean, five 200s.

- [ ] **Step 4: Update `CLAUDE.md`**

Replace:

```
**Build steps 0 to 10 are done.** `pipeline/`, its tests, and `_db/` all run for real today.
`web/` is the Next.js dashboard on port 3002 (`cd web && npm run dev`; predev rebuilds `_db/`;
`npx vitest run` from `web/` for the web tests). Channel pages, the comment table, and /compare
are the next phase.
```

with:

```
**Build steps 0 to 11 are done.** `pipeline/`, its tests, and `_db/` all run for real today.
`web/` is the Next.js dashboard on port 3002 (`cd web && npm run dev`; predev rebuilds `_db/`;
`npx vitest run` from `web/` for the web tests). Channel pages, comment tables, and /compare are
live; comments are read as per-route slices from `_db/comments/`. Comment classification
(step 12) and the reply queue are the next phase.
```

and replace:

```
**Next is step 11** (`docs/spec.md` §10): channel pages, then comment classification. **Step 13 is
a hard gate**: no extraction work begins until a 20-video manual spike measures artifact capture
against a 50% floor.
```

with:

```
**Next is step 12** (`docs/spec.md` §10): comment classification, then the reply queue. **Step 13
is a hard gate**: no extraction work begins until a 20-video manual spike measures artifact capture
against a 50% floor.
```

- [ ] **Step 5: Final commit**

```bash
rtk git add web CLAUDE.md
rtk git commit -m "feat(web): craft pass over channel pages and compare, docs to step 11 done"
```

---

## Out of scope for this plan

- Comment classification (T22 / build step 12): every `category` stays null; the UI's unclassified state is the deliverable here.
- The reply queue (own-channel section): needs classification for the question filter and LLM drafts; `answered` detection already ships in the data.
- `web/e2e/monday.spec.ts`: still deferred; the curl checks cover this surface, and the Monday flow is worth scripting once classification and synthesis give it content. Deferred twice now; if it defers a third time, question whether it earns existence.
- Writing or modifying the avatar serving route: it exists in the tree from a concurrent session; this plan only consumes it (Task 4 Step 2b) and falls back to initials when a file is missing.
- `view_growth_pct`, `breakout_count`, `top_topics` on channels.json: still deferred, still unrendered. Cadence is now computed web-side as Derived with its formula shown; the other three stay absent rather than invented.
- The vidIQ backfill (4a) and keyword sweep (4b): authorization unchanged from the handoff; growth charts render `building` states until bought or accumulated.
