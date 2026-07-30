"use client"

import { useMemo, useState } from "react"
import { windowDays } from "@/lib/compare"
import { deltaText, fmtInt, pctText } from "@/lib/trust"
import { BuildingCallout } from "@/components/building-callout"
import type { SnapshotDay, StateCell, WindowKey } from "@/lib/types"

type Metric = "subscribers" | "views"

export function ChannelGrowth({
  series,
  delta,
  rate,
  bucket,
  win,
}: {
  series: SnapshotDay[]
  delta: Record<string, StateCell>
  rate: Record<string, StateCell>
  bucket: number | null
  /** the shared window (spec's six), owned by the page's own searchParams —
   *  this chart used to pick its own 30/90/365 and drifted from every other
   *  page's window control. */
  win: WindowKey
}) {
  const [metric, setMetric] = useState<Metric>("subscribers")
  const days = windowDays(win)

  const points = useMemo(() => {
    const cutoff = Date.parse(series.at(-1)?.date ?? "") - days * 86_400_000
    return series
      .filter((d) => d.status === "ok" && Date.parse(d.date) >= cutoff)
      .map((d) => ({
        date: d.date,
        value: metric === "subscribers" ? d.subscriber_count : d.view_count,
      }))
      .filter((p): p is { date: string; value: number } => p.value !== null)
  }, [series, metric, days])

  const cell = metric === "subscribers" ? delta[win] : undefined

  return (
    <div className="card pad">
      <div className="controls" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="tabs">
          {(["subscribers", "views"] as const).map((m) => (
            <button key={m} className={metric === m ? "on" : undefined}
              onClick={() => setMetric(m)}>{m}</button>
          ))}
        </span>
      </div>
      {points.length < 2 ? (
        <div style={{ marginTop: 10 }}>
          <BuildingCallout state={{ kind: "building", have: points.length, need: days }} />
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
                over {win}
                {bucket ? <> · bucket {fmtInt(bucket)}</> : null}
                {rate[win] ? <> · {pctText(rate[win])}</> : null}
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
    <>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none"
        style={{ width: "100%", height: 110, display: "block" }} aria-hidden>
        <polygon points={`4,40 ${coords} 96,40`}
          fill="color-mix(in srgb, var(--primary) 8%, transparent)" />
        <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1"
          vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The axis labels sit in HTML, not in the SVG. preserveAspectRatio="none"
          is what lets the plot fill the card, and it scales x roughly 4x more
          than y, which stretches any glyph inside it into a smear.
          Each end carries its value as well as its date: the line auto-scales to
          its own min and max, so without them it shows the direction of the
          change while refusing to say how big it was. */}
      <div className="mono10" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{points[0].date} · <span className="num">{fmtInt(points[0].value)}</span></span>
        <span>
          {points[points.length - 1].date} ·{" "}
          <span className="num">{fmtInt(points[points.length - 1].value)}</span>
        </span>
      </div>
    </>
  )
}
