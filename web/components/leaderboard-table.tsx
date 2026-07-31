"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { peekStats, type SlimChannel } from "@/lib/growth"
import { tiered, type SortValue } from "@/lib/sort"
import type { RankMode, WindowKey } from "@/lib/types"
import { RANK_MODES } from "@/lib/types"
import {
  bucketText,
  compactSignedAuto,
  deltaText,
  fmtInt,
  pctText,
  ratioText,
  stateExplain,
} from "@/lib/trust"
import { withWindow } from "@/lib/window"
import { AvatarPeek } from "./avatar"
import { CompareBar } from "./compare-bar"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"
import { Chip, Derived, StateText } from "./trust"
import { WindowTabs } from "./window-tabs"
import type { StateCell } from "@/lib/types"

type Key = "rank" | "channel" | "subs" | "dsubs" | "growth" | "dviews" | "per1k" | "vids"

/**
 * Column widths, in rem, in render order.
 *
 * The table was auto-layout with only a `minWidth`, so the widest string *on the current page*
 * set every column: turning from page 1 to page 8 moved `growth` from 125px to 251px and swung
 * the right edge of `subs` by ~98px. Scanning down a ranked list re-aimed the eye on every page
 * turn. `channel` is the one column left unconstrained, because it is the only one that already
 * truncates gracefully (`.chname` has an ellipsis) and so is the right place to put the slack.
 *
 * The numeric widths are sized for the widest *state* string a column can hold, not the widest
 * number — under `table-layout: fixed` a column narrower than its content overflows onto its
 * neighbour, and these cells must keep rendering `< N`, `125/180` and `3 bad days` rather than a
 * zero. Headers grow with the window key too (`Δviews 365d`), so they are measured at 365d.
 */
const COL = {
  pick: 2,
  // wide enough for the longest label the header can take, "# subscribers", plus its sort arrow
  rank: 7.5,
  channel: 20,
  subs: 6.5,
  dsubs: 8,
  growth: 7.5,
  dviews: 8,
  per1k: 8.5,
  vids: 5.5,
}
const COL_TOTAL = Object.values(COL).reduce((a, b) => a + b, 0)

const CATS = ["ai-creator", "company", "adjacent", "unknown"] as const
type Cat = (typeof CATS)[number]

const MODE_TIPS: Record<RankMode, string> = {
  growth: "Subscriber growth rate over the selected window. A small channel doubling outranks a large one adding more people.",
  general: "A blend: 50 growth rate, 20 subscriber count, 30 views gained. Size and momentum together.",
  subscribers: "Raw subscriber count. The biggest channels first, whatever they did this window.",
  views: "Views gained over the selected window, in absolute terms.",
}

const CAT_TIPS: Record<Cat, string> = {
  "ai-creator": "An independent creator whose channel is mainly about AI. The comparison set.",
  company: "A company's own channel (Anthropic, OpenAI and the like). Different incentives, different upload cadence.",
  adjacent: "Not an AI channel as such, but covering enough of it to compete for the same viewers.",
  unknown: "Not categorised yet in config/channels.json.",
}

export type CoverageMap = Record<string, { videos: number; comments: number | null }>

