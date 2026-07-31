# Leaderboard usability audit — 2026-07-30

45 confirmed findings, 3 rejected by adversarial verify. 4 lenses, 52 agents.

## P1 · Every Derived-tier formula and every missing-data explanation is title=-only, so keyboard and touch users can never read it
`web/components/trust.tsx:9 (and web/components/leaderboard-table.tsx:308,313,317,321,326,330; web/components/sortable-table.tsx:92)` · lens: a11y

**Problem** `Derived` renders `<span className="derived num" title={formula}>` — a non-focusable span. `.derived` (globals.css:70) gives it a dotted underline and `cursor: help`, so it visibly advertises a disclosure. That disclosure is the ONLY place the formula lives for Δsubs, growth, Δviews and subs/1k — four of the eight columns, ~40 cells per page. A `title` fires on pointer hover only: no browser shows it on keyboard focus, and no touch device shows it at all. The same is true of the missing-data states (`title={stateTitle(views)}` on a plain `<span className="muted">`) — the sentence explaining WHY a number is absent is mouse-only, and of every column tip, which sits as `title` on a `<th>` (never focusable, confirmed in the served HTML: `<th aria-sort="none" class="r" title="subscriber_count newest minus oldest in window...">`). A phone user sees a dotted-underlined number with a help cursor they cannot invoke. This collides head-on with the project invariant that a Derived claim shows its formula: on touch it does not show it at all.

**Fix** Give the disclosure a real focusable trigger instead of `title`. Minimal, no dependency: make `Derived` render `<button type="button" className="derived num" aria-describedby={id}>` with a visually-hidden-until-open `<span role="tooltip" id={id}>` sibling shown on `:hover`, `:focus-visible` and `:focus-within` (the `.avpop` pattern already in globals.css:254-265 is the working precedent). Do the same for the `stateTitle` spans. For the header tips, move `title={col.tip}` off the `<th>` and onto the `<button className="thsort">` that is already inside it, and add `aria-describedby` so it is announced rather than only hover-rendered.

**Revised fix** The finding stands; the proposed fix has two defects that must be corrected before anyone implements it.

DEFECT A — the cited precedent is the bug you are already fixing. The fix says to copy "the `.avpop` pattern already in globals.css:254-265." Read that block: it is now `position: fixed` portalled onto the body, and the comment above it (globals.css:254-259) exists specifically to record why — "an absolutely positioned panel is laid out even while hidden, and inside `.tblwrap`… ten of those under the last row is 121px of empty scrollable band." An absolutely-positioned, visually-hidden-until-`:hover`/`:focus-within` sibling on every Derived cell is ~40 such boxes per page instead of 10. It reintroduces the exact scrollHeight inflation at 4x magnitude. The real precedent is `components/avatar-peek.tsx` — React state plus a body portal plus `onFocus`/`onBlur` — not a CSS sibling.

DEFECT B — a `<button>` Derived nests a button inside a button. `components/compare-table.tsx:216-294` uses `<Derived>` as the row *label* for 8 rows, and `compare-table.tsx:355-359` renders `{row.label}` inside `<button type="button" className="linklike" aria-expanded={open}>` whenever the row is expandable. Invalid HTML, a React DOM-nesting warning, and a dead expander. Blast radius generally: `Derived` has ~20 call sites across leaderboard-table, compare-table, opportunity-table, growth-card, and app/channels/[id]/page.tsx.

Revised, in three parts:

1. Make the trigger focusable without changing the element for every caller. Either add an `as`/`interactive` escape hatch to `Derived` so compare-table's expandable labels keep rendering a span, or — simpler — keep the `<span>` and give it `tabIndex={0}` plus `role="note"`. If you do go to `<button type="button">`, it needs `font: inherit; padding: 0; background: none; border: 0;` and must keep `.num`'s `font-variant-numeric: tabular-nums` (globals.css:42), or the four numeric columns lose the tabular alignment the codebase's own comments fought for.

2. Render the formula through the existing portal machinery, opened on `onFocus`/`onBlur` and `onPointerEnter`/`onPointerLeave` exactly as avatar-peek does, wired with `aria-describedby` to the portalled `role="tooltip"` node. One shared portal instance for the whole page, not one hidden node per cell. Keep the `title` attribute as-is alongside it — it costs nothing and is the graceful degradation if JS has not hydrated.

3. Headers: do not simply move `title={col.tip}` onto `.thsort`, because that button already owns `title={`Sort by ${col.label}`}` and one of the two silently loses. Pick one owner. The sort affordance is already announced by `aria-sort` plus the `▾/▴/↕` indicator, so drop the "Sort by X" title, put `col.tip` on the button, and add `aria-describedby` pointing at the same tooltip node. That also fixes the currently near-unreachable tip on all seven sortable columns.

Severity P1 is right, but scope it as app-wide rather than leaderboard-only — the leaderboard is simply where the density (~40 cells per page) makes it worst.

## P1 · The avatar peek is a tabindex=0 span nested inside the row's link: invalid nesting, a third tab stop per row, and no touch path at all
`web/components/avatar.tsx:99 (rendered inside the Link at web/components/leaderboard-table.tsx:290)` · lens: a11y

**Problem** Served HTML confirms `<a class="chcell" href="/channels/..."><span class="avpeek" tabindex="0" aria-label="Pat Simmons">…`. Three consequences. (1) An `<a>` must not contain interactive content; a `tabindex=0` descendant is exactly that, so this is a content-model violation and AT behaviour is undefined. (2) Tab order is checkbox → link → avpeek per row, i.e. 30 stops per page, not the 20 the design assumes, and the extra stop announces the channel name a second time (`aria-label={name}` duplicates the adjacent `.chname` text). (3) On touch, the avatar pixel belongs to the link, so the first tap navigates to the channel page — the `:hover`-emulation path that normally opens a CSS peek never fires. So the peek has no touch path whatsoever, and its contents are `aria-hidden="true"` (avatar.tsx:101), meaning the coverage stats (`scraped 72 of 70`, `comments`) that appear nowhere else on the row are invisible to screen reader users too.

**Fix** Hoist `AvatarPeek` out of the `<Link>` so the peek trigger and the navigation target are separate elements, and make the trigger a real `<button type="button" aria-expanded>` rather than a `tabindex` span — that also gives touch a tap-to-open path. Drop `aria-hidden` from `.avpop` and drop the redundant `aria-label` from the wrapper so the stats are actually readable.

**Revised fix** Make the row's existing link the peek trigger instead of adding a second one.

1. Delete `tabIndex={0}` and `aria-label={name}` from the `.avpeek` span (avatar-peek.tsx:106-107). That alone kills the content-model violation, the third tab stop, and the doubled accessible name, and it takes the page from 30 focusables to 20.

2. Give AvatarPeek an optional `triggerRef`-style escape hatch, or simpler: export `open`/`close` by accepting `onOpen`/`onClose`-free props and instead hang the handlers on the `.chcell` `<Link>` in leaderboard-table.tsx:290 and on the `<Link>` in growth-card.tsx:48 — `onPointerEnter`/`onPointerLeave`/`onFocus`/`onBlur`. The anchor is already focusable and already the hover target, so hovering the name (not just the 28px face) opens the peek, keyboard parity survives, and avatar-peek.test.tsx:29-43 keeps passing once its fireEvent target moves to the anchor. The anchor `getBoundingClientRect()` is a fine placement box; if the panel must point at the face rather than the whole cell, keep the inner span as the measured `anchor` ref and pass the open/close callbacks up.

3. Leave `.avpop` `aria-hidden="true"`. It is a portalled hover affordance with no dismiss and no anchoring in the a11y tree; unhiding it creates a worse bug than it fixes. Give AT the same four facts by the honest route instead: render them once per row in a `.sr-only` span inside the link (subscribers, total views, videos, and the coverage pair), or add `aria-describedby` from the link to that span. Coverage stays a state, not a zero — `peekStats` already emits `null`, which renders `--` (avatar-peek.tsx:129), so keep that path rather than substituting 0.

4. Touch then behaves correctly by construction: the tap navigates to the channel page, and the sr-only text means the numbers were never touch-or-AT-exclusive to a hover panel in the first place.

## P1 · Sorting, re-ranking, and filtering all keep you on the current page, so the top of the new order is invisible
`web/components/paged-table.tsx:70-72 (with web/components/pager.tsx:24-26)` · lens: controls

**Problem** You are on page 8 of 8 (channels 71-74). You click the "subs" header to see the biggest channels. The sort applies to all 74 rows correctly, but the pager stays on page 8, so you are shown the four *smallest* channels with a descending arrow on the column. Nothing indicates you are at the bottom of what you just asked to see. The same happens for the "rank by" tabs and the window tabs (both re-order the default rank sort), and for filters that do not shrink the list far enough to trigger the clamp: unticking "company" (3 of 74) on page 3 leaves pageCount at 8, so page 3 silently becomes a different set of channels. usePager's only page effect clamps down when page > pageCount; a sort cannot change row count, so it never fires.

**Fix** PagedTable owns both hooks, so fix it there rather than in either hook. Add `useEffect(() => setPage(1), [sortKey, sortDir])` by exposing setPage from usePager, and reset on filter change too by having PagedTable watch a caller-supplied identity — the leaderboard can pass `filterKey={`${niche}|${[...cats].sort().join(",")}|${mode}|${win}`}`. Ten lines, no new dependency, and it keeps the "caller cannot get the composition backwards" property the component was built for.

**Revised fix** Two halves, because they have different mechanisms.

Half 1 — sort (the headline case), no new prop, no effect. `usePager` already returns setPage as `props.onPage`, so nothing needs exposing. In paged-table.tsx, wrap `toggle` rather than reacting to it:

  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, value, initialKey, initialDir)
  const { slice, props: pager } = usePager(sorted, perPage)
  const onSort = useCallback((k: K) => { toggle(k); pager.onPage(1) }, [toggle, pager.onPage])

and pass `onSort={onSort}` to SortableHeader instead of `toggle`. Prefer this over the proposed `useEffect(() => setPage(1), [sortKey, sortDir])`: an effect renders the wrong page once and corrects it on the next commit, and it also fires on mount. Resetting inside the handler is one line and has neither problem.

Half 2 — filters, rank-by and window. These live in the caller, so PagedTable does need a signal. The proposed `filterKey` prop is right, with one wording change: name it for what it means, e.g. `resetKey`, and document it as "changing this string means the row set or its ordering basis changed; go back to page 1." The leaderboard passes:

  resetKey={`${niche}|${[...cats].sort().join(",")}|${mode}|${win}`}

and PagedTable does `useEffect(() => pager.onPage(1), [resetKey])`. Here an effect is the correct tool — the change originates outside the component. Keep the sort state across a resetKey change: unticking a category must not throw away the column the user chose, so do not reach for `key={resetKey}` to force a remount.

One tempting shortcut to reject: `useEffect(() => pager.onPage(1), [sorted])` would cover all five triggers in a single line with no new prop, and it happens to work today because every current caller memoizes its rows array (leaderboard-table.tsx:107, channel-directory.tsx:73, opportunity-table.tsx:80, comment-table.tsx:99, recent-feed.tsx:131) and its `value` callback. But it makes correct paging depend on a caller invariant nothing enforces: the first caller that passes an inline `rows={x.filter(...)}` gets a table permanently stuck on page 1, and the failure is silent. The explicit resetKey keeps the "a caller cannot get the composition backwards" property the component's own doc comment is built around.

Worth adding one test to paged-table.test.tsx alongside the existing "orders the list, then slices it" cases: page to the last page, click a header, assert page one's row is visible. That is the invariant, and it is currently untested — which is why this shipped.

## P1 · The niche filter is a dead control — every one of the 74 channels has niche: null
`web/components/leaderboard-table.tsx:101-105, 165-175` · lens: controls

**Problem** `niches` is derived from the channel rows, and all 74 have `niche: null`, so the memo returns an empty array and the select renders with a single option: "all niches". Confirmed in the served HTML: `<select aria-label="filter by niche" title="no niche data in this build yet"><option value="all" selected>all niches</option></select>`. It sits mid-row between the window tabs and the "show" checkboxes, fully enabled, visually identical to a working filter, with no visible label. A user opens it, sees one item, and cannot tell whether the roster genuinely has one niche or the control is broken. The only explanation is a `title` tooltip — unreachable on touch and on keyboard.

**Fix** A dimension with no data is a missing state, not an empty filter: render nothing when `niches.length === 0`. `{niches.length > 0 && <select ...>}`. If the control must stay visible as a promise of a future build, give it a visible label and disable it (`<label>niche <select disabled>not yet tagged</select></label>`) so the absence is stated on the page rather than hidden in a tooltip.

**Revised fix** Keep the control visible and state the absence on the page, following the existing house idiom at components/comment-table.tsx:136-141 rather than inventing a new one. Do NOT use `{niches.length > 0 && <select/>}` — hiding the dimension makes the missing state invisible, which is the failure the project's "missing data is a STATE" rule targets.

In leaderboard-table.tsx, give the select the visible label docs/wireframes.md:127 already specs, and disable it when the dimension is unpopulated:

  const noNiches = niches.length === 0
  ...
  <label>
    niche{" "}
    <select value={niche} onChange={(e) => setNiche(e.target.value)}
            aria-label="filter by niche" disabled={noNiches}>
      <option value="all">{noNiches ? "not tagged yet" : "all niches"}</option>
      {niches.map((n) => <option key={n}>{n}</option>)}
    </select>
  </label>

The visible "niche" text also fixes the missing sighted-user label and matches the "show" note on line 180. `disabled` makes the dead state perceivable without hover, on touch and keyboard alike.

If a one-line explanation is wanted, mirror comment-table exactly — a `.note` paragraph under the controls row naming the pending work, e.g. "niche is not tagged on the roster yet (config/channels.json, task T1); the peer filter turns on when it is." That is a factual statement of a known-pending column per docs/spec.md:867 and system.md T1, so it introduces no unsupported claim.

Since the tooltip stops being the only channel, the `title` on line 169 becomes redundant and should be dropped. Line 111's niche branch in `filtered` can stay — it becomes live the moment the column is populated.

## P1 · Every column re-lays-out on page turn, window switch and per-page change
`web/components/leaderboard-table.tsx:210` · lens: scan

**Problem** Measured live at 90d/10-per-page: turning from page 1 to page 8 moves `growth` from 125px to 251px and `Δsubs` from 155px to 251px, shrinks `subs` 125→94px and `channel` 377→330px. Page 1→2 shifts all seven numeric columns 4–9px. Switching 90d→365d shifts them again (Δsubs 246→258). The table is auto-layout (`table.tbl`, width:100%) with only `style={{minWidth:"62rem"}}` and no colgroup, so the widest string *on the current page* sets every column. Scanning down a ranked list means every page turn re-aims the eye and moves the number out from under the cursor.

**Fix** The project already solved this for the comment tables: add `tbl-fixed` to the className (globals.css:604 `table-layout: fixed`) and pass PagedTable's existing `colgroup` prop with explicit widths. PagedTable already accepts it (paged-table.tsx:60-63) and the leaderboard is the only long table not using it.

