# Merge audit: `feat/data-spine` → `main`

Two questions this answers:

1. **Coverage** — does the branch actually contain a commit for every task in every plan,
   the way `projects/social-invest/` reads section by section?
2. **Conformance** — do those commits carry the shape `CLAUDE.md` § Commits borrowed from
   `social-invest`?

Coverage passed on the first read. Conformance did not, and a `filter-branch` pass has since
closed most of it.

## The two readings

**Read 1, against `ad2afb2`.** Branch tip `e1ea72d`, 168 ahead of `main`, 1 behind. Coverage
passed. Conformance failed on five counts: one commit was not a conventional commit, 106 of 168
carried a forbidden scope, 51 had no body, 84 were missing a footer, 52 subjects ran past 72
characters.

**Read 2, against `ce0180d`, the same day.** A `filter-branch` rewrite reordered nothing and
changed no tree — all 169 commits map 1:1 to their old selves by identical tree hash — but it
rewrote subjects, and `main` was then reset onto the result rather than merged into. The scope
and non-conventional findings are closed. Bodies and footers are not. Every hash below is the
post-rewrite one.

`ad2afb2` and the duplicate `Section 1: Creating Implementation Plan` no longer exist in this
history. Old hashes survive only in reflog.

---

## Section map

Section 1 now leads `main` directly; Sections 2 through 7 follow it in order.

| # | Section | Plan | Commits | Range |
|---|---------|------|--------:|-------|
| 1 | Implementation plan | — | 1 | `c29fefa` |
| 2 | Data spine, 19 tasks | `docs/plans/2026-07-27-data-spine.md` | 33 | `98eaa15` → `7f1bed5` |
| 3 | Web dashboard, 12 tasks | `docs/plans/2026-07-28-web-dashboard.md` | 25 | `81727c7` → `c575847` |
| 4 | Channels, comments, compare, 7 tasks | `docs/plans/2026-07-28-channels-compare.md` | 21 | `f1e6d71` → `1cbeb90` |
| 5 | Topics recent feed, 12 tasks | `docs/superpowers/plans/2026-07-29-topics-recent-feed.md` | 30 | `a6537c5` → `b2badfc` |
| 6 | Five-route refinement, 15 tasks | `docs/superpowers/plans/2026-07-30-dashboard-refinement.md` | 26 | `f819906` → `1475aa8` |
| 7 | Post-plan polish | none | 33 | `e354e8e` → `ce0180d` |

Sections 2–6 total 65 planned tasks. Section 7 is unplanned work: the leaderboard usability
audit and its 45 findings, the paging and sorting rewrite, and the filter-rail teardown.

---

## Coverage checklist

Method: each plan task declares a `**Files:**` block. Every declared path was matched against
the files each commit in that section actually touched. A task is ✅ when one commit covers
its whole declared file set.

### Section 2 — Data spine (19/19)

| Task | Commit | Follow-ups |
|---|---|---|
| 1 Package skeleton, config loader, anchor tests | `98eaa15` 6/6 | |
| 2 Topic tree, derived leaves, shape, keyword matcher | `44689c0` 2/2 | `a0597c9` |
| 3 YouTube Data API client + quota ledger | `3253386` 2/2 | |
| 4 Resolve `channel_id` and `niche` on the roster | `66ca5de` 2/2 | |
| 5 Daily channel sweep, `status`, gap detection, self-channel guard | `3587716` 2/2 | `cf52b8e` |
| 6 Per-video sweep + append-only video registry | `601fd6d` 2/2 | `50e9bdb` |
| 7 `delta()`, `building`, monotonicity filter | `d9360e7` 2/2 | |
| 8 Measurement floor, `bounded`, four rank modes, three-way sort | `cd329f1` 2/2 | `eddf73e` |
| 9 vidIQ, cost guard, 360-credit backfill, keyword sweep | `e45986e` 2/2 | `fee3b55` |
| 10 Multipliers from free exact view counts | `58d0ac8` 2/2 | `28a20b1` |
| 11 Per-video traction and `still pulling views` | `486ad50` 2/2 | |
| 12 Comment ingest, lag column, `answered`, resumable ledger | `165c393` 2/2 | `d0fe9db`, `e2995ee` |
| 13 GitHub velocity, indie score, caps, backoff | `dd68273` 2/2 | |
| 14 GitHub Trending sweep via Firecrawl | `6b2a68a` 3/3 | `6e949e0` |
| 15 The verdict grid | `73e8511` 2/2 | `45c92a3` |
| 16 The 0–100 opportunity score, reproducing 71.9 | `6bbb27d` 2/2 | |
| 17 `build_data`, reader layer, first four bundles | `17ee07e` 9/9 | `a3660a8` |
| 18 Remaining four bundles, end-to-end 71.9 check | `908e944` 7/7 | |
| 19 launchd agent, four skills, doc corrections | `2e5cb85` ⚠️ | `78fe185`, `6ca29b5` |

