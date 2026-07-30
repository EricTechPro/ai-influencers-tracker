"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import type { ReactNode } from "react"
import {
  gap, okValue, outputStats, splitByFormat, videosInWindow,
  type GapValue, type VideoFormat,
} from "@/lib/compare"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, deltaText, fmtInt, pctText } from "@/lib/trust"
import { WINDOWS, type StateCell, type VideoRow, type WindowKey } from "@/lib/types"
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
  subscriber_delta: Record<WindowKey, StateCell>
  subscriber_growth_rate: Record<WindowKey, StateCell>
  view_delta: Record<string, StateCell>
  subs_per_1k_views: Record<WindowKey, StateCell>
  /** every registered video for this channel, already sliced server-side */
  videos: VideoRow[]
}

const FORMATS: { key: VideoFormat; label: string }[] = [
  { key: "all", label: "all" },
  { key: "long", label: "long" },
  { key: "short", label: "shorts" },
]

interface Row {
  label: ReactNode
  them: ReactNode
  you: ReactNode
  gap: GapValue
  /** the two dates each side's window resolved to; renders as a collapsible row */
  detail?: ReactNode
  /** both sides' raw non-negative figures, for the proportional bar under the
   *  two number cells. Undefined whenever the pair isn't one comparable
   *  quantity — either side missing, negative, or (`long vs shorts`) two
   *  counts rather than one. */
  share?: { them: number; you: number }
  /** every window's cell for this metric, threaded straight from the bundle
   *  so the six-window expansion strip reads the exact source the visible
   *  cell resolved from — never a second pass over the row for a different
   *  width. */
  windowed?: {
    them: Record<string, StateCell>
    you: Record<string, StateCell>
    themLabel: string
    youLabel: string
    fmt: (cell: StateCell) => string
  }
}

/** Share of a two-sided pair, for the bar under a row's number cells. Same
 *  non-negative guard `gap()` applies before it will compare two values —
 *  this only turns that already-validated pair into a proportion, never a
 *  second opinion on which side is ahead. */
function shareOf(them: number | null, you: number | null): { them: number; you: number } | undefined {
  if (them === null || you === null) return undefined
  if (them < 0 || you < 0) return undefined
  return { them, you }
}

/** One side's percentage of the pair. Split even when both sides are zero —
 *  there is no ratio to draw, but zero-and-zero is still a real, comparable
 *  measurement, unlike a missing one. */
function sharePct(value: number, share: { them: number; you: number }): number {
  const total = share.them + share.you
  return total > 0 ? (value / total) * 100 : 50
}

/** Decoration under an already-printed number: aria-hidden, and the width is
 *  the only thing it says that the number beside it doesn't already say. */
function ShareBar({ pct }: { pct: number }) {
  return (
    <span className="share" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </span>
  )
}

/** subs_per_1k_views' own "ok" formatting (one decimal, no sign — it's a
 *  ratio, not a delta), but every non-ok state falls through to deltaText.
 *  deltaText and pctText render identical text for building/blocked/etc (both
 *  call the same state helpers) — reusing deltaText's fallback here means
 *  this row's states are worded exactly like every other windowed row's,
 *  never collapsed to a bare "--" the way the table's own fmtCell used to. */
function ratioText(cell: StateCell): string {
  return cell.state === "ok" ? (cell.value ?? 0).toFixed(1) : deltaText(cell)
}

/** A plain measured count, or the unmeasured glyph — the one guard repeated
 *  at every non-windowed number cell on this page (subscribers, views,
 *  typical views per video). */
function numOrDash(v: number | null): string {
  return v === null ? "--" : fmtInt(v)
}

/** The metric at all six windows, so a lead reads as widening or closing
 *  instead of one snapshot. Every window renders, including the ones with no
 *  number: `fmt` is the same deltaText/pctText/ratioText helper the visible
 *  cell used, so a building or blocked window shows its state here exactly as
 *  it does in the table. */
function WindowStrip({ them, you, themLabel, youLabel, fmt }: {
  them: Record<string, StateCell>
  you: Record<string, StateCell>
  themLabel: string
  youLabel: string
  fmt: (cell: StateCell) => string
}) {
  return (
    <div className="windowstrip">
      {WINDOWS.map((w) => (
        <span key={w} className="windowstrip-cell">
          <b>{w}</b> {themLabel} {fmt(them[w])} · {youLabel} {fmt(you[w])}
        </span>
      ))}
    </div>
  )
}

