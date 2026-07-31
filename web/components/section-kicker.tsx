import type { CSSProperties, ReactNode } from "react"

/**
 * The rule that separates a section's label from its coverage line.
 *
 * Nine sites wrote this three-element shape by hand. The middle element is the point: `.rule` is
 * a flex-grow spacer the CSS relies on structurally, so a kicker written without it does not
 * degrade gracefully, it collapses the cap onto the label. That is a piece of markup nobody
 * should have to remember, which is the whole case for the component — the line count barely
 * moves.
 *
 * `cap` is the right-hand readout: a coverage sentence, a count, a snapshot date. It is optional
 * because three of the nine sites are a label and a rule with nothing to say on the right.
 */
export function SectionKicker({
  label,
  cap,
  style,
}: {
  label: ReactNode
  cap?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="section-kicker" style={style}>
      <span className="kicker">{label}</span>
      <span className="rule" />
      {cap !== undefined && <span className="cap">{cap}</span>}
    </div>
  )
}