⚠️ **Task 19 shipped under different names.** The plan named `ait-analyze` and `ait-snapshot`;
`2e5cb85` created those, and the roster today is `ait-dashboard`, `ait-ingest`,
`ait-opportunity`, `ait-refresh`, `ait-synthesize` — five, not four. The rename happened inside
`a964f3a`, a Section 6 commit whose subject says `collapse the home page into the leaderboard`.
Nothing is missing, and `CLAUDE.md` now records the rename and why the names track layers —
but no commit subject in this history names it.

### Section 3 — Web dashboard (12/12)

| Task | Commit | Follow-ups |
|---|---|---|
| 1 Bundle reader + schema parity test | `58b7895` 6/6 | |
| 2 Next.js shell on 3002 with ported tokens | `bf6ea1f` 7/9 | `bd80c54`, `2b11680` |
| 3 Honest-state text lib + trust tiers | `0f62ffb` 3/3 | `e2a8ebf` |
| 4 Three-way sort + sortable-table port | `bfae97e` 3/3 | |
| 5 Growth card grid + cold-start callout | `7071796` 6/6 | `f88386c`, `8e9a201` |
| 6 Opportunity table with expandable derivations | `26ed3c2` 4/4 | `75f5e46` |
| 7 Home page assembly | `4c64cb8` 1/1 | |
| 8 `/leaderboard`, the full 72 | `9751b15` 2/2 | `f010fa8` |
| 9 Chain-map port | `445cfdb` 3/3 | |
| 10 Topic leaf page | `7a6bbaf` 4/4 | `e5e027e` |
| 11 Topic parent page with rollup trend | `fd599f2` 5/5 | |
| 12 Topics index, build check, docs | `7c5f1e4` 1/1 | |

Tasks 10 and 11 shipped and were later deleted by `a964f3a` when the home page collapsed into
the leaderboard. That is intentional, but it means `topic-leaf.tsx` and `topic-parent.tsx` do
not appear in `main...feat/data-spine` at all.

### Section 4 — Channels, comments, compare (7/7)

| Task | Commit | Follow-ups |
|---|---|---|
| 1 T13, split comments bundle per-channel and per-topic | `79ead4d` | `37e1139` |
| 2 Web comment types and loaders with parity tests | `e0fabb4` 3/3 | `993bf70` |
| 3 Pure helpers, `lib/channel.ts` and `lib/compare.ts` | `6286f1b` 4/4 | |
| 4 `/channels/[id]` header + growth, index, nav | `eeef5dd` 5/6 | `3e6f99e`, `39e81a7` |
| 5 Comment tables, inline expansion, topic cross-creator | `420c6ef` 6/6 | |
| 6 `/compare` | `e5f17ef` 2/2 | `e3eea13` |
| 7 Craft pass, full verification, docs | `39e81a7` 1/1 | `1cbeb90` |

### Section 5 — Topics recent feed (11/12, one correctly absent)

