import type { ReactNode } from "react"
import type { Verdict } from "@/lib/types"
import { VERDICT_CLASS, VERDICT_LABEL, VERDICT_WHY } from "@/lib/trust"
import { Tip } from "./tip"

/** Derived tier: dotted underline, formula on demand. Never render one without a formula; the
 *  prop is mandatory for exactly that reason.
 *
 *  The formula used to ride a `title`, which meant it did not exist on a phone and did not exist
 *  for a keyboard. A tier whose whole definition is "shows its formula" cannot have a disclosure
 *  that only a mouse can reach, so the trigger is a real button now. */
export function Derived({ formula, children }: { formula: string; children: ReactNode }) {
  return (
    <Tip text={formula} className="derived num">
      {children}
    </Tip>
  )
}

/** A cell that stopped carrying a number, with the sentence saying why.
 *  Styled as a state rather than as a measurement — italic, non-tabular — because a state wearing
 *  the face of a number is the failure mode this project is built to avoid. `explain` is optional
 *  only because a few states genuinely have nothing to add beyond the text itself. */
export function StateText({ text, explain }: { text: string; explain?: string }) {
  if (!explain) return <span className="statecell muted">{text}</span>
  return (
    <Tip text={explain} className="statecell muted">
      {text}
    </Tip>
  )
}

/** Inference tier: violet tint plus the source it came from, always adjacent. */
export function Inference({ source, children }: { source: string; children: ReactNode }) {
  return (
    <span className="inference">
      {children} <span className="src-chip">{source}</span>
    </span>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`badge b-filled ${VERDICT_CLASS[verdict]}`} title={VERDICT_WHY[verdict]}>
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

export function Chip({
  variant,
  title,
  children,
}: {
  variant?: "warn" | "you" | "rank1"
  /** why this state, for the chips that name one. Omit on purely decorative chips. */
  title?: string
  children: ReactNode
}) {
  return (
    <span className={variant ? `chip ${variant}` : "chip"} title={title}>
      {children}
    </span>
  )
}
