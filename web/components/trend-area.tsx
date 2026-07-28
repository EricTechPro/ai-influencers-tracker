import type { WeekPoint } from "@/lib/rollup"

/** Small SVG area chart for the parent rollup. Empty data renders nothing. */
export function TrendArea({ points }: { points: WeekPoint[] }) {
  if (points.length < 2) return null
  const max = Math.max(...points.map((p) => p.count), 1)
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100
    const y = 38 - (p.count / max) * 32
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "80px" }}
      aria-hidden
    >
      <polygon
        points={`0,40 ${coords.join(" ")} 100,40`}
        fill="color-mix(in srgb, var(--primary) 12%, transparent)"
      />
      <polyline points={coords.join(" ")} fill="none" stroke="var(--primary)" strokeWidth="1" />
    </svg>
  )
}