| Task | Commit |
|---|---|
| 1 Start the snapshot clock | **none, and none expected** — the plan says nothing to commit if the installer only touches `~/Library/LaunchAgents/` |
| 2 Batch the roster for vidIQ | `e3ef304` 2/2 |
| 3 Normalise one vidIQ response row | `79639f7` 2/2 |
| 4 Fetch every batch, record failures | `ea9261b` 2/2 |
| 5 Sweep to `_synthesize/` behind the cost guard | `18c98cd` 2/2 |
| 6 Build `_db/recent.json` | `5a7ab08` 4/4 |
| 7 Web filter, sort, cap | `6f1bd4c` 4/4 |
| 8 YouTube-geometry card | `d818409` 2/2 |
| 9 Mount the feed on `/topics` | `26ec563` 2/2 |
| 10 Group the outliers into patterns | `9fb7dec` 3/3 |
| 11 Render the pattern rows | `04af488` 3/3 |
| 12 Document and close out | `8c9b4b7` 2/2 |

### Section 6 — Five-route refinement (14/15, one genuinely missing)

| Task | Commit | Follow-ups |
|---|---|---|
| 1 Shared window parameter | `dea27fc` 2/2 | |
| 2 The gap value | `ba6ea6b` 2/2 | `448d514` |
| 3 Window and format stats over videos | `6502acf` 2/2 | |
| 4 The gap cell component | `ba41b1a` 3/3 | `03270d1`, `1035480` |
| 5 The compare table | `22b829c` 2/2 | |
| 6 Plain-language labels, row expansion | `820b0a2` 1/1 | `06f71d9` |
| 7 Two-channel selection on the leaderboard | `83919f9` 3/3 | `899bfea` |
| 8 The channels directory | `3f4e770` 5/5 | `b37162c` |
| 9 Grouping the feed by topic | `94d74b0` 2/2 | `f6ade2d` |
| 10 Rendering the grouped feed | `2c649fe` 2/2 | |
| 11 By-window table on the channel page | `2f3ba61` 2/2 | |
| 12 Collapse the comment table | `7e24c87` 1/1 | |
| 13 Carry the window across links | `e4be8d3` 4/5 | `e354e8e` |
| 14 **Full verification** | run and recorded here, 2026-07-31 | |
| 15 Make the gap visible, not just computed | `1475aa8` 2/2 | |

**Task 14 asked for `test(web): verify the five-route refinement end to end`, and no commit of
type `test` exists anywhere on this branch.** Its five steps had no recorded evidence, so they
were run against the branch tip `ce35840` on 2026-07-31:

| Step | Result |
|---|---|
| 1 `npx vitest run` | 255 pass, 0 fail |
| 2 `npx tsc --noEmit` | no errors |
| 2 `npm run build` | 0 errors, 0 warnings |
| 3 dead-code grep | `coverageByTopic`, `comparePartition`, `ChannelsTable` gone |
| 4 walk `/`, `/channels`, `/compare`, `/topics`, `/channels/[id]` | all 200, no error boundary, clean dev log |

Pipeline suite alongside it: 496 pass.

Step 3 does not come back empty, and the plan's expectation was too broad. `WINDOW_CHOICES`
still lives in `web/lib/recent.ts`, where it drives the recent feed's window offer. What Task 12
asked to delete was the separate `WINDOW_CHOICES` in `components/channel-growth.tsx`, and that
one is gone. The grep as written cannot tell the two apart.

Step 4 was walked over HTTP, not by eye against the wireframes. Every route returns 200 and
renders, but "every number that is not `ok` renders its state, never a zero" was not checked
visually.

Two planned files were never created and the design moved on without saying so:
`web/components/channels-table.tsx` (Task 8, replaced by the shared sortable table) and
`web/lib/topic-groups.ts` + its test (Task 9, folded into the feed component).

---

## Conformance checklist

`CLAUDE.md` § Commits, added in `06c3a72`, states the shape. The 168 commits that preceded and
followed it were never brought to it. The `filter-branch` pass closed the first two lines below
and left the rest.

