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
