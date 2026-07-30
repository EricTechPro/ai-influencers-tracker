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
