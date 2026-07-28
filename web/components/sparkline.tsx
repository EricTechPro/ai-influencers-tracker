/** Inline SVG sparkline. Fewer than 2 points renders nothing: a one-day
 *  history is not a trend, and faking a flat line would be a claim. */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 26 - ((p - min) / range) * 22
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden>
      <polyline points={coords} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
    </svg>
  )
}
