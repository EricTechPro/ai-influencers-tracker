import type { GapValue } from "@/lib/compare"

/** The gap column, always relative. Signed numbers belong in the two channel
 *  columns, where the sign is the meaning; here it would be redundant with the
 *  glyph and the colour. The glyph is what keeps the cell readable without
 *  hue, so it is never dropped for being decorative. */
export function GapCell({ value }: { value: GapValue }) {
  if (value.kind === "unknown") return <span className="muted">--</span>

  const glyph = value.direction === "ahead" ? "▲" : value.direction === "behind" ? "▼" : ""
  const cls =
    value.direction === "ahead" ? "gap-ahead" : value.direction === "behind" ? "gap-behind" : "gap-even"

  const body =
    value.kind === "even" ? "≈ even"
      : value.kind === "only-you" ? "you only"
        : value.kind === "multiple" ? `${(value.magnitude ?? 0).toFixed(1).replace(/\.0$/, "")}×`
          : `${Math.round((value.magnitude ?? 0) * 100)}%`

  const strong = value.kind === "multiple" && (value.magnitude ?? 0) >= 3

  return (
    <span className={cls} style={strong ? { fontWeight: 600 } : undefined}>
      {glyph && <span aria-hidden="true">{glyph} </span>}
      {value.direction && <span className="sr-only">{value.direction} </span>}
      {body}
      {value.qualifier ? ` ${value.qualifier}` : ""}
    </span>
  )
}