export function LeaderboardTable({
  channels,
  coverage,
  selfId,
  initialWindow,
  ownSweepFrom,
}: {
  channels: SlimChannel[]
  coverage?: CoverageMap
  selfId: string
  initialWindow: WindowKey
  /** the first date our own sweep recorded; any window baseline older than this is vidIQ's */
  ownSweepFrom: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [mode, setMode] = useState<RankMode>("growth")
  const [win, setWin] = useState<WindowKey>(initialWindow)
  const onWindow = useCallback(
    (w: WindowKey) => {
      setWin(w)
      router.replace(withWindow(pathname, w), { scroll: false })
    },
    [pathname, router]
  )
  const [niche, setNiche] = useState<string>("all")
  const [cats, setCats] = useState<Set<Cat>>(new Set(CATS))
  // Selection is keyed on channel_id, not row index, so re-sorting or paging
  // never silently swaps who is selected. A third tick drops the oldest
  // rather than refusing the click.
  const [picked, setPicked] = useState<string[]>([])
  const togglePicked = useCallback((id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))
  }, [])

  const columns: SortColumn<Key>[] = [
    {
      // The label names the mode it is counting down. Unlabelled, "#" reading 73, 21, 72 after a
      // sort on another column is read as broken data long before it is read as a preserved
      // ranking, and the only thing saying otherwise was a hover tip on a column nobody hovers.
      key: "rank",
      label: `# ${mode}`,
      tip: `Position by ${mode} over ${win}. Change it with "rank by" above; sorting a column does not change it, it only greys this one out.`,
    },
    { key: "channel", label: "channel" },
    { key: "subs", label: "subs", align: "right", tip: "subscriber count at the newest snapshot" },
    {
      key: "dsubs",
      label: `Δsubs ${win}`,
      align: "right",
      tip:
        "subscriber_count newest minus oldest in window. YouTube rounds subscriber counts, so " +
        "every figure carries a rounding width — hover a number to see its own.",
    },
    { key: "growth", label: "growth", align: "right", tip: "subscriber delta ÷ subscribers at window start" },
    { key: "dviews", label: `Δviews ${win}`, align: "right", tip: "view_count newest minus oldest in window; exact, never rounded" },
    { key: "per1k", label: "subs/1k views", align: "right", tip: "subscriber delta ÷ (view delta ÷ 1000): subscribers earned per thousand views" },
    { key: "vids", label: "vids 30d", align: "right", tip: "videos published in the last 30 days; this column is always 30d, whatever window is selected" },
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

  return (
    <>
      <div className="controls">
        <div className="grp">
          <span className="note" title="What the # column counts down. It sets the ranking only; every column stays sortable on its own.">
            rank by
          </span>
          <div className="tabs" role="group" aria-label="rank by">
            {RANK_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={m === mode ? "on" : undefined}
                aria-pressed={m === mode}
                onClick={() => setMode(m)}
                title={MODE_TIPS[m]}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grp">
          <WindowTabs value={win} onChange={onWindow} />
        </div>

        {/* A dimension with no data is a missing state, not an empty filter. Every one of the 74
            channels has `niche: null`, so this rendered as a fully enabled select holding one
            option, indistinguishable from a working filter. When there is nothing to filter by it
            leaves the control row entirely and says so underneath, where a fact belongs. */}
        {niches.length > 0 && (
          <div className="grp">
            <span className="note">niche</span>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="filter by niche">
              <option value="all">all niches</option>
              {niches.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {/* The roster's own category tags, set by hand in config/channels.json: who is an
            independent creator, who is a company channel, who is adjacent to the niche, and who
            has not been tagged yet. They were checkboxes in a row of tabs — the only control on
            the board you toggled a different way — and four ticked boxes read as four warnings
            rather than as "all four are in". Keys, pressed when included. */}
        <div className="grp">
          <span className="note" title="Each tracked channel is tagged by hand in config/channels.json. Switch a tag off to drop those channels from the table.">
            include
          </span>
          {/* multi, not one-of: pressed is outlined rather than ink-filled, so four included
              tags do not read as four selected answers to one question. */}
          <div className="tabs multi" role="group" aria-label="include">
            {CATS.map((cat) => (
              <button
                key={cat}
                type="button"
                title={CAT_TIPS[cat]}
                aria-pressed={cats.has(cat)}
                className={cats.has(cat) ? "on" : undefined}
                onClick={() => {
                  const next = new Set(cats)
                  if (next.has(cat)) next.delete(cat)
                  else next.add(cat)
                  setCats(next)
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nine columns and a one-line name cap need more width than a narrow
          viewport has. Scrolling sideways beats wrapping every row to two
          lines, and matches how the other dense tables behave. */}
      <PagedTable
        rows={filtered}
        columns={columns}
        value={value}
        initialKey="rank"
        rowKey={(c) => c.channel_id}
        unit="channels"
        empty="no channels match these filters"
        className="tbl tbl-fixed tbl-sticky tbl-hover tbl-zebra"
        style={{ minWidth: `${COL_TOTAL}rem` }}
        colgroup={
          <colgroup>
            <col style={{ width: `${COL.pick}rem` }} />
            <col style={{ width: `${COL.rank}rem` }} />
            {/* Sized like the rest rather than left to absorb the slack. Unconstrained it took
                624px of a 1440px table and pushed every number so far right that the name-to-number
                handoff became the widest empty run on the board. Under `table-layout: fixed` a
                table wider than the sum of its columns shares the excess out in proportion, so all
                nine grow together and none of them move when the page turns. */}
            <col style={{ width: `${COL.channel}rem` }} />
            <col style={{ width: `${COL.subs}rem` }} />
            <col style={{ width: `${COL.dsubs}rem` }} />
            <col style={{ width: `${COL.growth}rem` }} />
            <col style={{ width: `${COL.dviews}rem` }} />
            <col style={{ width: `${COL.per1k}rem` }} />
            <col style={{ width: `${COL.vids}rem` }} />
          </colgroup>
        }
        // Re-ranking, switching the window and filtering all make this a different question of the
        // same rows, so they all send you back to the top of the new order.
        resetKey={`${mode}|${win}|${niche}|${[...cats].sort().join(",")}`}
        leadingHeader={<th className="pickcol"><span className="sr-only">select to compare</span></th>}
        row={(c, sortKey) => (
          <LeaderRow c={c} mode={mode} win={win} ranked={sortKey === "rank"}
            ownSweepFrom={ownSweepFrom}
            cover={coverage?.[c.channel_id]}
            picked={picked.includes(c.channel_id)} onTogglePicked={() => togglePicked(c.channel_id)} />
        )}
      />
      <CompareBar picked={picked} channels={channels} selfId={selfId} win={win}
        onClear={() => setPicked([])} />
    </>
  )
}

/** The cell's state, short enough not to set the column width on its own.
 *  "building, 364 of 365 days" was the widest string in the table and every one of the 74 rows
 *  paid for it; the fraction alone says the same thing, with the full sentence on demand. */
function stateText(cell: StateCell): string {
  if (cell.state === "building" && cell.have !== undefined && cell.need !== undefined) {
    return `${cell.have}/${cell.need}`
  }
  return deltaText(cell)
}

/**
 * One shape for all four windowed cells.
 *
 * They had drifted into two. Δviews and subs/1k routed non-ok states through `stateText` with
 * `stateExplain` on them; Δsubs and growth called `deltaText`/`pctText` straight and wrapped the
 * result in `<Derived>`. So at 365d eleven rows printed the full "building, 359 of 365 days" into
 * two numeric columns — 258px each, 37% of the table — under a dotted underline and a tooltip
 * quoting a formula that had not run. A state dressed as a computed number is the exact failure
 * this project names.
 *
 * `bounded` belongs on the measured side of that line and was on the wrong one: "< 48" is a real
 * measurement with a real bound, and rendering it in the same grey as "--" made most of a 7d
 * table read as missing data.
 */
function StateNum({ cell, formula, fmt }: {
  cell: StateCell
  /** the Derived formula, for the states that actually computed one */
  formula: string
  fmt: (cell: StateCell) => string
}) {
  if (cell.state === "ok" || cell.state === "bounded") {
    return <Derived formula={formula}>{fmt(cell)}</Derived>
  }
  return <StateText text={stateText(cell)} explain={stateExplain(cell)} />
}

function LeaderRow({ c, mode, win, ranked, ownSweepFrom, cover, picked, onTogglePicked }: {
  c: SlimChannel
  mode: RankMode
  win: WindowKey
  /** false once the reader sorts by another column: # is then a preserved ranking, not the order */
  ranked: boolean
  ownSweepFrom: string | null
  cover?: { videos: number; comments: number | null }
  picked: boolean
  onTogglePicked: () => void
}) {
  const stats = peekStats(c, cover)
  const pickCell = (
    <td className="pickcol">
      <input
        type="checkbox"
        checked={picked}
        onChange={onTogglePicked}
        aria-label={`select ${c.name} to compare`}
      />
    </td>
  )
  if (c.status === "absent") {
    return (
      <tr>
        {pickCell}
        <td className="muted num">--</td>
        <td>
          <Link href={withWindow(`/channels/${c.channel_id}`, win)} className="chcell">
            <AvatarPeek src={c.avatarUrl} name={c.name} handle={c.handle} size={28} />
            <span className="chname" title={c.name}>{c.name}</span>
          </Link>{" "}
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
  // 99% of this series is vidIQ backfill, and every window of 7d or longer currently anchors its
  // oldest endpoint on one. Naming the field but not the tier let a vendor reconstruction render
  // exactly like something we measured, which is the one thing `vendor` exists as a tier to stop.
  const vendorBase =
    ownSweepFrom !== null && delta.from !== undefined && delta.from < ownSweepFrom
      ? `; the ${delta.from} baseline is vidIQ backfill, not our own sweep`
      : ""
  return (
    <tr className={c.is_self ? "youcard" : undefined}>
      {pickCell}
      {/* Greyed once another column is the order, so "73, 21, 72" reads as a ranking carried
          along rather than as broken data. */}
      <td className={ranked ? "num" : "num muted"}>{c.rank[mode][win] ?? "--"}</td>
      <td>
        {/* The peek sits beside the link, not inside it: an <a> may not contain interactive
            content, and while it did, the avatar's pixels belonged to the link, so a tap on a
            phone navigated away instead of opening the card. */}
        <span className="chcell">
          <AvatarPeek src={c.avatarUrl} name={c.name} handle={c.handle} size={28}
            isSelf={c.is_self} stats={stats} />
          <Link href={withWindow(`/channels/${c.channel_id}`, win)} className="chname"
            title={c.name}>
            {c.name}
          </Link>
        </span>
        {c.is_self && (
          <>
            {" ★ "}
            <Chip variant="you">YOU</Chip>
          </>
        )}
      </td>
      <td className="r num">
        {/* Oracle-looking, Derived in fact: subscriber_count is rounded to three significant
            figures at the source and no vendor sells better. */}
        {c.subscriber_count !== null ? (
          <Derived formula={`subscriber_count at the newest snapshot; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}`}>
            {fmtInt(c.subscriber_count)}
          </Derived>
        ) : (
          "--"
        )}
      </td>
      <td className="r num nowrap">
        {/* The rounding width used to sit beside every number as "±100". It is a real disclosure
            and it stays, but inline it gave each row a different width and made a column of
            numbers impossible to scan down. It rides the disclosure now, with the exact figure. */}
        <StateNum cell={delta} fmt={deltaText}
          formula={`subscriber_count newest minus oldest, ${win}; YouTube rounds this channel to ${bucketText(c.subscriber_bucket)}${vendorBase}`} />
      </td>
      <td className="r num nowrap">
        <StateNum cell={growth} fmt={pctText}
          formula={`subscriber delta ÷ subscribers at window start, ${win}${vendorBase}`} />
      </td>
      <td className="r num nowrap">
        {/* A bounded view delta has an `upper` and no `value`, so the compact formatter has to be
            reached only for `ok` — `v.value ?? 0` on a bounded cell prints a confident 0. */}
        <StateNum cell={views}
          fmt={(v) => (v.state === "ok" ? compactSignedAuto(v.value ?? 0) : deltaText(v))}
          formula={`view_count newest minus oldest, ${win}; exact, never rounded${vendorBase}`} />
      </td>
      <td className="r num nowrap">
        <StateNum cell={per1k} fmt={ratioText}
          formula={`subscriber delta ÷ (view delta ÷ 1000), ${win}: subscribers earned per thousand views`} />
      </td>
      <td className="r num">{c.videos_published["30d"] ?? "--"}</td>
    </tr>
  )
}