/** The two dates a window actually resolved to, for the row a reader expands
 *  to check. `from`/`to` are absent on unresolved windows (building, blocked).
 *  Labels name the actual channel on each side, falling back to "you" only
 *  for the side that really is the self channel — /compare can pit any two
 *  channels against each other, and neither may be you. */
function windowDates(
  themLabel: string, youLabel: string,
  a: StateCell | undefined, b: StateCell | undefined,
): ReactNode {
  const span = (c: StateCell | undefined) =>
    c?.from && c?.to ? `${c.from} → ${c.to}` : "no resolved dates"
  return <span className="mono10">{themLabel} {span(a)} · {youLabel} {span(b)}</span>
}

/** "long" never pluralises here (matches the FORMATS tab label above); "short"
 *  does, including at zero, because zero Shorts is a real measurement. */
function formatMix(long: number, short: number): string {
  return `${long} long · ${short} short${short === 1 ? "" : "s"}`
}

export function CompareTable({
  them, you, initialWindow, generatedAt,
}: { them: CompareSide; you: CompareSide; initialWindow: WindowKey; generatedAt: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [win, setWin] = useState<WindowKey>(initialWindow)
  const onWindow = useCallback(
    (w: WindowKey) => {
      setWin(w)
      // /compare carries `a` and `b` alongside `w` — withWindow(pathname, w) would
      // drop them since usePathname() has no query string. Preserve everything
      // already on the URL and override only `w`.
      const next = new URLSearchParams(searchParams.toString())
      next.set("w", w)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )
  const [format, setFormat] = useState<VideoFormat>("all")

  // /compare can pit any two channels against each other, so "you" is only
  // true for the side that actually is the self channel (matches the ★ and
  // "you round"/"${name} rounds" pattern used elsewhere on this page).
  const themLabel = them.name
  const youLabel = you.is_self ? "you" : you.name

  // The server's clock, not the browser's — see videosInWindow's doc comment.
  const now = new Date(generatedAt)
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
      them: <>{numOrDash(them.subscriber_count)}{" "}
        <Chip>{bucketText(them.subscriber_bucket)}</Chip></>,
      you: <>{numOrDash(you.subscriber_count)}{" "}
        <Chip>{bucketText(you.subscriber_bucket)}</Chip></>,
      gap: gap(them.subscriber_count, you.subscriber_count),
      share: shareOf(them.subscriber_count, you.subscriber_count),
    },
    {
      label: <Derived formula="Subscribers at the end of the window minus subscribers at the start.">subs gained</Derived>,
      them: deltaText(them.subscriber_delta[win]),
      you: deltaText(you.subscriber_delta[win]),
      gap: gap(okValue(them.subscriber_delta[win]), okValue(you.subscriber_delta[win])),
      share: shareOf(okValue(them.subscriber_delta[win]), okValue(you.subscriber_delta[win])),
      detail: windowDates(themLabel, youLabel, them.subscriber_delta[win], you.subscriber_delta[win]),
      windowed: { them: them.subscriber_delta, you: you.subscriber_delta, themLabel, youLabel, fmt: deltaText },
    },
    {
      label: <Derived formula="Subscribers gained, as a share of what the channel had when the window started.">growth rate</Derived>,
      them: pctText(them.subscriber_growth_rate[win]),
      you: pctText(you.subscriber_growth_rate[win]),
      gap: gap(okValue(them.subscriber_growth_rate[win]), okValue(you.subscriber_growth_rate[win])),
      share: shareOf(okValue(them.subscriber_growth_rate[win]), okValue(you.subscriber_growth_rate[win])),
      detail: windowDates(themLabel, youLabel, them.subscriber_growth_rate[win], you.subscriber_growth_rate[win]),
      windowed: { them: them.subscriber_growth_rate, you: you.subscriber_growth_rate, themLabel, youLabel, fmt: pctText },
    },
  ]

  const reach: Row[] = [
    {
      label: "views",
      them: numOrDash(them.view_count),
      you: numOrDash(you.view_count),
      gap: gap(them.view_count, you.view_count),
      share: shareOf(them.view_count, you.view_count),
    },
    {
      label: <Derived formula="Total views at the end of the window minus total views at the start. Exact, never rounded.">views gained</Derived>,
      them: deltaText(them.view_delta[win]),
      you: deltaText(you.view_delta[win]),
      gap: gap(okValue(them.view_delta[win]), okValue(you.view_delta[win])),
      share: shareOf(okValue(them.view_delta[win]), okValue(you.view_delta[win])),
      detail: windowDates(themLabel, youLabel, them.view_delta[win], you.view_delta[win]),
      windowed: { them: them.view_delta, you: you.view_delta, themLabel, youLabel, fmt: deltaText },
    },
    {
      label: <Derived formula="How many subscribers each thousand views brought in. Higher means the audience converts better.">subs per 1,000 views</Derived>,
      them: fmtCell(them.subs_per_1k_views[win]),
      you: fmtCell(you.subs_per_1k_views[win]),
      gap: gap(okValue(them.subs_per_1k_views[win]), okValue(you.subs_per_1k_views[win])),
      share: shareOf(okValue(them.subs_per_1k_views[win]), okValue(you.subs_per_1k_views[win])),
      windowed: { them: them.subs_per_1k_views, you: you.subs_per_1k_views, themLabel, youLabel, fmt: ratioText },
    },
  ]

  const output: Row[] = [
    {
      label: <Derived formula="Videos posted inside the window. Their view counts are lifetime totals, not views earned during the window.">videos published</Derived>,
      them: t.stats.videos,
      you: y.stats.videos,
      gap: gap(t.stats.videos, y.stats.videos),
      share: shareOf(t.stats.videos, y.stats.videos),
    },
    // long vs shorts gets no share: it's two counts (long, short), not one
    // comparable quantity, so there is no single proportion to draw a bar of.
    ...(format === "all" ? [{
      label: <Derived formula="How those videos split between long-form and Shorts.">long vs shorts</Derived>,
      them: formatMix(t.mix.long, t.mix.short),
      you: formatMix(y.mix.long, y.mix.short),
      gap: { kind: "unknown", magnitude: null, direction: null, qualifier: null } as GapValue,
    }] : []),
    {
      label: <Derived formula="The middle value: half these videos did better, half did worse. Lifetime views, not views earned during the window.">typical views per video</Derived>,
      them: numOrDash(t.stats.medianViews),
      you: numOrDash(y.stats.medianViews),
      gap: gap(t.stats.medianViews, y.stats.medianViews),
      share: shareOf(t.stats.medianViews, y.stats.medianViews),
    },
    {
      label: <Derived formula={CADENCE_FORMULA}>days between uploads</Derived>,
      them: t.cadence === null ? "--" : `${t.cadence}d`,
      you: y.cadence === null ? "--" : `${y.cadence}d`,
      gap: gap(t.cadence, y.cadence, { lowerIsBetter: true, qualifier: "more often" }),
      share: shareOf(t.cadence, y.cadence),
    },
  ]

  return (
    <>
      <div className="section-kicker" style={{ gap: 12 }}>
        <WindowTabs value={win} onChange={onWindow} />
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
  const [open, setOpen] = useState(false)
  const expandable = Boolean(row.detail || row.windowed)
  // Who's ahead comes straight from the row's own gap, never recomputed here:
  // "ahead" means the you column leads, "behind" means them does, and
  // even/unknown (the ones GapCell also renders with no glyph) mark neither.
  const lead = row.gap.direction === "ahead" ? "you" : row.gap.direction === "behind" ? "them" : null
  return (
    <>
      <tr>
        <td>
          {expandable ? (
            <button type="button" className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>
              {row.label}
            </button>
          ) : row.label}
        </td>
        <td className={lead === "them" ? "r num lead" : "r num"}>
          {row.them}
          {row.share && <ShareBar pct={sharePct(row.share.them, row.share)} />}
        </td>
        <td className={lead === "you" ? "r num lead" : "r num"}>
          {row.you}
          {row.share && <ShareBar pct={sharePct(row.share.you, row.share)} />}
        </td>
        <td className="r num"><GapCell value={row.gap} /></td>
      </tr>
      {expandable && open && (
        <tr><td colSpan={4} className="sub mono10">
          {row.detail}
          {row.windowed && <WindowStrip {...row.windowed} />}
        </td></tr>
      )}
    </>
  )
}

/** The collapsed subs/1k cell, in the same words as the expanded strip below
 *  it. This used to route through `okValue`, which returns null for every
 *  non-ok state by design (gap arithmetic must never invent a number from a
 *  bound) — reused here it collapsed a `bounded` or `building` cell to the
 *  bare "--" reserved for unmeasured, while the same row's expanded strip
 *  (which already calls ratioText) printed "< 47" or "building, 3 of 7 days"
 *  one click away. Same cell, same window, two different claims. */
function fmtCell(cell: StateCell | undefined): string {
  return cell ? ratioText(cell) : "--"
}
