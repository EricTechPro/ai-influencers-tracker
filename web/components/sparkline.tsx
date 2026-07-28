"use client"

import { useState } from "react"
import { fmtDate, fmtInt, signedInt } from "@/lib/trust"
import type { SparkPoint } from "@/lib/growth"

/**
 * Subscriber history for the selected window.
 *
 * A bare polyline is a shape, not a measurement: it says "up and to the right"
 * and refuses to say by how much, because a sparkline auto-scales to its own
 * min and max and so looks identical whether a channel gained 40 subscribers
 * or 40,000. So the line now carries its two endpoints as text, and hovering
 * anywhere on it reads out the actual subscriber count on that day and the
 * change from where the window started.
 *
 * The counts are Oracle values straight from snapshots.json, and the readout
 * shows the one the cursor is nearest, never an interpolation between two
 * days, which would be a number nobody measured.
 */
export function Sparkline({ points, label }: { points: SparkPoint[]; label?: string }) {
  const [hover, setHover] = useState<number | null>(null)

  // Fewer than 2 points is not a trend, and faking a flat line would be a claim.
  if (points.length < 2) return null

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * 100
  const y = (p: number) => 26 - ((p - min) / range) * 22
  const coords = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ")

  const first = points[0].value
  const last = points[points.length - 1].value
  const at = hover === null ? points[points.length - 1] : points[hover]
  const shown = at.value
  const delta = shown - first

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width === 0) return
    const ratio = (e.clientX - box.left) / box.width
    const i = Math.round(ratio * (points.length - 1))
    setHover(Math.min(points.length - 1, Math.max(0, i)))
  }

  return (
    <div className="sparkbox">
      <svg
        className="spark"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Subscribers over ${label ?? "the window"}: ${fmtInt(first)} to ${fmtInt(last)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Fill under the line so a near-flat series still reads as a series
            rather than as a stray rule across the card. */}
        <polygon points={`0,28 ${coords} 100,28`} fill="var(--primary)" opacity="0.07" />
        <polyline
          points={coords}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              y1="0"
              x2={x(hover)}
              y2="28"
              stroke="var(--muted-foreground)"
              strokeWidth="1"
              opacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].value)}
              r="2.5"
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>
      <div className="sparkfoot">
        <span className="num">{fmtInt(first)}</span>
        <span className={hover === null ? "sparkread" : "sparkread on"}>
          <b className="num">{fmtInt(shown)}</b> <span className="num">{signedInt(delta)}</span>{" "}
          <span className="sparkdate">{fmtDate(at.date)}</span>
        </span>
        <span className="num">{fmtInt(last)}</span>
      </div>
    </div>
  )
}
