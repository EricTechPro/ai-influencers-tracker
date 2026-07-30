"use client"

import { useState } from "react"
import type { ReactNode } from "react"
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
}

/** The two dates a window actually resolved to, for the row a reader expands
 *  to check. `from`/`to` are absent on unresolved windows (building, blocked). */
function windowDates(a: StateCell | undefined, b: StateCell | undefined): ReactNode {
  const span = (c: StateCell | undefined) =>
    c?.from && c?.to ? `${c.from} → ${c.to}` : "no resolved dates"
  return <span className="mono10">them {span(a)} · you {span(b)}</span>
}

/** "long" never pluralises here (matches the FORMATS tab label above); "short"
 *  does, including at zero, because zero Shorts is a real measurement. */
function formatMix(long: number, short: number): string {
  return `${long} long · ${short} short${short === 1 ? "" : "s"}`
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
      label: <Derived formula="Subscribers at the end of the window minus subscribers at the start.">subs gained</Derived>,
      them: deltaText(them.subscriber_delta[win]),
      you: deltaText(you.subscriber_delta[win]),
      gap: gap(okValue(them.subscriber_delta[win]), okValue(you.subscriber_delta[win])),
      detail: windowDates(them.subscriber_delta[win], you.subscriber_delta[win]),
    },
    {
      label: <Derived formula="Subscribers gained, as a share of what the channel had when the window started.">growth rate</Derived>,
      them: pctText(them.subscriber_growth_rate[win]),
      you: pctText(you.subscriber_growth_rate[win]),
      gap: gap(okValue(them.subscriber_growth_rate[win]), okValue(you.subscriber_growth_rate[win])),
      detail: windowDates(them.subscriber_growth_rate[win], you.subscriber_growth_rate[win]),
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
      label: <Derived formula="Total views at the end of the window minus total views at the start. Exact, never rounded.">views gained</Derived>,
      them: deltaText(them.view_delta[win]),
      you: deltaText(you.view_delta[win]),
      gap: gap(okValue(them.view_delta[win]), okValue(you.view_delta[win])),
      detail: windowDates(them.view_delta[win], you.view_delta[win]),
    },
    {
      label: <Derived formula="How many subscribers each thousand views brought in. Higher means the audience converts better.">subs per 1,000 views</Derived>,
      them: fmtCell(them.subs_per_1k_views[win]),
      you: fmtCell(you.subs_per_1k_views[win]),
      gap: gap(okValue(them.subs_per_1k_views[win]), okValue(you.subs_per_1k_views[win])),
    },
  ]

  const output: Row[] = [
    {
      label: <Derived formula="Videos posted inside the window. Their view counts are lifetime totals, not views earned during the window.">videos published</Derived>,
      them: t.stats.videos,
      you: y.stats.videos,
      gap: gap(t.stats.videos, y.stats.videos),
    },
    ...(format === "all" ? [{
      label: <Derived formula="How those videos split between long-form and Shorts.">long vs shorts</Derived>,
      them: formatMix(t.mix.long, t.mix.short),
      you: formatMix(y.mix.long, y.mix.short),
      gap: { kind: "unknown", magnitude: null, direction: null, qualifier: null } as GapValue,
    }] : []),
    {
      label: <Derived formula="The middle value: half these videos did better, half did worse. Lifetime views, not views earned during the window.">typical views per video</Derived>,
      them: t.stats.medianViews === null ? "--" : fmtInt(t.stats.medianViews),
      you: y.stats.medianViews === null ? "--" : fmtInt(y.stats.medianViews),
      gap: gap(t.stats.medianViews, y.stats.medianViews),
    },
    {
      label: <Derived formula={CADENCE_FORMULA}>days between uploads</Derived>,
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
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr>
        <td>
          {row.detail ? (
            <button type="button" className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>
              {row.label}
            </button>
          ) : row.label}
        </td>
        <td className="r num">{row.them}</td>
        <td className="r num">{row.you}</td>
        <td className="r num"><GapCell value={row.gap} /></td>
      </tr>
      {row.detail && open && (
        <tr><td colSpan={4} className="sub mono10">{row.detail}</td></tr>
      )}
    </>
  )
}

function fmtCell(cell: StateCell | undefined): string {
  const v = okValue(cell)
  return v === null ? "--" : v.toFixed(1)
}