- [x] **1 commit was not a conventional commit at all** — `Section 1: Creating Implementation
      Plan`, now `c29fefa docs(ait): data-spine implementation plan and the mockup board`.
- [x] **106 of 168 commits carried a scope the convention forbids.** Only `ait-web` (28), `ait`
      (25) and `pipeline` (9) conformed. All 169 do now: `ait-web` 79, `pipeline` 45, `ait` 44,
      `ait-ingest` 1. The `style` type is gone; the history is `feat` 80, `fix` 50, `docs` 28,
      `refactor` 11. What was remapped:
  - `web` → `ait-web`: 56 commits. The rule names `(web)` explicitly as the old spelling.
  - Feature scopes → `pipeline`: 40 commits across `topics` (5), `growth` (4), `outliers` (4),
    `snapshot` (3), `comments` (3), `github` (3), `build` (3), `vidiq` (2), `multiplier` (2),
    `verdict` (2), `patterns` (2), and one each of `youtube`, `roster`, `traction`, `score`,
    `recent`, `feed`, `momentum`.
  - `plan` (4), `skills` (1), `mockups` (1) → `ait` or a skill name.
  - No scope at all: `9d1d0bf`, `8c9b4b7`, `8d6de0a`.
- [ ] **51 of 169 commits still have no body.** The convention says every commit that changes
      code needs one, carrying the mechanism, the concrete row that exposed it, and a closing
      line naming what ran and what passed. Concentrated in Section 3, where 24 of 25 commits
      are bare. The rewrite did not touch bodies.
- [ ] **84 of 169 commits are still missing `Co-Authored-By` or `Claude-Session`.** Exactly half.
- [ ] **52 subjects run past 72 characters.**
- [ ] **`a964f3a` does three unrelated things** under one subject: collapses the home page,
      deletes the topic leaf and parent pages, and renames the whole skill roster.
      648 insertions, 819 deletions, 25 files.

### One convention that cannot be met as written

`CLAUDE.md` names `data` as a type for `_raw/`/`_synthesize/`/`_db/` churn, and `06c3a72`'s body
reads the absence of any `data:` commit as a discipline gap. It is not. `.gitignore` excludes
all three layers except their READMEs, so the daily launchd run has nothing to commit and a
`data:` commit is structurally impossible here. `social-invest` tracks its data; this repo does
not. Either drop `data` from the type list or say why it is reserved.

---

## How it actually landed

Not by a merge commit. `filter-branch` rewrote every subject on `feat/data-spine`, and `main`
was **reset** onto the result — `main@{0}: branch: Reset to feat/data-spine`. `main` is now the
full 169-commit history on top of `6e33804`, and `feat/data-spine` is `main` plus this document.
There is no merge commit and no section-map commit body; this file is where the section map
lives.

The rewrite is safe to trust on content: all 169 old and new commits pair up by identical tree
hash, so nothing in the working tree moved. Only messages changed.

`origin/main` is still at `ad2afb2` and has not seen any of this. Pushing `main` requires a
force-push, because the remote's `ad2afb2` is not an ancestor of the local history.

Still open:

1. **51 bodies and 84 footers.** The rewrite fixed scopes, not evidence. Rewriting these means
   inventing verification lines for commits whose runs nobody recorded, which the convention's
   own "never claim a check that did not run" forbids. Leave them; `CLAUDE.md` § Commits governs
   from here forward.
2. Fix the `data` type line in `CLAUDE.md` — it is wrong today regardless.
3. Walk the five routes by eye against the wireframes. Task 14 Step 4 was verified over HTTP
   only.
4. Correct the Task 14 dead-code grep in the refinement plan so it targets
   `components/channel-growth.tsx` rather than every `WINDOW_CHOICES` in the tree.
5. Decide on the force-push, and on the three backup refs (`backup-pre-rename-main`,
   `backup-pre-rename-spine`, `backup-pre-squash`) still pinning the pre-rewrite objects.
