/**
 * A segmented gauge with the threshold that classifies it marked on the bar.
 *
 * Bands like HIGH and CROWDED are the output of a comparison against a number
 * in config/thresholds.json, and a badge that only prints the winning side of
 * that comparison asks you to take the word on faith. The notch is that number
 * drawn in place: you can see how far past "crowded" a topic sits, not just
 * that it cleared the line.
 *
 * Segments rather than a smooth fill because the surrounding page is a
 * monospace research console — a gauge here should read like a meter in a
 * terminal, and discrete blocks also stop a 1px difference from looking like a
 * meaningful one. The exact figure always renders beside it; the bar is for
 * comparing rows at a glance, never for reading a value off.
 */
export function Meter({
  value,
  max,
  threshold,
  tone = "neutral",
  segments = 14,
  label,
}: {
  value: number
  /** Fixed reference so bars stay comparable between rows and across filters.
   *  A value past it fills the bar and is flagged, never silently clipped. */
  max: number
  /** The config number that decides this row's band, drawn as a notch. */
  threshold?: number
  tone?: "neutral" | "hot" | "cool" | "warn"
  segments?: number
  label?: string
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const over = value > max
  const lit = Math.round(ratio * segments)
  const notch = threshold !== undefined && max > 0 ? Math.min(1, threshold / max) : null

  return (
    <span className={`meter tone-${tone}`} title={label} aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < lit ? "seg on" : "seg"} />
      ))}
      {notch !== null && (
        <span className="notch" style={{ left: `${(notch * 100).toFixed(2)}%` }} />
      )}
      {over && <span className="over">▸</span>}
    </span>
  )
}