**Revised fix** Two changes, the second is the actual stabiliser and the first is a prerequisite that also halves how wide the columns need to be.

1. Finish the `stateText` refactor the file already started. In `components/leaderboard-table.tsx`, give the `Δsubs` cell (line 308-310) and the `growth` cell (line 313) the same state branch the `Δviews` and `subs/1k` cells already use (lines 316-322, 324-331): render `<Derived formula=...>` only when `cell.state === "ok"`, otherwise `<span className="muted" title={stateTitle(cell)}>{stateText(cell)}</span>`. That turns `building, 125 of 180 days` (195px) into `125/180` (~30px) with the full sentence still on hover, and it is also tier-correct — right now a `building` state is wrapped in a Derived formula badge, which is a state dressed as a computed number.

2. Then pin the layout the way `comment-table.tsx` already does. Add `tbl-fixed` to line 210 (`className="tbl tbl-fixed tbl-sticky tbl-hover tbl-zebra"`) and pass `PagedTable`'s existing `colgroup` prop (`paged-table.tsx:37,62,80`), following the precedent at `comment-table.tsx:151-165`: rem widths declared in a `const COL = {...}` object, a `<col />` with no width for the one column that should absorb the remainder, and `style={{ minWidth: rem(sum) }}` computed from the same constants rather than the hard-coded `"62rem"` at line 211.

Sizing rules the colgroup must respect, or the fix trades a moving column for a clipped one:
- Nine `<col>`s, not eight — `leadingHeader` (line 212) adds the `pickcol` th. Give it `width: 30px` to match `globals.css:101`.
- Leave `channel` as the unconstrained `<col />`. It is the only column with an ellipsis already (`.chname { max-width: 13rem; text-overflow: ellipsis }`, globals.css:396-399), so it is the only one that degrades gracefully when it absorbs the slack.
- Size the seven numeric columns for the widest **state** string, not the widest number. After change 1 those are `15 bad days` (blocked, ~86px) and `125/180`, not `-1,240,000` (~70px). Under `table-layout: fixed` with `.tbl-fixed td.num { white-space: nowrap }`, a column narrower than its content overflows on top of its neighbour rather than truncating — and per the project invariant these cells must keep rendering `< N`, `building`, `N bad days` and `--` rather than a zero, so the state strings are the real constraint.
- Clear the widest **header** too: `.tbl th { white-space: nowrap }` (globals.css:98) and the labels grow with the window key (`Δsubs 365d`, `Δviews 365d`, lines 90, 96), so widths must be measured against the 365d labels plus the sort caret, not the 7d ones.

Verify by re-measuring `thead th` widths across pages 1, 2 and 8 at every window — they should now be byte-identical, and only the `channel` column should differ at all.

Worth flagging separately (out of scope for this finding): `channel-directory.tsx:113` renders the same 74 channels with no colgroup and has the identical defect, so whatever `COL` constants land here should be reusable there.

## P1 · Δsubs and growth print "building, 127 of 365 days"; Δviews and subs/1k print "127/365"
`web/components/leaderboard-table.tsx:308` · lens: scan

**Problem** Line 308 renders `deltaText(delta)` and line 313 renders `pctText(growth)` directly, while lines 321 and 330 route through the local `stateText()`. So the four windowed columns use two different state renderings. Measured at 365d over all 74 rows: Δsubs and growth take 258px each — 37% of a 1392px table — to hold a 25-character string that 11 of 74 rows use, while Δviews holds the same fact as "127/365" in 127px. The `stateText` docstring at lines 229-232 says this exact string "was the widest string in the table and every one of the 72 rows paid for it" — the fix reached two of the four columns. The growth cell is also missing `nowrap` (line 312 is `"r num"`, not `"r num nowrap"`), so at any viewport narrow enough it wraps, which is the failure globals.css:610-613 exists to prevent. Δsubs also loses the `stateExplain` tooltip the other two columns give, and wraps a non-ok state in `<Derived>` with a formula that did not run.

**Fix** Route Δsubs through `stateText` and add a `statePct` sibling for growth; put `stateExplain` on the title for both; only wrap `state === "ok"` in `<Derived>`; add `nowrap` to the growth td.

**Revised fix** Gate on the states where no computation ran (`building`/`blocked`), not on `state !== "ok"`, so `bounded` keeps its Derived bucket formula.

1. In leaderboard-table.tsx, replace the local `stateText` with a shared shortener plus a percent sibling, and delete the orphaned duplicate docstring at L225-228:

```ts
const short = (cell: StateCell, full: (c: StateCell) => string) =>
  cell.state === "building" && cell.have !== undefined && cell.need !== undefined
    ? `${cell.have}/${cell.need}`
    : full(cell)
const stateText = (c: StateCell) => short(c, deltaText)
const statePct  = (c: StateCell) => short(c, pctText)   // must NOT fall through to deltaText:
                                                        // a bounded growth cell is "< 4.7%", not "< 47"
const unrun = (c: StateCell) => c.state === "building" || c.state === "blocked"
```

2. Δsubs (L303-310) — keep `nowrap`, keep `<Derived>` for ok and bounded so the ±bucket disclosure survives:

```tsx
<td className="r num nowrap">
  {unrun(delta) ? (
    <span className="muted" title={stateTitle(delta)}>{stateText(delta)}</span>
  ) : (
    <Derived formula={`subscriber_count newest minus oldest, ${win}; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}`}>
      {deltaText(delta)}
    </Derived>
  )}
</td>
```

3. growth (L312-314) — same shape, and add the missing `nowrap`:

```tsx
<td className="r num nowrap">
  {unrun(growth) ? (
    <span className="muted" title={stateTitle(growth)}>{statePct(growth)}</span>
  ) : (
    <Derived formula="subscriber delta ÷ subscribers at window start">{pctText(growth)}</Derived>
  )}
</td>
```

4. Change Δviews (L316) and per1k (L325) from `state === "ok"` to `!unrun(cell)` as well. All four columns then render identically, and per1k's bounded "< 1" regains the `<Derived>` formula and the tooltip it silently lost.

5. `short`/`statePct` belong in lib/trust.ts beside `deltaText`/`pctText`/`ratioText` — trust.ts's own comment (L196-199) records that four hand-copied copies of this rule is the failure the file exists to prevent, and trust.test.ts already covers the neighbours.

## P1 · The # column silently stops being the row order when you sort any other column
`web/components/leaderboard-table.tsx:288` · lens: scan

**Problem** Verified live: after clicking the `subs` header, the # column reads 73, 21, 72, 42, 8, 74, 15, 13, 19, 68 down the page while the `#` header still shows the neutral `↕` and every cell renders with the same weight and colour as when it was the order. The only thing that says "# is not the row order now" is the header's `title` tip (line 83), which is hover-only and on a column nobody hovers. A leaderboard's leftmost number reading 73, 21, 72 is read as broken data before it is read as a preserved ranking.

**Fix** When `sortKey !== "rank"`, add `muted` to the rank td and change the header label from `#` to `# by growth` (the active mode). Cheap, no new state — `sortKey` is already returned by `useTableSort` and just needs threading from PagedTable into the row renderer, or the same signal derived in the leaderboard.

**Revised fix** Keep the fix's diagnosis and its threading idea; change the two visual choices.

1. Thread the signal, backwards-compatibly. In `paged-table.tsx`, widen the render prop to `row: (row: T, sortKey: K) => ReactNode` and call it as `row(r, sortKey)` (line 90). Every existing caller ignores the second argument, so comment-table, video-table, opportunity-table and the rest are untouched. No new state, no new dependency.

2. Do not use `.muted` on the rank cell. Add one dedicated rule, e.g. `.ranktag { font-weight: 400; opacity: 0.7; }`, so the cell reads "de-emphasised" without reading "missing". Keep the number at full `--foreground` colour: it is an exact value and must not borrow the missing-data colour. Apply it only when `sortKey !== "rank"`, with a `title` on the td such as `growth rank over 30d — the list is sorted by subs`, so hover still gives the full sentence.

3. Keep the header label a literal `#` at all times — it always means the same thing and the column must not reflow. Instead, state the divergence in words where it cannot be missed and costs nothing: `PagedTable` already accepts a `footnote` prop (paged-table.tsx:40,67,96, used by comment-table.tsx:166). Widen it the same way (`footnote?: ReactNode | ((sortKey: K) => ReactNode)`) and have the leaderboard render, only when `sortKey !== "rank"`, a single `.note` line: `sorted by subs — # still counts down growth over 30d, unchanged.` That is one existing class, one existing prop, always visible, and it names both the sort and the ranking mode in plain language.

4. Accessibility, free: give the rank `<td>` no aria change, but since the `#` header already carries `aria-sort="none"` while another column carries `descending` (sortable-table.tsx:74-80), a screen reader already gets the sort state correctly — the gap is purely visual, so no ARIA work is needed.

If only one of these ships, ship 3. The sentence under the table fixes the comprehension problem outright and requires no CSS at all; the cell de-emphasis in 1-2 is the polish on top.

## P1 · The YOU row loses its highlight on every even row
`web/app/globals.css:534` · lens: scan

**Problem** `.tbl tr.youcard td` (specificity 0-2-1) is overridden by `.tbl-zebra tbody tr:nth-child(even) td` at globals.css:576 (0-2-3). Measured in the default 90d/growth ordering with all 74 rows shown: Eric Tech sits at index 30 (even) and his row's computed background is `color(srgb 0.945098 0.937255 0.937255 / 0.4)` — byte-identical to a plain even row. He is #18 by growth/7d, #44 by general/7d, #39 by subscribers, so which mode you pick decides at random whether your own row is marked. Only the inline "★ YOU" chip survives, 1200px away from the numbers.

**Fix** Give the rule the specificity to win: `.tbl-zebra tbody tr.youcard td, .tbl tr.youcard td { ... }`, and consider a left border on `.youcard td:first-child` so the mark survives any future row tint.

**Revised fix** Move the youcard row rule out of globals.css:549 and place it AFTER the zebra rule (below line 593), and give it a mark that does not depend on winning a background war:

  /* Listed after the zebra rule, same as the hover rule below, so it wins on
     even rows too. The left rule is what actually finds the row; the tint alone
     is under the zebra banding's own contrast. */
  .tbl-zebra tbody tr.youcard td,
  .tbl tr.youcard td { background: color-mix(in srgb, var(--primary) 6%, transparent); }
  .tbl tr.youcard td:first-child { box-shadow: inset 2px 0 0 var(--primary); }

Three things matter here. First, the placement: `.tbl-zebra tbody tr.youcard td` is (0,2,3), the same specificity as the zebra rule, so it only wins by being later in the file — leaving it at line 549 changes nothing. This mirrors the pattern the file already uses and documents for `.tbl-hover` at globals.css:595-598 ("Listed after the zebra rule so it wins on even rows too"), so it is the house style rather than a new trick.

Second, the `inset` box-shadow on `td:first-child` rather than a `border-left`: the leading cell is the `.pickcol` checkbox `<td>` (leaderboard-table.tsx:252), the table is border-collapse with a `border-bottom` per td (globals.css:100), and an inset shadow adds no box width, so no row shifts by 2px and no column realigns. It is the same technique globals.css:582-586 already uses to give the stuck `thead` its rule.

Third, keep the tint but stop relying on it: at 3% primary the row reads as white next to a 40% `--accent` band. 6% is still quieter than the hover tint (`--accent` 55%, globals.css:598), which the file's own comment says must stay the strongest signal, so the hover ordering is preserved.

Worth noting separately, not part of this fix: at 10 rows per page the self row is on page 2-4 in every mode, so the user has to page to find themselves at all. A "jump to me" affordance is a different finding, and a bigger one than the tint.

## P1 · Every column header tip is shadowed by the sort button's own title, so the rounding-bucket disclosure is unreachable
`web/components/sortable-table.tsx:88` · lens: trust

**Problem** `<th title={col.tip}>` wraps `<button className="thsort" title={`Sort by ${col.label}`}>`, and `.thsort { width: 100% }` (globals.css:648) makes the button fill the th's entire content box. A nested title wins, so hovering the header text shows "Sort by Δsubs 90d" — never the tip. Verified in the served HTML: `<th title="subscriber_count newest minus oldest in window. YouTube rounds subscriber counts, so every figure carries a rounding width — hover a number to see its own."><button ... title="Sort by Δsubs 365d">`. This silently kills the bucket disclosure, the growth denominator ("subscriber delta ÷ subscribers at window start"), the per1k unit definition, the "exact, never rounded" note on Δviews, the "this column is always 30d" note on vids, and the rank-mode explanation on #. Six of eight columns lose their entire explanation, reachable only in the th's ~10px padding ring.

**Fix** Drop the button's `title` entirely and put `col.tip` on the button instead of the th (the label already says "sort" via the ▾/↕ arrow and `aria-sort`). If the sort affordance must be announced, use `aria-label` on the button rather than a second `title`.

**Revised fix** One-line change in /Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker/web/components/sortable-table.tsx: coalesce on the button and drop the shadowed attribute from the th.

- Line 92: delete `title={col.tip}` from the `<th>`.
- Line 99: `title={col.tip ?? `Sort by ${col.label}`}`.

The coalesce matters because SortableHeader is shared (components/paged-table.tsx:81 is the only call site, but it backs several tables): columns that declare a tip surface it over the full label, columns that declare none keep the "Sort by X" affordance hint instead of going bare. The sort affordance is not lost on the tipped columns either — the ▾/▴/↕ arrow (line 86), `cursor: pointer`, the `.thsort:hover` color change (globals.css:684), and `aria-sort` on the th (line 90) already carry it four ways over.

Do not add `aria-label="Sort by X"` as the finding suggests as a fallback. `aria-label` would replace the button's accessible name, and the name screen-reader users need is the column label ("Δsubs 90d"), which the visible text already provides; a `title` on a button with visible text becomes the accessible *description*, which is the right slot for the tip. Adding aria-label trades a working name for a redundant one.

Two things worth doing alongside, in the same pass:

