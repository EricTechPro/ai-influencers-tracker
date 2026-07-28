import type { ReactNode } from "react"
import type { Verdict } from "@/lib/types"
import { VERDICT_CLASS, VERDICT_LABEL } from "@/lib/trust"

/** Derived tier: dotted underline, formula on hover. Never render one without
 *  a formula; the prop is mandatory for exactly that reason. */
export function Derived({ formula, children }: { formula: string; children: ReactNode }) {
  return (
    <span className="derived num" title={formula}>
      {children}
    </span>
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
  return <span className={`badge b-filled ${VERDICT_CLASS[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
}

export function Chip({
  variant,
  children,
}: {
  variant?: "warn" | "you" | "rank1"
  children: ReactNode
}) {
  return <span className={variant ? `chip ${variant}` : "chip"}>{children}</span>
}