1. Move the orphaned `vids 30d` warning out of a hover entirely. It is the only tip whose loss changes what a number means, and `title` is invisible to touch and keyboard. The label itself already says "30d" — make it read as deliberate against a 365d window rather than as a copy error, e.g. render the window mismatch inline (`vids 30d ·` with the fixed-window note in the header's second line, or a `<Derived formula="videos published in the last 30 days; fixed window">` on the cell at leaderboard-table.tsx:333 so it matches how every other numeric column on this row discloses itself). Cell-level Derived is the cheaper of the two and is the pattern the file already uses five times.

2. Leave the Δsubs cell disclosure at leaderboard-table.tsx:308 exactly as is. It is the one place the per-channel bucket width lives, and the header fix restores the sentence that sends people to it.

## P1 · 99% of the history every windowed number is computed from is vidIQ backfill, and nothing on the leaderboard says so
`web/components/leaderboard-table.tsx:308` · lens: trust

**Problem** `_db/snapshots.json` holds 24,922 points tagged `source: "vidiq_backfill"` against 218 `youtube_api`, and `dates_present` is just 3 days (2026-07-28..30). Every window of 7d or longer anchors its "oldest" endpoint on a vendor point — Rick Hau's 90d cell resolves `from: 2026-05-02`, which is a `vidiq_backfill` row. The Derived formula names the field ("subscriber_count newest minus oldest, 90d") but never the source, so a vendor reconstruction and our own measurement render identically. `vendor` is an explicit fourth trust tier in this project (docs/system.md §584, decision 0012) and the schema keeps `source` specifically "so a backfilled video stays distinguishable from one we snapshotted ourselves" (docs/system.md:250). The blocked tooltip compounds it: "Every day this 365-day window needs was snapshotted" is only true of the merged vendor series, while snapshot_health reports 4 of 90 days recorded. The nav's "369 days of history" reads as ours.

**Fix** Carry the endpoint `source` into the StateCell (or read it server-side per window) and append it to the Derived formula — e.g. "…, 90d; the 2026-05-02 baseline is vidIQ backfill, not our own sweep". At minimum, change the nav readout to "369 days of history (vidIQ backfill + 4 own sweeps)" and reword `stateExplain`'s blocked sentence to say "every day this window needs is in the series" rather than "was snapshotted".

**Revised fix** Two changes, one of which is a plain correctness fix and should land first.

1. Correct the false sentence. lib/trust.ts:210-214 must stop asserting that every required day was snapshotted, because pipeline/growth.py:192-194 returns `blocked` on any present-but-unusable day regardless of how many required days are missing entirely (JimiBarkway 365d: unusable 1, 144 days absent). Reword to claim only what the cell proves, e.g. "N of the days this 365-day window needs are in the series but failed the view-count check. That day has already happened, so waiting will not fix it; a window that avoids it will measure." Either drop the "every day" clause or have pipeline/growth.py also emit the missing-day count so the sentence can state both honestly.

2. Carry provenance into the Derived formula. pipeline/growth.py `delta()` already returns `from`/`to` at line 196-197 — add `from_source` (and `to_source`) from `usable[oldest]["source"]`, thread it through the StateCell type in web/lib/types.ts, and append it in leaderboard-table.tsx:308 and :317, e.g. "subscriber_count newest minus oldest, 90d; the 2026-05-03 baseline is vidIQ backfill, not our own sweep; YouTube rounds this channel to ±1,000". Keep the cell in the Derived tier — the arithmetic is still ours and the inputs are still YouTube's public counts; do not promote the column to `vendor`, which decision 0012 reserves for opaque vendor-computed scores. Scope it to the two windowed delta columns; the "subs" column reads the newest snapshot, which is genuinely ours.

Skip or downgrade the nav change: app/layout.tsx:39-49 already contrasts "369 days of history" with a hover reading "daily sweep: 4 of the last 90 days recorded. History since 2025-07-28", and the inline comment shows that was a deliberate prior fix. If anything, add the vendor's name to the existing hover ("history before 2026-07-28 is vidIQ backfill") rather than rewriting the headline.

## P1 · A bounded subs/1k value renders in the same muted grey as "--", so a real measurement bound reads as missing data
`web/components/leaderboard-table.tsx:324` · lens: trust

**Problem** The per1k cell only wraps `state === "ok"` in `<Derived>`; every other state — including `bounded`, which is a real measurement — falls to `<span className="muted" title={stateTitle(per1k)}>`. `.muted` is `var(--muted-foreground)` (#6b6a6b), the exact colour the "--" unmeasured cells use, while an ok value sits at #282728 with a dotted underline. `stateExplain` returns `undefined` for bounded, so there is no tooltip either. At 7d that is 52 of 74 rows showing e.g. "< 48" in missing-data grey with no explanation, directly beside "33.9" in measured black. The identical tier in the Δsubs column renders at full weight with a dotted underline, so the same claim gets two opposite treatments in adjacent columns. Δviews at line 315 has the same shape.

**Fix** Treat `bounded` as Derived in both cells: `{(per1k.state === "ok" || per1k.state === "bounded") ? <Derived formula={…}>{ratioText(per1k)}</Derived> : <span className="muted" …>}`. Add a `bounded` branch to `stateExplain` in lib/trust.ts naming the rounding floor ("the delta is under 5× this channel's ±100 rounding width, so only an upper bound is measurable"). Reserve `.muted` for building/blocked/unmeasured only.

**Revised fix** In `components/leaderboard-table.tsx`, treat `bounded` as measurable in the per1k cell, and use the shared formatter instead of the inline copy:

```tsx
{per1k.state === "ok" || per1k.state === "bounded" ? (
  <Derived formula={
    per1k.state === "bounded"
      ? `subscriber delta ÷ (view delta ÷ 1000); the subscriber delta is under 5× this channel's ${bucketText(c.subscriber_bucket)} rounding width, so only an upper bound is measurable`
      : "subscriber delta ÷ (view delta ÷ 1000)"
  }>
    {ratioText(per1k)}
  </Derived>
) : (
  <span className="muted" title={stateTitle(per1k)}>{stateText(per1k)}</span>
)}
```

Three deltas from the proposed fix:

1. Use `ratioText` from `lib/trust.ts` (already exported, line 199), not the inline `(per1k.value ?? 0).toFixed(1)`. It returns `"48.7"` for ok and `"< 48"` for bounded, and the doc comment above it at trust.ts:192-198 names leaderboard-table as one of the four inline copies it exists to delete. Import it and drop the inline expression.

2. Do NOT add the bucket sentence to `stateExplain`. A per1k `StateCell` carries no `bucket` — `lib/types.ts:29` scopes that field to subscriber cells, and the live bounded per1k cells are `{state, upper, value}` only, so `stateExplain` cannot name a rounding width it never receives. The bucket is available at the call site as `c.subscriber_bucket` (the Δsubs cell at line 308 already renders it through `bucketText`), so put the explanation in the Derived formula as above. `Derived`'s contract (`components/trust.tsx:5-6`) is that a formula is mandatory — and the bounded branch needs its own, or the tooltip on "< 48" would claim an exact division that did not happen.

3. Leave the Δviews cell (line 315-322) as-is, or change it purely for symmetry while knowing it is dead code: `view_delta` has no bounded cells in any window and is exact by construction. Do not let it inflate the fix's claimed impact.

Keep `building` and `blocked` muted — they are not measurements, and `stateExplain` already gives them a real tooltip. The only tier moving out of `.muted` is `bounded`.

Optional follow-up outside the audited page: `components/growth-card.tsx:117` has the identical `state === "ok"` shortcut on its subs/1k statline, so a leaderboard-only fix leaves the channel card disagreeing with the table it links from.

## P1 · Δsubs and growth render building/blocked states through deltaText/pctText inside <Derived>, printing a 23-character sentence into a numeric column with the wrong tooltip
`web/components/leaderboard-table.tsx:308` · lens: trust

**Problem** `stateText` (line 233) exists in this very file to shorten "building, 364 of 365 days" to "364/365" — its own comment says the long form "was the widest string in the table and every one of the 72 rows paid for it". It is wired only to the Δviews and subs/1k cells. Δsubs and growth call `deltaText(delta)` / `pctText(growth)` directly, so at 365d eleven rows (ranks 64–74, pages 7–8) print the full "building, 359 of 365 days". Two consequences: (a) the Δsubs td has `nowrap`, so that sentence sets the column width for the whole table; the growth td at line 312 is `<td className="r num">` with no `nowrap`, so it wraps to two or three lines and triples the row height. (b) Both are wrapped in `<Derived formula=…>`, so a state that is explicitly not a number gets the Derived dotted underline and a tooltip reading "subscriber_count newest minus oldest, 365d; YouTube rounds this channel to ±100" — a formula for a value that does not exist — instead of `stateExplain`'s "Collecting: 359 of the 365 days this window needs…". The same state in the adjacent Δviews column gets muted styling and the correct sentence.

**Fix** Mirror the Δviews/per1k shape in both cells: render `<Derived>` only when `state` is `ok` or `bounded`, and otherwise `<span className="muted" title={stateTitle(cell)}>{stateText(cell)}</span>`. Add `nowrap` to the growth td so the shortened state cannot wrap.

**Revised fix** In leaderboard-table.tsx, branch both cells the way Δviews and subs/1k already do, but admit `bounded` into the Derived tier (a bound is still a computed value, and the "< N" invariant must survive):

Δsubs (line 303):
  <td className="r num nowrap">
    {delta.state === "ok" || delta.state === "bounded" ? (
      <Derived formula={`subscriber_count newest minus oldest, ${win}; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}`}>
        {deltaText(delta)}
      </Derived>
    ) : (
      <span className="muted" title={stateTitle(delta)}>{stateText(delta)}</span>
    )}
  </td>

growth (line 312) — same shape, and add `nowrap` to the td so the shortened state cannot wrap:
  <td className="r num nowrap">
    {growth.state === "ok" || growth.state === "bounded" ? (
      <Derived formula="subscriber delta ÷ subscribers at window start">{pctText(growth)}</Derived>
    ) : (
      <span className="muted" title={stateTitle(growth)}>{stateText(growth)}</span>
    )}
  </td>

Two notes on top of the original fix. First, this is deliberately not a literal mirror of the Δviews/subs/1k branches, which test `state === "ok"` only and so drop bounded cells into the muted span with no tooltip (stateExplain returns undefined for bounded) — that is a separate, smaller under-disclosure in those two cells, worth a follow-up rather than copying. Second, the `ok || bounded` condition is what makes the fallback safe: `stateText` falls through to `deltaText`, not `pctText`, and those two formatters only differ for `ok` and `bounded`, so excluding both states means the growth fallback still reads correctly. Add a one-line comment saying so, or give `stateText` an explicit formatter parameter, so a later edit that widens the condition does not silently print a delta string in the percent column.

`stateText`'s parameter type `SlimChannel["subscriber_delta"][WindowKey]` already accepts a growth cell — both fields are `Record<WindowKey, StateCell>` in lib/types.ts — so no signature change is required, though renaming the parameter type to `StateCell` would say what it means.

Drop the "sets the column width for the whole table" and "triples the row height" wording from the writeup; the accurate statement is that the Δsubs column doubles on the pages that contain a building row (215px vs 120px measured) and the growth cell wraps to two lines there, adding ~5px of row height.

## P2 · The 'absent' chip — the board's single most important state — is 2.03:1 contrast
`web/app/globals.css:90 (used at web/components/leaderboard-table.tsx:271)` · lens: a11y

**Problem** `.chip.warn { color: var(--warning) }` with `--warning: #f5a623` on `--card: #ffffff` measures 2.03:1. AA requires 4.5:1 for 10px text. This is the chip that marks a channel as having no data at all, which under this project's rules is the one label that must never be missed, and it is the least legible text on the page. The chip's border is also `color-mix(--warning 50%)`, fainter still.

**Fix** Darken the token used for text. Keep `--warning: #f5a623` for fills/dots and add `--warning-ink: #8a5a00` (≈5.6:1 on white) for `.chip.warn`'s `color` and `border-color`. One token, no markup change.

**Revised fix** Add `--warning-ink: #8a5a00` beside `--warning` in :root (globals.css:23) and change ONLY the `color` on line 90:

  .chip.warn { border-color: color-mix(in srgb, var(--warning) 50%, transparent); color: var(--warning-ink); }

Two corrections to the proposed fix:

1. #8a5a00 measures 5.93:1 on #ffffff, not ~5.6 — still the right value, and better than the tempting alternative. globals.css:77 already hand-rolls a darkened amber ink (`.cat-sug { color: #9a6a00 }`), but that value is only 4.73:1 on white and 4.13:1 on --accent #f1efef, the `.tbl tr.rowlink:hover` background from line 103. #8a5a00 holds 5.18:1 there. So define the token as #8a5a00 and repoint line 77 at it as well, collapsing two hand-rolled ambers into one token rather than adding a third.

2. Do NOT apply the ink to `border-color` as the finding proposes. It turns the amber ring brown and buys nothing measurable: a 45% ink mix over white is still only 2.0:1, and clearing the 3:1 non-text threshold needs roughly a 70% mix, which no longer reads as amber. The ring is decorative here — the word "absent" plus the six "--" cells (leaderboard-table.tsx:265, 273-277) carry the state — so leave the border on --warning and make this a one-line change.

Adjacent, for the same pass: `.chip.rank1` (globals.css:92, --v-make #16a34a) is 3.30:1 and also fails AA at 10px, but grep finds no `variant="rank1"` in components/ — it is a dead rule, so delete it rather than recolor it.

## P2 · The table has no accessible name and no caption
`web/components/paged-table.tsx:79` · lens: a11y

**Problem** `<table className="tbl tbl-sticky tbl-hover tbl-zebra">` — grep for `<caption` in the served HTML returns 0, and there is no `aria-label`/`aria-labelledby`. In screen reader table mode the leaderboard announces as an unnamed 9-column table. Worse, the `#` column's whole meaning ('Position by growth over 90d — change it with rank by above') lives only in a `title` on a `<th>`, which is neither focusable nor read by NVDA/JAWS on a header cell, so the primary column is a bare `#` with no explanation available by any non-pointer route.

**Fix** Add an optional `caption` prop to PagedTable rendering `<caption className="sr-only">`, and pass the live sentence from the leaderboard: `74 channels ranked by ${mode} over ${win}`. `.sr-only` already exists at globals.css:66. This doubles as the fix for the `#` column's missing explanation.

**Revised fix** Two separate one-liners, not one.

1) Accessible name. Add an optional `caption?: ReactNode` prop to PagedTable and render it as the FIRST child of the table, before `{colgroup}` (paged-table.tsx:79-80):

  <table className={className} style={style}>
    {caption && <caption className="sr-only">{caption}</caption>}
    {colgroup}

Pass a stable name from the leaderboard, without the row count: `caption={`AI channels ranked by ${mode} over ${win}`}`. Leave the count to the pager, which already renders "1–10 of 74 channels" as visible text at pager.tsx:87-89 — duplicating it in an sr-only caption that re-announces on every filter tick is noise.

2) The # column's explanation. Do this in SortableHeader, not via the caption, and do NOT put an sr-only span inside the `<th>`: screen readers re-announce the column header on every cell move, so an 8-column x 74-row table would read the full sentence hundreds of times. Attach it to the focusable element instead — the sort button — as a description:

  const tipId = col.tip ? `th-${col.key}-tip` : undefined
  ...
  <button ... aria-describedby={tipId}>...</button>
  {col.tip && <span id={tipId} className="sr-only">{col.tip}</span>}

Keep `title={col.tip}` on the th for the pointer route. This gives a keyboard/SR user "# button, Position by growth over 90d…" on focus, leaves per-cell header announcements as the short "#", fixes every table that uses `tip` (subs, Δsubs, growth, Δviews, subs/1k views, vids 30d all have one), adds no dependency, and touches no visible pixel. Optionally also drop `title` from the button or fold the label into it so the button's own tooltip stops shadowing the th tip over the full width of the cell.

## P2 · Sorting, paging and filtering silently swap the whole tbody with no announcement
`web/components/paged-table.tsx:88 / web/components/pager.tsx:87` · lens: a11y

**Problem** There is no `aria-live` or `role="status"` anywhere on this page (the only `role="status"` in the app is the nav's sweep dot, layout.tsx:52). Activating a sort button, a page number, the window tabs, the niche select or a category checkbox replaces all 10 rows while focus stays put and nothing is spoken. `aria-sort` is set correctly on the `<th>` (sortable-table.tsx:74-80) but it is only surfaced when the user navigates back into the table, so a screen reader user gets zero confirmation that their click did anything. The pager's coverage sentence '1–10 of 74' — the readout the pager's own comment calls the point of the component — is likewise static text that never re-announces when filters shrink the roster.

**Fix** Add one `<span role="status" className="sr-only">` inside PagedTable whose text is `${from}–${to} of ${total} ${unit}, sorted by ${sortKey} ${dir}`. It updates on every sort, page and filter change and costs one element. No new dependency.

**Revised fix** Add the live region inside PagedTable, but fix two defects in the proposed version first.

(1) Hoist it above the early return. `paged-table.tsx:74` does `if (rows.length === 0) return <div className="empty">{empty}</div>` before the fragment that would hold the region. Filtering down to zero matches — the single most important thing to announce — would unmount the region instead of speaking, and a region absent from the DOM at the moment of change does not announce at all, so the *next* change that brings rows back is lost too. Restructure so one `<span role="status" className="sr-only">` is always mounted, with the empty case rendering the `empty` message as its text.

(2) Announce the column label, not the raw key. `sortKey` is `"dsubs"`/`"per1k"`; use `columns.find((c) => c.key === sortKey)?.label`.

Concretely, in `paged-table.tsx`, keep `useTableSort`/`usePager` above any return and render, as a sibling of `<div className={wrapClassName}>` (outside `.tblwrap`, so the clipped 1px absolute box never feeds the wrapper's scrollHeight that the separate `.avpop` fix is already addressing):

  <span role="status" className="sr-only">
    {rows.length === 0
      ? empty
      : `sorted by ${label} ${sortDir === -1 ? "descending" : "ascending"}, showing ${from}–${to} of ${total} ${unit}`}
  </span>

with `from`/`to` computed from the `pager` props PagedTable already holds (`page`, `perPage`, `total`). Leading with the sort clause keeps the string from reading as a verbatim duplicate of the visible `pgcount` sentence at `pager.tsx:87-89` in browse mode. One element, no dependency, and every existing caller of PagedTable gains it for free.

## P2 · The hover peek fails WCAG 1.4.13: not hoverable, not dismissible
`web/app/globals.css:260 and :263` · lens: a11y

**Problem** `.avpop` sets `pointer-events: none`, so a user who needs to move the pointer onto the panel to read it (magnifier users, anyone with tremor) dismisses it by trying. And when it is opened via `:focus-within`, there is no Escape handler — the only way to close it is to move focus, which 1.4.13 explicitly forbids as the sole dismissal route. The panel is 216px wide and can overlay adjacent rows' content while stuck open.

**Fix** Once the trigger is a real button (see the avatar finding), add an `onKeyDown` that closes on Escape and drop `pointer-events: none` so the panel is hoverable. Both are required by 1.4.13 and neither needs a library.

**Revised fix** Split it. The two halves are not the same size of change.

DISMISSIBLE (the load-bearing half, ~3 lines, do this):
In `web/components/avatar-peek.tsx`, on the `.avpeek` span (lines 103-112), add alongside the existing handlers:

  onKeyDown={(e) => { if (e.key === "Escape" && box) { e.stopPropagation(); close() } }}

Focus stays on the trigger, the panel closes, 1.4.13 Dismissible is satisfied. `stopPropagation` matters because the span sits inside a Next `<Link>` and future ancestor Escape handlers should not also fire. Guarding on `box` means Escape is only swallowed when a panel is actually open. Cover it in `avatar-peek.test.tsx` beside the existing focus/blur case (lines 43-46): fireEvent.focus, assert panel present, fireEvent.keyDown with key "Escape", assert panel gone and document.activeElement unchanged.

HOVERABLE (do not do it the way the finding says):
Removing `pointer-events: none` at `web/app/globals.css:266` alone changes nothing, because `close()` is bound to `onPointerLeave` on the 28px anchor and the panel sits 12px away (`avatar-peek.tsx:72`). A working version needs three coordinated changes: (a) drop `pointer-events: none`; (b) make `close` deferred — a ~120ms `setTimeout` stored in a ref, cancelled by `onPointerEnter` on the portalled panel and re-armed by `onPointerLeave` on it — so the pointer can cross the gap; (c) `onClick={(e) => e.stopPropagation()}` on the panel, because the portal is a React child of the channel `<Link>` and React portals bubble through the React tree, so an enabled panel would otherwise navigate when clicked. Clear the timer on unmount.

If (b) and (c) are more than this decoration is worth — a defensible call, since the panel is `aria-hidden="true"` and duplicates the row — then ship the Escape handler alone and leave `pointer-events: none` in place, documenting it as the deliberate trade. Escape-only still closes the largest gap: the keyboard path where there is currently no exit but Tab.

Separately, while in this file: delete the stale `:focus-within` sentence at `globals.css:246`, which describes an implementation that no longer exists.

## P2 · The 'this column sorts' affordance is 1.9:1 and only firms up on hover, so touch users never learn the columns sort
`web/app/globals.css:665-670` · lens: a11y

**Problem** `.tharrow` is `color: var(--muted-foreground); opacity: 0.45` — computed #bcbcbc on white, 1.9:1, under the 3:1 floor WCAG 1.4.11 sets for a control's state indicator. The only thing that raises it is `.thsort:hover .tharrow { opacity: 0.9 }` (4.34:1), which touch devices never trigger and which the CSS comment itself names as the discoverability mechanism ('the header shows its hit area on hover so "can I click this" answers itself'). On a phone the eight `↕` glyphs are effectively invisible, so the fact that every column is sortable is undiscoverable — and it is precisely on the phone, where 5 of 9 columns are off-screen, that re-sorting matters most. There is no `.thsort:focus-visible .tharrow` rule either.

**Fix** Raise the idle opacity to 0.7 (≈2.9:1) or better, use a dedicated `--muted-ink: #595859` at full opacity for the arrow, and add `.thsort:focus-visible .tharrow { opacity: 1 }` beside the existing hover rule.

**Revised fix** One line in /Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker/web/app/globals.css:683 — raise the idle arrow from `opacity: 0.45` to `opacity: 0.75`.

That blends #6b6a6b over the #ffffff sticky-header background to #908f90 = 3.22:1, clearing WCAG 1.4.11's 3:1 floor with margin (0.72 is the exact break-even at 3.03:1; 0.75 leaves room for the antialiasing on a 10px glyph). It stays deliberately subordinate to both the header label at 5.39:1 and the active `.thsort.on .tharrow` at 5.61:1, so the "which column is sorting" hierarchy that globals.css:686-687 builds survives intact — which the finding's `--muted-ink: #595859` branch (7.08:1) would have destroyed.

Do NOT use the proposed 0.7: it lands at 2.92:1, still under the floor.

Do NOT add `.thsort:focus-visible .tharrow` — globals.css:602 already gives every button, `.thsort` included, a 2px var(--primary) focus ring, and its own comment says it exists to reach sort headers. Adding a second focus treatment on the arrow alone would double up on a case that already works.

Leave `.thsort:hover .tharrow { opacity: 0.9 }` (globals.css:685) as is. It stays a meaningful hover step above 0.75, so the pointer affordance the comment at 663-668 describes is preserved rather than flattened.

Optionally also revise the comment at globals.css:663-668, which currently claims hover is what answers "can I click this". After this change the idle state answers it on its own, and the comment should say so or it will invite someone to lower the opacity again.

## P2 · Unticking all four category boxes leaves one row, and the pager then reads "1-1 of 1 channels"
`web/components/leaderboard-table.tsx:107-115` · lens: controls

**Problem** The filter exempts your own channel: `if (!c.is_self && c.category !== "own" && !cats.has(...)) return false`. The self channel is the single `own` row, so unticking all four "show" boxes yields a one-row table and a pager reading "1-1 of 1 channels" — a coverage statement that reads as though the roster contains one channel, on a board whose stated contract is that a number never hides how much is behind it. Nothing on screen says your own channel ignores these switches. A side effect: because self always survives, `filtered` can never be empty, so the `empty="no channels match these filters"` string passed at line 209 is unreachable in the shipped build.

**Fix** Make the exemption visible instead of silent. Either add a fifth pinned control ("you" checked and disabled, with a title explaining your own channel is always shown), or append a footnote to PagedTable — it already takes a `footnote` prop — reading "your channel is always shown, whatever is ticked" whenever `cats.size < 4`.

**Revised fix** Drop the disabled-checkbox option and un-gate the footnote.

1. Do not add a fifth checked-and-disabled "you" box. Disabled inputs are not keyboard focusable, so the `title` that carries the whole explanation is unreachable to keyboard and screen-reader users, and a permanently-checked disabled box reads as broken rather than as "always on". If a fifth control is wanted, follow the `/channels` precedent instead and render it as a non-interactive pinned marker (plain text "you 1"), not as a fake input.

2. Show the footnote always, not `when cats.size < 4`. The exemption is permanent: with all four ticked the pager already reads "of 74" while the ticked tags cover only 73. A footnote that appears only on partial selections implies the default state is fully accounted for, which is the same miscount in quieter form. Pass a constant footnote to the existing prop:

  footnote={<p className="note">Your channel is always listed. The show tags govern the other 73.</p>}

Derive the 73 from `channels.length - 1` (or from a count of non-`own` rows) rather than hardcoding it, so it tracks the roster.

3. Cheapest high-value addition, optional but consistent with `/channels`: put a count on each of the four labels the way channel-directory.tsx:55-71 does, so the ticked tags visibly sum to 73 and the footnote explains the remaining 1. That converts the footnote from an apology into arithmetic the reader can check.

4. Leave `empty="no channels match these filters"` at line 209 in place. It is currently unreachable only because every row has `niche: null`; it becomes live as soon as config supplies niche values.

## P2 · Only the window survives navigation or a shared link; rank mode, categories, sort, page and picks are lost
`web/components/leaderboard-table.tsx:60-77 (against web/lib/window.ts)` · lens: controls

**Problem** `lib/window.ts` establishes the contract in its own header comment — the window lives in the URL so it follows you across routes, because three pages holding it in local useState silently reset people. Six sibling controls never got the same treatment: mode, niche, cats, sortKey, sortDir, page and perPage are all plain useState. Click a channel name from row 43 of a "rank by views, companies only, sorted by subs/1k" view, then press Back: the leaderboard is a separate route, so LeaderboardTable remounts and you land on page 1 of the default growth ranking with every filter restored to default. Only `?w=` survives. The view you built also cannot be sent to anyone — the URL describes one of seven controls.

**Fix** Generalise the existing helper rather than adding a router library. `withWindow` is already a URLSearchParams round-trip; add `withParams(href, Record<string,string>)` beside it, read the extra keys in page.tsx's searchParams as initial state, and push them through the same `router.replace(..., {scroll:false})` the window already uses. Omit params at their default value so a clean URL stays clean.

**Revised fix** Same direction, but the proposed mechanism has two problems worth fixing before anyone implements it.

1. Do not use `router.replace` for these. app/page.tsx is an async server component that reads searchParams and does a filesystem coverage read per channel (page.tsx:17-22, 74 channels). The window can afford a `router.replace` because changing it changes server-computed props; mode/niche/cats/sort/page do not — they are pure client filters over data already in the browser. Routing them through `router.replace` fires an RSC round-trip on every category tick and every sort-header click. Next 16 / React 19 support the native shallow update for exactly this: `window.history.replaceState(null, "", url)`. Use that here and leave window.ts's existing `router.replace` alone.

2. sortKey/sortDir and page/perPage are not the leaderboard's to lift. They live inside shared hooks (sortable-table.tsx:31-32, pager.tsx:18-19) used by four PagedTable callers — leaderboard-table.tsx:202, channel-directory.tsx:113, opportunity-table.tsx:138, comment-table.tsx:142 — and recent-feed.tsx:92-93 mounts two `usePager` instances on one route. A blanket URL binding inside those hooks collides on `page`/`per`. Either give PagedTable an optional `urlKey` prefix that opts a table in (`lb.sort`, `lb.page`) or expose controlled `sort`/`page` props and let the leaderboard own them. Not a global change.

3. Parse defensively, the way parseWindow already does (window.ts:9-15): an unknown `mode` or a `cats` list naming a tag that no longer exists must fall back to the default, never to an empty table. Omit any param sitting at its default so a plain `/` stays plain, and keep `w` spelled and ordered as it is today so existing links do not churn.

4. Scope it to mode, niche, cats, sort and page. Leave `picked` out — compare-bar.tsx:13-21 already turns a pair of picks into a shareable `/compare?a=&b=&w=` URL, so encoding picks a second time buys little and adds two params to every URL a filtering session produces.

## P2 · Ticking only your own row silently does nothing — no compare bar, no explanation
`web/components/compare-bar.tsx:15-18` · lens: controls

**Problem** The YOU row carries the same compare checkbox as every other row. With one pick, `compareHref` pairs it against `selfId`; if that one pick *is* selfId then `a === b` and it returns null, so CompareBar renders nothing at all. The user ticks the box, the box visibly ticks, and no bar appears, no message appears, and the row does not look any different from the 73 rows where ticking does produce a bar. The correct behaviour (you cannot compare yourself to yourself) is implemented, but it is expressed as absence.

**Fix** CompareBar already handles a half-filled state — it renders `<span className="pending">pick a channel</span>` when the first slot is empty. Reuse it: when `picked` is exactly `[selfId]`, show the bar with your avatar in the second slot and "pick a channel" in the first, and render the compare button disabled. The bar then explains the dead end instead of hiding it.

**Revised fix** Prevent the dead end rather than dressing it, which is both smaller and matches the no-new-machinery bias. In leaderboard-table.tsx's pickCell (lines 251-260), disable the checkbox on the self row and say why, since self is already the implicit second side of every single-pick compare and ticking it can never add information: set `disabled={c.is_self}`, change the label to `aria-label={c.is_self ? "you are always the other side of a compare" : `select ${c.name} to compare`}`, and put the same string as `title` on the wrapping `<td className="pickcol">` (a disabled input does not reliably fire the tooltip itself in Chrome or Safari, the td does). That is a three-line change in one file, needs no change to compare-bar.tsx, keeps compare-bar.test.tsx:19-21 green as the defence-in-depth it already is, and turns an invisible no-op into a visible, explained "not available". If the team prefers the finding's explain-it-in-the-bar approach instead, it costs more: split the `href === null` return at compare-bar.tsx:54 into "picked.length === 0 → return null" and "only self picked → render the bar", compute the slots explicitly rather than reusing the unreachable `first` fallback, and swap the `<Link>` for a `<button type="button" disabled>` so there is no href to supply. Either way, also fix the adjacent label bug the audit surfaces: line 77 only special-cases `second.is_self`, so picking self first and another channel second renders "Eric Tech vs OtherName" instead of "you vs OtherName" — apply the same is_self check to `first` at lines 63-68.

## P2 · Filtering leaves visible holes in # while the pager says a different total
`web/components/leaderboard-table.tsx:288` · lens: scan

**Problem** Verified live: unticking `company` and `adjacent` gives the pager readout "1–66 of 66 channels" while the # column runs 1…74 with 8 gaps (10→12, 12→14, 17→19, 24→26, 41→43, 43→45, 55→57, 59→61) and the last row reads #74. The rank is honestly roster-wide, but nothing on screen says so, so a filtered table reads as one that failed to load 8 rows.

**Fix** Keep the roster rank and label it. Pass PagedTable's existing `footnote` prop (paged-table.tsx:65-67, already rendered under the pager) with "# is position in the full 74-channel roster, not in this filtered view" — shown only when a filter is active.

**Revised fix** Keep the roster rank and label it, using the existing `footnote` prop, exactly as comment-table.tsx:166-173 already does. In leaderboard-table.tsx, add to the PagedTable call (around line 209):

  footnote={filtered.length < channels.length ? (
    <p className="note" style={{ marginTop: 6 }}>
      # is each channel's position by {mode} over {win} in the full {channels.length}-channel
      roster, not in this filtered view, so the numbers skip the channels you have hidden.
    </p>
  ) : null}

Two changes from the finding as written. First, do not hardcode 74: `channels.length` is already in scope and the roster grows, so a literal would go stale silently. Second, name the rank basis ({mode} over {win}) so the one sentence also answers "position by what", which is the other thing the # column never says on the page itself. The condition `filtered.length < channels.length` covers the niche select as well as the four category checkboxes, and both values are already computed. `.note` is the existing 12px muted style (app/globals.css:48); `mono10` also works if matching comment-table's look is preferred. Note that PagedTable returns early on `rows.length === 0` (paged-table.tsx:74) and never renders the footnote in that case, which is correct here since the empty state already explains itself.

## P2 · The niche select can never do anything
`web/components/leaderboard-table.tsx:165` · lens: scan

**Problem** All 74 rows in `_db/channels.json` have `niche: null`, so the `niches` memo (lines 101-105) is empty and the select renders in the DOM with exactly one option: "all niches". Verified. It sits in the primary control bar between the live window tabs and the live category checkboxes, at identical size and styling, so it reads as a working filter you have not used yet. The `title` fallback at line 169 only fires on hover.

**Fix** `{niches.length > 0 && <select …>}`. A control that cannot change anything costs more than the line that hides it.

**Revised fix** Do not hide it. `{niches.length > 0 && <select …>}` conflicts with the project's own posture: docs/plans/2026-07-28-web-dashboard.md:21 makes cold-start states "the DEFAULT first render, not edge cases," and the comment already in this file at lines 176-179 shows the house response to an ambiguous control is to label it, not delete it. Concretely, Eric is the only person who can populate that column and spec.md:867 still has it open — hiding the select removes the one surface telling him the feature is waiting on him, and it later pops into existence unexplained. Instead, make the dead state visible in the layer the eye reads: (1) add `disabled={niches.length === 0}` to the select at line 165, which greys it natively, drops it from tab order, and makes screen readers announce it unavailable; (2) make the single option carry the state rather than a false promise — `<option value="all">{niches.length === 0 ? "niches: not tagged yet" : "all niches"}</option>` — which turns a broken affordance into an honest one, the same move `empty="no channels match these filters"` (line 209) and the `building 89/90` cells already make; (3) add one CSS rule beside globals.css:458, `.controls select:disabled { opacity: 0.5; cursor: default; }`, matching the existing `.pgnav button:disabled` (line 514) and `.shopreset:disabled` (line 833) treatment, since `.controls select` overrides background and border and would otherwise not grey convincingly. Keep the `title` as the long-form explanation. Separately and optionally, give it the visible `<span className="note">niche</span>` label the other three control groups have, so it stops being the one unlabelled widget in the bar. Total cost: two expression changes and one CSS line, no dependency, and unlike hiding it, it stays true when the column is finally filled.

## P2 · The biggest empty run in the table sits exactly at the name-to-number handoff
`web/app/globals.css:381` · lens: scan

**Problem** Measured at 1440px: the `channel` column is 377px but `.chname` caps at `max-width: 13rem` (208px), and `subs` is right-aligned inside 125px. The gap between the last letter of the name and the first digit is 230–331px per row (Pat Simmons 316px, Gary Chen 331px, Brad | AI & Automation 230px) — the widest whitespace in the table, and it is precisely the jump the eye makes on every single row. Nothing crosses it: no rule, no leader dots, and the zebra tint is 40%-transparent accent.

**Fix** With fixed layout (finding 1) pin `channel` to ~19rem so the cell ends near where the name ends. Failing that, left-align `subs` so the first number starts at a predictable x instead of floating 300px away.

**Revised fix** Root cause is broader than the channel column: `table.tbl { width: 100% }` (globals.css:97) plus `table-layout: auto` stretches a 62rem-min table to 1344px and inflates ALL nine columns (subs gets 120px for a 47px number; vids gets 139px for a 2-char number). Pinning `channel` alone under `table-layout: fixed` just relocates the surplus — fixed layout splits the remainder evenly among unsized columns, so the numeric handoffs would widen to absorb it.

Do this instead, using machinery that already exists:
1. Add `tbl-fixed` to leaderboard-table.tsx:210 (the class is already defined at globals.css:619-627 and already special-cases `.num`/`.nowrap` against wrapped numbers).
2. Pass a `<colgroup>` through PagedTable's existing `colgroup` prop (paged-table.tsx:37) with content-sized widths for the eight known columns, and let ONE column — channel — take the remainder by leaving it unsized. That parks all the surplus in the one cell where a left-aligned name can grow into it, instead of spreading it across seven numeric handoffs.

Sizing correction: do NOT use ~19rem for channel. The cell's real max content is 10px padding + 28px avatar + 6px gap + 208px name cap + 10px padding = 262px, and the self row adds `" ★ "` plus the YOU chip (leaderboard-table.tsx:295-300) and the absent row adds a warn chip (line 271) — roughly another 55px. That is ~317px ≈ 20rem. 19rem (304px) clips or wraps the YOU row and the absent rows. Floor is 20rem; 21rem for headroom.

Drop the "failing that, left-align subs" fallback entirely. It is a regression, not a fallback: it contradicts `.tbl th.r, .tbl td.r { text-align: right }` (globals.css:99) and it destroys magnitude scanning in a column that mixes `5,520` and `323,000` — with tabular-nums and right alignment those digits line up by place value; left-aligned they do not. If the colgroup route is rejected, the cheaper honest alternative is to stop stretching the table at all: set `width: auto; max-width: 100%` on this one table so it shrink-wraps its content and the surplus becomes a single right margin instead of eight interior voids.

Severity: P2 is defensible but P3 is closer. It is aesthetic — nothing is misread, no number is wrong, and zebra + hover already carry row tracking. It earns P2 only because it sits on the landing page's primary left-to-right read and is the widest void in the table at desktop widths.

## P2 · Column widths are allocated by header text length, not by decision value
`web/components/leaderboard-table.tsx:97` · lens: scan

**Problem** Measured page-1 widths: `subs/1k views` 200px for values like "12.0"; `vids 30d` 144px for "11"; `growth` 125px for "+710.4%" — the number that decides the default ranking gets the narrowest numeric column, and the two least decision-relevant columns take 344px, a quarter of the table. Cause: `.tbl th { white-space: nowrap }` (globals.css:98) under auto layout, so the longest *header* always wins the width auction.

**Fix** Shorten the two labels to `subs/1k` and `vids` (the tooltips already carry the full definitions, lines 97-98), and under fixed layout give `growth` and `Δsubs` the wide slots.

**Revised fix** Keep both labels intact. Fix the allocation mechanism instead, which also makes shortening unnecessary.

1. Do NOT touch globals.css:98 — proven no-op here, and load-bearing for the narrow comment tables.
2. Do NOT drop `30d` from `vids 30d`. It is the only on-screen marker that the column ignores the window switcher while its two neighbours display theirs.
3. Give the leaderboard a fixed layout with declared slots. PagedTable already exposes exactly this: the `colgroup` prop (paged-table.tsx:62, "fixed column widths, for a table whose layout must not reflow"), with a working precedent in comment-table.tsx:151-164 (`className="tbl tbl-fixed tbl-sticky tbl-hover"` plus a `<colgroup>`). Add `tbl-fixed` to the leaderboard's className (leaderboard-table.tsx:210) and pass a colgroup that sizes by decision value: `channel` widest, then `growth` and `Δsubs` in the wide numeric slots, `subs/1k views` and `vids 30d` at roughly 6rem. Under `table-layout: fixed` the header stops setting width, so the full labels survive at their honest width.
4. Two hazards to respect. The colgroup needs NINE `<col>`s, because `leadingHeader` adds an unsorted `pickcol` `<th>` outside `columns` (leaderboard-table.tsx:212) — comment-table.tsx:30 warns that a colgroup off by one column shears the whole table. And size the `Δsubs`/`Δviews` slots for `365d`, the widest window label, since that label changes with the switcher; at 365d the growth cells also widen (measured 212px there), so the growth slot must clear its largest percentage too.
5. `.tbl-fixed td.num` already carries `white-space: nowrap; overflow-wrap: normal` (globals.css:622), so numbers cannot break under the new layout. Verify at 1120px, 1280px and 1440px across the 7d and 365d windows before landing.

## P2 · Three number conventions across four adjacent numeric columns, and Δviews switches convention mid-column
`web/lib/trust.ts:44` · lens: scan

**Problem** Row 9 of the default page reads `subs 323,000 · Δsubs +125,000 · Δviews +4.1M`. `subs`/`Δsubs` use full grouped digits (`fmtInt`, `signedInt`); `Δviews` uses `compactSignedAuto`, which switches unit at 10,000 — so on the 7d window the same column shows `+5,844`, `+8,832`, `+91.2k`, `+766.6k`. `+8,832` is physically longer than `+91.2k` while being 10× smaller, which defeats scanning a right-aligned tabular column by glyph length. `compactSignedAuto` also strips a trailing `.0`, so the live 90d column renders `+2M` sitting between `+2.4M` and `+1.6M`, breaking decimal alignment under `font-variant-numeric: tabular-nums`. Separately, `growth` uses raw `pctText`, not `capPctText` — at 365d the column shows `+5462.7%` beside `+2.5%`, even though trust.ts:98-104 documents `capPctText` as existing for exactly this roster value.

**Fix** One convention per column, fixed decimals inside a unit: make `compactSignedAuto` always emit one decimal (`+2.0M`) and pick a single threshold, and either compact `Δsubs` the same way or leave `Δviews` uncompacted. Route `growth` through `capPctText`.

**Revised fix** Fix the disclosure gap first, the alignment second, and leave the tested thresholds alone.

1. Give Δviews a CappedText, the way every other rounded figure in the file already has one. Add `capViewText(cell)` beside `capDeltaText` in lib/trust.ts, returning `{ text: compactSignedAuto(n), exact: signedInt(n) }` when the two differ, and passing every non-ok state through `deltaText` unchanged. Then in leaderboard-table.tsx:316-319 fold the exact into the formula the way growth-card.tsx:25-27 does: `view_count newest minus oldest, ${win} · exactly ${v.exact}`. This is the load-bearing part — right now a 4.1M reading has no precise figure anywhere on the page.

2. Fix the column tip, which currently lies. leaderboard-table.tsx:96 says "exact, never rounded"; it should say the measurement is exact and the display is rounded, with the exact figure on hover. (`view_count` genuinely is exact, unlike subscriberCount — that distinction is worth keeping, just not by claiming the pixels are exact.)

3. For alignment, do NOT change `compactSignedAuto`'s thresholds or its `.0` stripping — both are pinned by lib/trust.test.ts:135-148 and argued in trust.ts:38-42. The narrow change that fixes the reported symptom is to stop trimming inside a compact unit only: keep `trim` for nothing and use `toFixed(1)` on the `M` and `k` branches, so `+2M` becomes `+2.0M` and aligns with `+2.4M`. That still breaks the two assertions at :146-147, so it needs to land as a deliberate reversal with those tests updated and the reasoning written into the comment — not as a silent tweak. If that reversal is not wanted, the alternative is to leave the number alone and right-align on the unit instead (CSS), which costs no formatter change at all.

4. Route growth through `capPctText` ONLY together with its `exact`, mirroring growth-card.tsx:23-27: render `rate.text` inside `Derived` with `subscriber delta ÷ subscribers at window start${rate.exact ? ` · exactly ${rate.exact}` : ""}`. Note the tradeoff before committing: PCT_CAP is 10 (1000%), so 365d page 1 collapses to +5.5k%, +4.3k%, +3.6k%, +2.7k%, +1.7k%, +1.6k%, +1.5k% — seven rows that currently discriminate cleanly. In a table (unlike a fixed-width card) `+5462.7%` fits fine; the honest question is whether the cap is a card rule that should not travel to the leaderboard at all. Verify with `npx vitest run` from web/.

## P2 · Every number sits ~5px above the name it belongs to
`web/app/globals.css:100` · lens: scan

**Problem** Measured on row 1: the `.chname` box centres at y=251, the `subs` text centres at y=246. `.tbl td { vertical-align: top }` combined with a 28px avatar (leaderboard-table.tsx:291) makes a 51px row where the numeric cells' 16px line boxes are pinned to the top while the name is centred inside the avatar's inline-flex. Across a 1392px scan the row has no shared optical baseline, which is the one thing a wide table needs to hold the eye on one row.

**Fix** `vertical-align: middle` on the leaderboard's tds (scope it via `.tbl-zebra td` or a leaderboard class so the multi-line opportunity/comment tables keep `top`), or drop the avatar to 20px so the row height is set by the text.

**Revised fix** Do not ship `vertical-align: middle` on its own — measured, it leaves a −2.8px offset. The pair that actually zeroes it, verified live in the running app, is two lines in /Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker/web/app/globals.css beside the existing `.tbl td` rule at line 100:

  .tbl-zebra td { vertical-align: middle; }
  .tbl-zebra .chcell { vertical-align: top; }

The second line is the load-bearing one: aligning the 28px inline-flex to the top of its line box collapses that cell's content box from 34.5px to 28px, so the row has nothing left to centre except the avatar/name pair. Measured result: name-to-number delta 4.2px → 0.0px on all 10 rows, and row height 50.5px → 45px, which gives back ~55px of leaderboard height as a side effect. The 28px face is kept.

One tradeoff to state in the commit body rather than discover later: `middle` changes rows that carry a wrapped state string. The growth column (`className="r num"`, leaderboard-table.tsx:312-314) has no `.nowrap`, so a state like "building, 221 of 365 days" wraps to two or three lines and sets the row height. Today every cell in such a row starts at the top, so the numbers line up with the state's first line; after this change the single-line cells centre against the state block's middle instead. I forced that case and confirmed it (numbers move to 256.1 while the state's first line stays at 246.4). That is defensible — every single-line cell still shares one baseline — but if it is unwanted, the alternative is `.tbl-zebra td.nowrap, .tbl-zebra td.num { vertical-align: middle }` scoped away from the wrapping growth cell, or adding `nowrap` to the growth column so no leaderboard cell ever wraps.

Scope check done: `.tbl-zebra` appears only on the leaderboard (leaderboard-table.tsx:210), and `.chcell` is otherwise used only in channel-directory.tsx:142 where it is a flex item (`.dirlink`, globals.css:429) and `vertical-align` is ignored, so the scoped selector is belt-and-braces rather than necessary.

## P2 · The last page collapses the layout by 303px under the cursor
`web/components/paged-table.tsx:88` · lens: scan

**Problem** Measured: the pager's top is 733px on pages 1–2 and 430px on page 8 (4 rows of 10). The whole page fits in a 950px viewport with no document scroll (`scrollHeight === innerHeight === 950`), so the last page leaves ~300px of empty card where the table was, and the `›` button you just clicked jumps 303px up from under the pointer. With a category filter applied the tail is 6 rows and the jump is ~250px. It reads as the table having failed to render.

**Fix** Give `tbody` a `min-height` of `perPage × row-height`, or pad the last page with empty filler rows. `usePager` already knows `perPage` and `slice.length`.

**Revised fix** Reserve the height on the wrapper, not on tbody, and reserve it from a measurement rather than from arithmetic. In paged-table.tsx: keep a ref on the `.tblwrap` div, and in a layout effect record `el.offsetHeight` into a ref whenever `slice.length === perPage` (a full page); apply that recorded value as `style={{ minHeight }}` on the wrapper only while `rows.length > perPage`. Roughly eight lines, no dependency, no fake rows.

Two details that matter: (a) do not compute `perPage x rowHeight` — `perPage` is user-settable from the pager's select (pager.tsx:78, options 10/25/50/100), so at 100 over 74 rows that formula reserves ~5000px of empty card; gating on `rows.length > perPage` and using a measured full-page height avoids that. (b) Because .tblwrap carries the card fill (globals.css:569-578), the reserved space will render as card rather than page background — that is the intended look (a fixed-height card whose last page is partly empty) but it is a visible change, not a no-op.

If a JS-free version is preferred, `height` (not `min-height`) on tbody does behave as a minimum in Chrome, but it is a table-layout quirk rather than a guarantee; the wrapper min-height is the portable one.

## P2 · Blocked windows print the identical sentence twice, side by side, in two numeric columns
`web/components/leaderboard-table.tsx:315` · lens: scan

**Problem** Verified at 365d: 12 of 74 rows render `Δviews` and `subs/1k` as the same string — `1 bad day | 1 bad day`, `6 bad days | 6 bad days`; the corrupt row shows `15 bad days | 15 bad days`. `subs_per_1k_views` is blocked *because* `view_delta` is blocked, so the second cell restates the first and both are English prose right-aligned against a column of decimals. On the 365d page-1 view, four of the top ten rows carry this doubled phrase.

**Fix** When both cells carry the same blocked reason, render it once (colSpan the pair, or render the derived cell as `--` with the shared explanation on its title). The state is still a state, it is just not said twice.

**Revised fix** Collapse the pair only when both cells resolve to the identical state string, and keep the state visible rather than downgrading it to `--`.

In `LeaderRow` (leaderboard-table.tsx:315), compute the two strings first and branch once:

- if `views.state !== "ok" && per1k.state !== "ok" && stateText(views) === stateText(per1k)`, emit a single `<td className="r num nowrap" colSpan={2} title={stateTitle(views)}><span className="muted">{stateText(views)}</span></td>` — the reason renders once, centred across the Δviews / subs/1k pair, still a state, still explained on hover.
- otherwise emit the two cells exactly as today.

`PagedTable`'s `row` prop takes complete `<tr>` markup and the leaderboard passes no `colgroup`, so a colSpan cell needs no other change. Keep the muted class so the pair still reads as "no number here", and keep `title={stateExplain(...)}`, which is the only place the "waiting will not fix it" sentence lives.

Do not render either cell as `--`: it collides with the unmeasured marker this same table uses for absent channels and blends two claim states.

Same-string equality covers both the 12 blocked rows and the 10 building rows at 365d without special-casing either state. Add a vitest case beside the existing `components/*.test.tsx` files asserting that a row with blocked/blocked (`unusable: 6`) renders "6 bad days" exactly once, and that a row where only `per1k` is non-ok still renders two cells.

Note for follow-up (out of scope here): `components/window-table.tsx:55-66` repeats the same reason across up to four cells of a single row, and the design doc at docs/superpowers/specs/2026-07-30-dashboard-refinement-design.md:282 mocks that table with one caption per row instead. Fixing only the leaderboard leaves that one doubled.

## P2 · 10 rows per page makes your own row unreachable, and makes the sticky header dead weight
`web/components/paged-table.tsx:54` · lens: scan

**Problem** 74 channels at 10 per page is 8 pages. Eric Tech is #30 in the default 90d/growth ordering (page 3), #18 at growth/7d (page 2), #44 at general/7d (page 5), #39 by subscribers (page 4) — so "where am I" costs 2–5 page turns and changes page every time you touch the mode switcher. There is no name search, the niche select is dead, and the category checkboxes cannot narrow to one channel. Meanwhile the page does not scroll at all at 10 rows (`scrollHeight === innerHeight === 950`), so `tbl-sticky` (globals.css:567) never engages and the horizontal scroll shadows never move — three long-table affordances on a table that is never long.

**Fix** Default `perPage` to 25 for this table (3 pages, sticky header starts earning its keep), and pin the self row as a persistent last row on every page so the comparison the whole board exists for is always on screen.

**Revised fix** Keep the perPage half, drop the pinned row, and answer "where am I" with data that is already loaded.

1. Pass `perPage={25}` on the PagedTable call at web/components/leaderboard-table.tsx:202. One prop, scoped to this table. It restores usePager's own house default (pager.tsx:17 `initialPerPage = 25`, whose docstring is literally written around "1-25 of 72"), cuts 8 pages to 3, and makes the document scroll (measured 1625px against a 728px viewport) so `.tbl-sticky` starts earning its rule. Do not touch paged-table.tsx:33 — video-table.tsx:69 passes 10 deliberately and the directory has its own shape.

2. Instead of pinning a row, render the self rank in the controls strip. `channels.find(c => c.is_self)?.rank[mode][win]` is already in the props and already re-renders on every mode/window switch. A single line next to "rank by" reading `you: #30 of 74` answers the actual question in zero page turns, costs no sort or slice change, and keeps the pager readout honest. Render `--` (not 0, not omitted) when that rank is null — an unranked channel is a state, same as the `?? "--"` already at leaderboard-table.tsx:288.

3. If a jump is wanted on top of that, do it by narrowing rows, never by injecting one: make the readout a toggle that filters `filtered` (leaderboard-table.tsx:107-115) to the self row, matching the "you" tab that lib/directory.ts filterDirectory already implements for /channels. Same in-repo pattern, no new concept, sort and pager stay truthful because the pager is still slicing exactly what it was handed.

4. Separately, and not as part of this: the niche select at leaderboard-table.tsx:165-175 has no data behind it in this build (all 74 rows are `niche: null`). Either hide it when `niches.length === 0` or file it on its own — it is a dead control, not evidence about page size.

## P2 · The subs column is styled as Oracle, but subscriber_count is Derived and rounded to 3 significant figures
`web/components/leaderboard-table.tsx:302` · lens: trust

**Problem** `<td className="r num">{fmtInt(c.subscriber_count)}</td>` renders "157,000" bare — same weight, same treatment as `vids 30d`, which is a genuinely exact count. docs/system.md:219 annotates the field as `"subscriber_count": 219000, // rounded, Derived` against `"view_count": … // exact, Oracle`, and every channel in the roster carries a bucket (40 at ±100, 25 at ±1,000, 8 at ±10, 1 at ±10,000). The header tip is "subscriber count at the newest snapshot" — no mention of rounding — and that tip is itself unreachable (finding 1). The ±bucket exists only in the hover-only avatar peek two columns to the left and inside the Δsubs formula. The most-read column on the page is the one column that hides its own uncertainty, in a project whose stated invariant is that a number carries its provenance.

**Fix** Wrap the cell in `<Derived formula={`YouTube reports this channel to 3 significant figures: ${fmtInt(c.subscriber_count)} ${bucketText(c.subscriber_bucket)}`}>`, and change the column tip to "subscriber count at the newest snapshot; YouTube rounds it, hover a number for its width". `bucketText` is already imported in this file.

**Revised fix** Keep the cell Oracle-plain — do not wrap it in Derived. Two changes, both inside existing precedent: (1) leaderboard-table.tsx:302, give the td the channel's own width as a hover, guarding the null bucket so it never renders a dangling "to .": `<td className="r num" title={c.subscriber_count === null ? undefined : `YouTube rounds subscriber counts to 3 significant figures${c.subscriber_bucket === null ? "" : `; this channel to ${bucketText(c.subscriber_bucket)}`}`}>`. bucketText is already imported at :11. (2) leaderboard-table.tsx:86, match the wording the identical column already uses on /channels (channel-directory.tsx:27): tip: "subscriber count at the newest snapshot. Rounded to 3 significant figures — hover a number for its own rounding width. No vendor sells better." Note that change (2) only becomes visible once the sortable-table button-title shadowing is fixed (sortable-table.tsx:90 vs :99), so land it with that fix or the header disclosure stays unreachable and change (1) is carrying the whole finding. If only one change ships, ship (1).

## P2 · All provenance on the leaderboard is title-only, so none of it is reachable by keyboard or touch
`web/components/trust.tsx:7` · lens: trust

**Problem** `Derived` renders `<span className="derived num" title={formula}>` with no `tabIndex`, no `aria-describedby`, no focus affordance. The `title` attribute never fires on keyboard focus and never on touch. Every formula, every rounding width, every `stateExplain` sentence, every column tip, every rank-mode and category explanation on this page is a `title`. `.derived` sets `cursor: help`, which is a mouse-only signal. A keyboard or tablet user sees "+151,360" and "< 48" and "6 bad days" with no way to learn what any of them mean — on the page whose thesis is that a number must carry its own provenance.

**Fix** Give `Derived` `tabIndex={0}` plus a visually-hidden `<span id>` carrying the formula and `aria-describedby` pointing at it, so the formula reaches both the a11y tree and keyboard focus. Add a `:focus-visible` outline to `.derived`. Apply the same to the state spans in leaderboard-table.tsx (lines 321, 330).

**Revised fix** Keep the finding, tighten the fix on two points.

1. Do not add a `.derived:focus-visible` rule. globals.css:602 is `:where(a, button, select, summary, input, [tabindex]):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` — the moment `Derived` carries `tabIndex={0}` it already matches `[tabindex]`. Adding a second rule duplicates a global.

2. `tabIndex={0}` + `aria-describedby` + an `.sr-only` span fixes screen readers and gives a focus ring, but it does NOT fix the sighted-keyboard or touch user the finding is actually about: no browser renders a `title` tooltip on focus, and a tap on a focusable span renders nothing either. So the described fix leaves the visible half of the problem exactly where it was. The description has to become *visible* on focus. CSS-only, no JS, no dependency, following the `.avpeek` precedent already in this file:

- `Derived` renders `<span className="derived num" tabIndex={0} aria-describedby={id}>{children}<span className="prov" id={id}>{formula}</span></span>` with `id` from `useId()`.
- `.prov` is positioned like `.sr-only` by default; `.derived:focus-visible .prov`, `.derived:hover .prov` promote it to a real positioned panel.
- Critical: give `.prov` the same treatment `.avpop` is getting in the separate fix — `position: fixed` and portalled, or at minimum `display: none` until shown. A `position: absolute` panel that is laid out while hidden inside `.tblwrap` is the exact bug already diagnosed on this page, and a naive `.prov` reintroduces it forty times per page instead of ten.

3. Scope it correctly, because most of the page's `title`s sit on elements that are already focusable and need no tabIndex — only `aria-describedby` + the visible-on-focus span:
- already focusable: the sort buttons (sortable-table.tsx:94-103, whose `<th title={col.tip}>` at :92 is the unreachable part, not the button), the rank-mode buttons (leaderboard-table.tsx:158), the category `<label>`s (:184).
- need tabIndex added: `Derived` (trust.tsx:9), the two state spans (leaderboard-table.tsx:321, :330), `VerdictBadge` (trust.tsx:26) and `Chip` (trust.tsx:43) when a `title` is present, and the two `<span className="note">` labels (:147, :180).

4. Accept the tab-order cost explicitly, or mitigate it. Four `Derived` cells plus up to two state spans across ten rows is roughly 40-60 new tab stops per leaderboard page. If that is judged too heavy, the cheaper variant is `aria-describedby` on all of them (free, no tab stop, fixes screen readers) plus tabIndex only on the eight header tips and the four control tips, and accept that the per-cell formula stays screen-reader-only. That is a smaller fix but it does not close the touch gap, so state which tradeoff is being taken rather than letting it be implicit.

5. Test with vitest alongside the existing a11y precedent (gap-cell.test.tsx already asserts `.sr-only` content): assert `Derived` exposes its formula via the element referenced by `aria-describedby`, not via `title` alone.

## P2 · growth and subs/1k views change with the window switcher but name it in neither the header nor the formula
`web/components/leaderboard-table.tsx:95` · lens: trust

**Problem** `Δsubs ${win}`, `Δviews ${win}` and `vids 30d` all carry their span in the label. `growth` is bare, and its formula is the static string "subscriber delta ÷ subscribers at window start". `subs/1k views` is bare, and its formula is the static "subscriber delta ÷ (view delta ÷ 1000)". Switching 7d → 365d moves Rick Hau's growth cell from +6.5% to +5462.7% with nothing in the header, the cell, or the tooltip naming which span produced either. Two of the eight columns silently re-mean themselves. The `#` column has the same problem for two variables at once (mode and window); its tip covers it, but that tip is unreachable per finding 1.

**Fix** Label them `growth ${win}` and `subs/1k ${win}`, and interpolate `${win}` into both formulas as the Δsubs formula already does. Label the rank column `# by ${mode}` so the sticky header still says what it is ranking once the controls scroll away.

**Revised fix** Two columns, four one-line edits in web/components/leaderboard-table.tsx; leave the rank column alone.

1. :95 — `{ key: "growth", label: `growth ${win}`, align: "right", tip: `subscriber delta ÷ subscribers at the start of the ${win} window` }`
2. :97 — `{ key: "per1k", label: `subs/1k ${win}`, align: "right", tip: `subscriber delta ÷ (view delta ÷ 1000) over ${win}: subscribers earned per thousand views` }`. Note this drops "views" from the label, matching docs/wireframes.md:130, so the column gets no wider than it is today.
3. :313 — `<Derived formula={`subscriber delta ÷ subscribers at window start, ${win}`}>`
4. :326 — `<Derived formula={`subscriber delta ÷ (view delta ÷ 1000), ${win}`}>`

Do NOT relabel the rank column `# by ${mode}`. Its tip at :83 already reads `Position by ${mode} over ${win}`, naming both variables; the label is also interpolated into the sort button's own title at sortable-table.tsx:99, so the label change would produce "Sort by # by growth"; and it widens the narrowest column in a table already pinned to `minWidth: 62rem` (see the width rationale at :229-232). The rank column's real defect is that its tip is shadowed by the inner button's `title` — fix that in sortable-table.tsx (merge the tip into the button title, or drop the redundant "Sort by …" title) and the rank header explains itself with no relabelling.

## P2 · The growth % names its denominator in words but never shows the value, the dates, or its own uncertainty
`web/components/leaderboard-table.tsx:313` · lens: trust

**Problem** The formula reads "subscriber delta ÷ subscribers at window start" — a word, not a number. Rick Hau's 365d cell prints "+5462.7%": that is 16,989 ÷ 311 subscribers on 2025-07-31, a denominator with three significant figures and its own ±1 bucket, rendered to a tenth of a percent. The StateCell already carries `from: "2025-07-31"`, `to: "2026-07-30"` and `bucket: 100`, and the leaderboard renders none of it — no cell on this page shows a single date, so "Δsubs 7d" (which actually resolves 2026-07-24 → 2026-07-30, six days) is never checkable. Separately, this cell uses raw `pctText` while the growth card uses `capPctText`, which would render the same figure as "+5.5k%"; the table asserts four more significant digits than its sibling surface for the identical number.

**Fix** Put the denominator and the resolved span into the formula: `` `${signedInt(delta)} ÷ ${fmtInt(start)} subscribers on ${growth.from} (${growth.from} → ${growth.to})` ``. Switch the cell to `capPctText` so the leaderboard and the growth card agree above 1000%.

**Revised fix** Keep `pctText`. Fix the disclosure, not the precision.

1. Make the formula state-aware and interpolate only what the cell actually resolved (web/components/leaderboard-table.tsx L311-314). Roughly:

```tsx
const start = growth.state === "ok" && delta.state === "ok" && c.subscriber_count !== null
  ? c.subscriber_count - (delta.value ?? 0)
  : null
<td className="r num">
  {start !== null ? (
    <Derived formula={`${signedInt(delta.value ?? 0)} ÷ ${fmtInt(start)} subscribers on ${growth.from}, ${win} (${growth.from} → ${growth.to}); YouTube rounds each endpoint to 3 significant figures, so both ends carry their own width`}>
      {pctText(growth)}
    </Derived>
  ) : (
    <span className="muted" title={stateTitle(growth)}>{stateText(growth)}</span>
  )}
</td>
```
The non-ok branch is the same `stateText`/`stateTitle` pair the Δviews and subs/1k cells already use at L316-330, so bounded and building windows keep rendering as states and never acquire a fabricated denominator. Say "3 significant figures", not `bucketText(c.subscriber_bucket)` — the stored bucket describes today's count, not the 311 the denominator is.

2. Label the window on the column, matching its neighbours: L95 `label: \`growth ${win}\``, and put `${win}` in the header tip too.

3. Cheapest win for the "six days is never checkable" half: the resolved span is uniform across all 74 rows for a given window (7d = 2026-07-25 → 2026-07-31 for every channel; 365d = 2025-08-01 → 2026-07-31 for all 63 ok rows). So render it once beside `<WindowTabs>` in the controls row — e.g. a `note` reading `2026-07-25 → 2026-07-31` — which makes Δsubs, growth, Δviews and subs/1k all checkable at once instead of only the growth column, and costs no per-row width.

## P3 · Missing values render as a bare '--' with no accessible text
`web/components/leaderboard-table.tsx:265, 275, 288, 302, 333` · lens: a11y

**Problem** Absent rows and null cells render `<td className="muted num">--</td>`. Screen readers announce two hyphens as silence or as 'dash dash' depending on punctuation verbosity, so a screen reader user hears an empty cell — indistinguishable from a rendering bug and, more to the point, indistinguishable from a zero, which is the exact confusion this project's first invariant exists to prevent. The `.statecell` class (globals.css:44) that de-styles a state so it stops looking like a measurement is not applied to any of these cells either.

**Fix** Render `<span aria-hidden="true">--</span><span className="sr-only">not measured</span>` from a tiny shared `NoValue` component, and apply `.statecell` to those cells so the visual channel matches the semantic one.

**Revised fix** Add a tiny shared component next to the existing trust primitives (components/trust.tsx, alongside Derived/Chip — no new file needed):

  export function NoValue({ label = "not measured" }: { label?: string }) {
    return (<><span aria-hidden="true">--</span><span className="sr-only">{label}</span></>)
  }

Then two changes at the five sites, not one:

1. SWAP the class, do not add it. Use `statecell` in place of `num` (and drop `muted`, which statecell's opacity already covers), matching the existing project pattern at compare-table.tsx:110 (`cell.state !== "ok" ? "r statecell" : "r num"`). Adding statecell alongside num leaves the right-aligned tabular measurement face partly intact, which is the thing the class exists to remove. So: line 265 -> `<td className="statecell">`, lines 273-277 -> `<td key={i} className="r statecell">`, lines 288/302/333 -> `className="r statecell"` only in the null branch (the non-null branch must keep `r num`, so these three need a ternary on the className exactly like compare-table does, not a blanket class change).

2. Give line 288 its own label. A null `c.rank[mode][win]` means the channel is not ranked in this mode/window, not that a measurement is missing — `<NoValue label="not ranked" />` there, default "not measured" at 265, 273-277, 302 and 333.

Optional follow-on, same root cause and same file: the dviews and per1k cells at lines 321 and 330 pass `title={stateTitle(...)}`, but stateExplain returns undefined for the three states that render "--", so those tooltips are empty in exactly the case that needs them. Routing their "--" branch through NoValue closes that too.

No test churn: there is no leaderboard-table.test.tsx, and the "--" assertions in lib/trust.test.ts, gap-cell.test.tsx and avatar-peek.test.tsx cover other modules and are untouched.

## P3 · The compare bar appears at the far end of the document with no name, no landmark and no announcement
`web/components/compare-bar.tsx:60` · lens: a11y

**Problem** `createPortal(<div id="picks">…, document.body)` puts the bar after every other element in the DOM. Ticking the compare checkbox in row 1 makes a fixed bar appear visually at the bottom of the viewport, but for a keyboard user the 'compare →' link it contains is ~30 tab stops away (10 rows × 3 stops, plus pager, plus anything after `<main>`). Nothing announces that the bar appeared; the div has no `role`, no `aria-label`, no live region. A screen reader user ticks two boxes and has no indication a compare action became available.

**Fix** Give the portal `role="region" aria-label="compare selection"` and wrap its contents in `role="status"` so its appearance and its 'X vs Y' text are announced. Do not move focus — announcing is enough and is less disruptive mid-scan.

**Revised fix** The proposed fix will not work as written. `role="status"` is an `aria-live="polite"` region, and screen readers only announce content that changes *inside a live region that already existed in the accessibility tree*. Here the entire portal — live region and all — is inserted in one shot when `href` flips from null (line 54 early-returns before the portal exists), so NVDA, JAWS and VoiceOver will commonly announce nothing at all. Adding `role="status"` to a node that is born with its content is the classic no-op.

Corrected shape, still no dependency and no new state:

- Always mount the portal. Move the `href === null` guard so it gates only the visible bar's contents, not the `createPortal` call, and keep an `sr-only` live region node mounted unconditionally inside it so it pre-exists the first pick:

  `createPortal(<><div className="sr-only" role="status" aria-live="polite">{href ? announcement : ""}</div>{href && <div id="picks" role="region" aria-label="compare selection">…</div>}</>, document.body)`

  Note `#picks` at `globals.css:446` has `border-top` and padding, so the visible bar must still be conditional — an always-rendered empty `#picks` would draw a stray rule across the bottom of every page. Only the `sr-only` node is permanent, and `.sr-only` already exists at `globals.css:66`.

- The announcement string should name both sides in the same words the bar shows, including the implicit self-pairing the UI performs silently: `"comparing {first.name} with you"` for one pick, `"comparing {first.name} with {second.name}"` for two, and `"compare selection cleared"` is unnecessary — let it go empty on clear rather than announcing a removal.

- Keep `mounted`/`useEffect` as is; the portal still must not run during SSR.

- Do not move focus. Agreed with the original on that point.

One honest limitation to record with the fix: `role="region" aria-label` gives screen reader users landmark navigation to the bar, but does nothing for a sighted keyboard user, who still tabs through ~26 stops to reach "compare →". If that matters, the cheaper follow-up is making the bar's own controls reachable early rather than reordering the table — but that is a separate change and should not be bundled into a P3 announcement fix.

## P3 · Control-group labels and category tips are decorative spans and label titles, not programmatic associations
`web/components/leaderboard-table.tsx:147, 180, 184, 169` · lens: a11y

**Problem** 'rank by' and 'show' are `<span className="note" title=…>`: their explanatory text is pointer-only, and the 'show' span labels nothing — the four category checkboxes are four loose inputs with no `fieldset`/`role="group"`, so a screen reader user meets 'ai-creator checkbox, checked' with no indication these four belong together or what unticking one does. `CAT_TIPS` rides `title` on the `<label>` element, which is not the input's accessible description, so the definition of 'adjacent' vs 'company' reaches no non-pointer user. Same pattern on the niche select: the 'no niche data in this build yet' explanation is a `title` that only appears on hover, in exactly the case where the control looks broken.

**Fix** Wrap the four checkboxes in `<div role="group" aria-label="show categories">` mirroring the `role="group" aria-label="rank by"` already used for the mode tabs, and move each `CAT_TIPS` string onto the input via `aria-describedby` pointing at a `.sr-only` span. For the empty-niche case, render the sentence as visible text beside the select rather than as a title.

**Revised fix** Three changes in components/leaderboard-table.tsx, no CSS and no dependency:

1. Wrap lines 183-197 in `<div role="group" aria-label="show categories">`, mirroring line 150 and the four other `role="group"` sites in the codebase. Keep the "show" span as the visible label but pair it via `id` + `aria-labelledby` on the group instead of `aria-label` if you want one source of truth for the word.

2. For CAT_TIPS, prefer the minimal move first: put `title={CAT_TIPS[cat]}` on the `<input>` rather than the `<label>`. An element's own `title` *is* its accessible description when nothing else supplies one, so this is a one-attribute relocation that fixes the programmatic association with zero new DOM. If you also want the text to reach keyboard and touch users (title never does), then go the full route: `aria-describedby={`cat-${cat}`}` on the input plus a `<span id={`cat-${cat}`} className="sr-only">{CAT_TIPS[cat]}</span>` inside the label. Do not do both — a `title` plus an `aria-describedby` on the same input makes the title dead weight.

3. For the niche select (165-175), do not just move the sentence to visible text beside a control that does nothing. When `niches.length === 0`, render `<span className="note">no niche data in this build yet</span>` in place of the select entirely. A select whose only option is "all niches" is a control with no effect; removing it is smaller than explaining it, and the note still tells the reader why the filter is missing rather than leaving a silent gap.

Optional, same class, cheap: MODE_TIPS (line 158) and the "rank by" explanation (147) have the identical pointer-only limitation. If you touch this area, the mode buttons can take the same `aria-describedby` + `.sr-only` treatment; the 147 span itself needs nothing beyond that, since the group already carries `aria-label="rank by"`.

## P3 · A third compare tick silently unticks the first, usually on a page you cannot see
`web/components/leaderboard-table.tsx:74-77` · lens: controls

**Problem** `setPicked((p) => ... [...p, id].slice(-2))` drops the oldest pick on a third tick. The code comment names this as deliberate ("a third tick drops the oldest rather than refusing the click"), and keying on channel_id rather than row index is genuinely right. But the UI never states the cap of two. The checkbox column header is `sr-only`, the checkboxes carry no per-row hint, and with 10 rows per page across 8 pages your first pick is usually on a different page — so the only feedback that something was dropped is a name quietly changing inside the fixed bottom bar. From the table, three boxes appear ticked and one of them just is not.

**Fix** Say the cap where the picks live. In CompareBar, add "pick 2" or "2 max, a third replaces the oldest" beside the existing `compare` label, and set `title` on the row checkbox to the same sentence. No state change needed — only the rule made visible.

**Revised fix** Keep `slice(-2)` — the behaviour is right, only the rule is unstated. Two places, both copy:

1. In CompareBar (compare-bar.tsx:62), put the rule where the picks live, beside the existing label: `<span className="lbl">compare</span><span className="note">2 max — a third replaces the oldest</span>`. The bar mounts as soon as one row is ticked (`compareHref` returns non-null at length 1), so the rule is on screen before the cap can ever bite.

2. Do NOT rely on `title` alone for the row checkbox — a tooltip is invisible to keyboard and touch users, and `aria-label` already wins the accessible-name computation, so a `title` would be decoration only. Instead put the cap in the two places that already speak: change the sr-only header at leaderboard-table.tsx:212 to "select to compare, 2 max", and make the row's aria-label state the consequence when the cap is already reached — pass the current picks down and render `aria-label={picked ? `deselect ${c.name}` : atCap ? `select ${c.name} to compare, replaces ${oldestName}` : `select ${c.name} to compare`}`. That names the channel about to be dropped, which is the one fact the current UI withholds. Add the same sentence as `title` on the checkbox if a mouse tooltip is wanted, but as an extra, not as the mechanism.

## P3 · A picked channel that a filter removes stays picked with no way to untick it except clearing both
`web/components/leaderboard-table.tsx:107-115, 219-220` · lens: controls

**Problem** `picked` is never reconciled with `filtered`. Tick a company channel, then untick the "company" category: the row leaves the table, but CompareBar reads from the full `channels` array, so the pick stays in the bar and the compare link stays live. There is no checkbox anywhere on screen for that channel, so the only way to drop it is "clear", which also discards the pick you wanted to keep. The bar is asserting a selection the table is simultaneously denying exists.

**Fix** Do not silently drop the pick (that would lose a deliberate choice). Mark it: in CompareBar, if a picked id is not in the currently filtered set, render its chip muted with a title like "hidden by the current filters" and give each chip its own small x that removes just that one pick. Per-chip removal is the missing affordance whether or not the row is filtered out.

**Revised fix** Give each real pick its own removal control, and mark the ones the table is currently not showing.

1. In `leaderboard-table.tsx` L219, pass the visible set alongside the full roster:
   `visible={useMemo(() => new Set(filtered.map(c => c.channel_id)), [filtered])}`
   Keep `channels` as-is — the bar still needs it to resolve a name for a hidden pick.

2. In `compare-bar.tsx`, change the signature to `onRemove(id: string)` in addition to `onClear`, and render an x only on chips that correspond to an entry in `picked`. Critical detail the original fix glosses over: when `picked.length === 1` the second chip is `byId.get(selfId)` (L58) — that is an implicit stand-in, not a pick, so it must NOT get an x. Only `picked[0]` and `picked[1]` are removable.

3. On a chip whose id is in `picked` but not in `visible`, add a muted class and `title="not in the table right now — the filters or the page you are on are hiding it"`. Phrase it to cover pagination too, since that is the common case; "hidden by the current filters" would be wrong on page 4 with every filter on.

4. `onClear` stays. With per-chip removal it becomes the shortcut rather than the only exit.

5. Tests: `compare-bar.test.tsx` currently only covers `compareHref`. Add render-level cases — an x on each picked chip removes exactly that id; no x on the implicit "you" chip; a picked id absent from `visible` renders muted and still removable.

Scope note: if only one change lands, land the per-chip x. It fixes both the paging case and the filter case. The muted marker is the smaller half.

## P3 · Nothing announces that a filter or sort changed the table, and the coverage readout is not a live region
`web/components/pager.tsx:86-89` · lens: controls

**Problem** Every control on this row rewrites the table body with no announcement. A screen reader user ticks a category checkbox or presses a sort header and hears only the control's own state change ("checked", "descending"); the fact that the roster went from 74 rows to 10, or that the row set is now different, is never spoken. `.pgcount` — "1-10 of 74 channels", the one element that states the consequence — is a plain span. `aria-sort` is set correctly on the headers, so the sort direction is exposed; its effect on the data is not.

**Fix** Add `aria-live="polite"` and `aria-atomic="true"` to the `.pgcount` span in Pager. It already contains exactly the sentence that should be announced, it updates on every filter, sort, page and per-page change, and it is one attribute pair on an element that already exists.

**Revised fix** Keep `aria-live="polite" aria-atomic="true"` on the `.pgcount` span, but also make its content change when only the ordering changes. PagedTable already holds `sortKey` and `sortDir` in scope (paged-table.tsx:70), so pass an optional `note` string into `Pager` and render it inside that same span as a `<span className="sr-only">` — the .sr-only utility already exists at app/globals.css:66 — e.g. ", sorted by Δsubs 30d descending". That makes sort, rank-by and window switches mutate the announced sentence, with no new state and no dependency. Separately, hoist the live region above the `rows.length === 0` early return in paged-table.tsx:74 (or add role="status" to the .empty div) so "no channels match these filters" is spoken as well.

## P3 · A filter that shrinks the list past the current page renders one frame of a headed table with no rows
`web/components/pager.tsx:20-31` · lens: controls

**Problem** The clamp is a useEffect, so it runs after the offending render commits. Untick "ai-creator" (64 of 74) while on page 8: that render still has page=8 against a 10-row list, `slice` is `rows.slice(70, 80)` which is `[]`, and PagedTable's own empty guard tests `rows.length` (10, not zero) so it takes the table branch — a header over an empty tbody, corrected on the next frame. It reads as a flicker or a momentary "no results" on a filter that actually matched ten channels.

**Fix** Derive rather than correct. Replace the effect with `const safePage = Math.min(page, pageCount)` used for both the slice and the Pager's `page` prop, keeping `setPage` for user clicks only. That removes the intermediate frame entirely and deletes the effect.

**Revised fix** In `/Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker/web/components/pager.tsx`, delete the `useEffect` at lines 22-26 (and drop `useEffect` from the line 3 import), then clamp during render so no out-of-range page is ever committed:

```ts
export function usePager<T>(rows: T[], initialPerPage = 25) {
  const [perPage, setPerPage] = useState(initialPerPage)
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))

  // A filter above can shrink the list under the current page. Clamping here rather than in an
  // effect means the shrunk list never gets one committed frame of a headed table with an empty
  // body and a "71-10 of 10" readout. `page` keeps the user's real choice, so re-ticking the
  // filter puts them back where they were.
  const safePage = Math.min(page, pageCount)

  const slice = useMemo(
    () => rows.slice((safePage - 1) * perPage, (safePage - 1) * perPage + perPage),
    [rows, safePage, perPage]
  )

  return {
    slice,
    props: {
      page: safePage,
      pageCount,
      perPage,
      total: rows.length,
      onPage: setPage,
      onPerPage: (n: number) => {
        setPerPage(n)
        setPage(1)
      },
    },
  }
}
```

`pageCount` is already `Math.max(1, ...)` so `safePage` cannot fall below 1. `Pager`'s prev/next `disabled` checks and `aria-current` all read the same prop, so they stay consistent with the slice.

Add the regression test to `paged-table.test.tsx` beside the existing "renders its empty state instead of a headed table with no body" case, since that is the invariant being restored — render 74 rows at perPage 10, page to 8, rerender with 10 rows, and assert a row is present and `.pgcount` does not read a backwards range:

```tsx
it("a filter that shrinks the list past the current page never shows an empty body", () => {
  const many = Array.from({ length: 74 }, (_, i) => ({ id: `r${i}`, n: i }))
  const { container, rerender } = table(many, 10)
  fireEvent.click(screen.getByText("8"))
  rerender(<PagedTable {...propsFor(many.slice(0, 10), 10)} />)
  expect(container.querySelectorAll("tbody tr").length).toBe(10)
  expect(container.querySelector(".pgcount")?.textContent).toContain("1–10")
})
```

If preserving the user's deep page across a filter toggle is judged surprising rather than helpful, the alternative that keeps today's "snap to 1" behaviour without the bad frame is to clamp in render as above *and* additionally call `setPage(safePage)` inside the existing per-page handler pattern — but do not reintroduce an effect to do it.

## P3 · The "#" column never names the rank mode it is counting down
`web/components/leaderboard-table.tsx:79-84` · lens: controls

**Problem** The rank column header is "#" under all four modes. Switching "rank by" from growth to views renumbers the whole column, but the header, the row, and a screenshot of the table are identical either way — the only place the active mode is written down is the tab strip above and a tooltip. It is worse once another column is sorted: the # values then run non-monotonically (7, 2, 45...) beside a header that explains nothing, and the tooltip that does explain it is hover-only.

**Fix** Make the label carry the state the way the other columns already do — `Δsubs 90d` and `Δviews 90d` are built from `win`, so do the same here: `label: mode === "growth" ? "# growth" : `# ${mode}``. One expression, and the column becomes self-describing in a screenshot.

**Revised fix** Keep the state in the label but bound its width using the abbreviated register the table already uses (subs, vids), so the four modes are near-equal length: add `const MODE_SHORT: Record<RankMode, string> = { growth: "growth", general: "blend", subscribers: "subs", views: "views" }` and set the rank column to `label: \`# ${MODE_SHORT[mode]}\``, leaving the existing dynamic `tip` as the long explanation. Max 8 characters instead of 13, so mode switching shifts the column by a character or two rather than seven. If even that reflow is unacceptable, pass a `colgroup` to the leaderboard's PagedTable pinning the rank column width — the mechanism paged-table.tsx:60-62 already exposes for tables that must not reflow when a tab changes. Do not use the raw `mode` string: `# subscribers` both widens the column the most and makes sortable-table.tsx:99's "Sort by # subscribers" tooltip collide with the actual `subs` column.

## P3 · The pager over-elides at exactly 8 pages
`web/components/pager.tsx:64` · lens: scan

**Problem** `pageList` shows every number up to 7 pages and a ±1 window above that. 74 rows at 10 per page is 8 pages — one past the threshold — so from page 1 the nav renders `‹ 1 2 … 8 ›` and pages 3–7 need four sequential clicks each. Verified from page 8: `‹ 1 … 7 8 ›`. The elision was written for lists long enough that a full run would be its own scroll; at 8 items it costs more than it saves.

**Fix** Raise the show-all threshold from `count <= 7` to `count <= 9`, or widen the near-window to ±2.

**Revised fix** Change pager.tsx:65 from `if (count <= 7)` to `if (count <= 9)`, and update the stale comment at pager.tsx:61-63 so it cites the 10/page default instead of a 25/page example. That renders all 8 pages as one run and covers the roster to 90 channels. Layout is safe: 9 numbers + 2 arrows at min-width 28px / gap 3px is ~340px, and `.pager` is `flex-wrap: wrap` (globals.css:477), so the nav wraps rather than overflowing on narrow viewports. Do NOT use the "widen the near-window to plus/minus 2" alternative from the original finding — I ran it and at count=8 from page 1 it still yields [1,2,3,"gap",8], because the window clamps around the current page and collapses at the edges. Optional add-on, only if you also care about tables that genuinely exceed 9 pages (video-table.tsx:69 also runs perPage={10}): add edge compensation alongside the threshold bump — `const start = Math.min(Math.max(page - 1, 2), count - 3)` and build `near` from `[start, start+1, start+2]`, which holds a constant three-number run instead of degrading to a single number at either end. The threshold change alone resolves the leaderboard.

## P3 · The eye enters every row on an unlabelled checkbox rather than on identity
`web/components/leaderboard-table.tsx:212` · lens: scan

**Problem** The compare checkbox is the leftmost column, 32px wide, and its header is `sr-only` — so the first thing in every row, and the top-left corner of the whole table, is a blank cell above 74 unexplained boxes. The rank and the channel name, the two things that identify a row, start 56px and 123px in. Nothing on screen says what ticking two of them does until the CompareBar appears at the bottom.

**Fix** Give the leading `th` a visible short label ("cmp") in place of the sr-only span, or move the column to the far right so the row opens on rank and name.

**Revised fix** Keep the column leftmost — do NOT move it to the far right. The table carries `style={{ minWidth: "62rem" }}` (leaderboard-table.tsx:211) inside `.tblwrap`, so below ~90rem it scrolls horizontally and a right-hand checkbox would sit off-screen, forcing a horizontal scroll per selection, on top of breaking the selection-first convention every data grid uses. Instead, at leaderboard-table.tsx:212 give the leading th a visible micro-label plus the hover tip it is the only header missing: `leadingHeader={<th className="pickcol" title="Tick a channel to compare it against you; tick a second to compare those two."><span aria-label="select to compare">vs</span></th>}`. Use "vs" rather than "cmp" — it echoes the CompareBar's own "compare … vs … " wording (compare-bar.tsx:62,72) and at 11px fits the existing 30px column, whereas "cmp" needs ~34px and would widen it. Mirror the same sentence as a `title` on each row checkbox (leaderboard-table.tsx:254-258) so hovering a box explains itself. CSS-free, one string plus two attributes, no invariant touched.

## P3 · The window switcher is the only control in the strip with no explanation, and it is the one that rewrites six of eight columns
`web/components/window-tabs.tsx:16` · lens: trust

**Problem** In the controls row, "rank by" has a title, each of the four rank modes has a MODE_TIPS entry, "show" has a title, each of the four category checkboxes has a CAT_TIPS entry, and the niche select has one. The `window` note and all six window buttons (7d…365d) have none. That is the control that decides what Δsubs, growth, Δviews, subs/1k and # all mean, and it is also the one whose choice determines whether a row is measurable at all — at 7d, 53 of 74 rows fall to a bounded Δsubs and 52 to a bounded subs/1k, while at 90d only 18 do. Nothing tells a reader that picking a shorter window is what turned the numbers into bounds.

**Fix** Add a title to the `window` note ("the span every Δ, growth and per-1k figure is measured over; vids 30d is fixed at 30d") and per-button titles noting that shorter windows fall below the rounding floor more often — e.g. 7d: "7 days. Most channels' weekly subscriber gain is under 5× their rounding width, so most rows show an upper bound."

**Revised fix** The fix as written should not ship in three respects. (1) It hardcodes a statistic — "Most channels' weekly subscriber gain is under 5× their rounding width, so most rows show an upper bound". That is an authored claim about live data in static chrome, and it goes stale the moment the roster shifts; CLAUDE.md's governing rule is to never assert a number nobody returned. (2) The "vids 30d is fixed at 30d" clause is already stated verbatim in the vids column tip at leaderboard-table.tsx:98 — redundant on the leaderboard, and wrong on /compare, which shares this component (compare-table.tsx:307) and has no vids column. (3) WindowTabs has no tip prop, so leaderboard-specific copy cannot go in it without leaking to /compare.

Instead: add an optional `tip?: string` to WindowTabs and apply it to the `.note` span only (window-tabs.tsx:11-18), leaving the six buttons bare — six near-identical tooltips is noise, and the mechanism is one sentence, not six. Pass it from the call site (leaderboard-table.tsx:164) with mechanical, non-statistical copy: "the span every Δ, growth and subs/1k figure is measured over. YouTube rounds subscriber counts, so over a short window a gain can be smaller than its own rounding width and the cell shows an upper bound instead of a figure."

Then close the actual hole, which is the higher-value half: give lib/trust.ts stateExplain (:205-217) a `bounded` branch, so the bounded subs/1k and Δviews cells at leaderboard-table.tsx:321 and :330 stop rendering "< N" with `title={undefined}`. Something like "This channel's subscriber count is rounded to ±{bucket}, and the gain over this window is under 5× that, so only an upper bound is measurable. A longer window measures it." That is per-cell, derived from that row's own bucket, and correct without asserting anything about the roster.

If the roster-level count is genuinely wanted, derive it rather than author it: the table already holds the filtered rows and the current window, so a live note ("53 of 73 rows bounded at 7d") is honest and self-updating where a static tooltip is not.

## P3 · status "corrupt" is invisible on the row, while "absent" gets a warn chip
`web/components/leaderboard-table.tsx:261` · lens: trust

**Problem** `LeaderRow` special-cases only `c.status === "absent"`, which renders `<Chip variant="warn">absent</Chip>`. The one live `corrupt` channel (Robin Ebers, meta.json reports corrupt: 1) renders exactly like a healthy row: subs 47,300, rank 63, an ok Δsubs at 90d and 365d. Its view-derived cells are `blocked` and say "6 bad days", but that string never says the freshest snapshot failed the view-count monotonicity check, and nothing marks the channel itself. Separately, the `absent` chip passes no `title` even though `Chip` accepts one, so "absent" is an undefined word on the page.

**Fix** Add a `corrupt` chip beside the name with a title from the CLAUDE.md wording ("the freshest snapshot's view_count failed the monotonicity check; subscriber figures are unaffected, view-derived cells say so themselves"), and give the existing `absent` chip a title ("YouTube stopped returning this channel; it no longer ranks").

**Revised fix** Do not hand-write a second corrupt chip in leaderboard-table.tsx — the string would immediately drift from channel-directory.tsx:162-169, which is where this exact chip and title already live. Lift both states into one small `StatusChip({ status })` in components/trust.tsx beside `Chip`, returning null for "ok", and call it from both LeaderRow (in the same slot as the YOU chip, around leaderboard-table.tsx:295-300) and DirectoryCells (replacing channel-directory.tsx:161-169). Titles: absent → "YouTube stopped returning this channel; the figures are its last reading and it no longer ranks." corrupt → "The freshest snapshot's view_count failed the monotonicity check. Subscriber count and Δsubs are unaffected; the view-derived cells name their own state." Note the corrupt wording must be the leaderboard-accurate one, not a verbatim copy of the directory's current "the figures shown are the last trustworthy reading, not today's" — on the leaderboard subscriber_count does come from the corrupt row (pipeline/test_channels.py:33-70 has the pipeline fall back only for the fields the verdict is actually about), so the directory's blanket phrasing would be a fresh inaccuracy once shared. Adjust the directory to the precise wording when you unify. Keep every number on the corrupt row rendering exactly as it does now: lib/growth.ts:108-112 is explicit that corrupt is "a verdict on the freshest row's view_count and nothing else", so blanking cells or dropping the row would break a documented decision. Optionally, since the avatar peek prints a bare "total views" for this channel (lib/growth.ts:217), give that one stat a note when status is corrupt rather than leaving it unqualified.
