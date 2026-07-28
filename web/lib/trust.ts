// The honest-state rendering rules from spec section 7 and CONTEXT.md, as pure
// functions. Bounded never a bare number; building never a number at all;
// unmeasured is always the two-character "--"; a partial score always names
// its denominator.
import type { ScoreBlock, StateCell, Verdict } from "./types"

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

export function signedInt(n: number): string {
  return (n >= 0 ? "+" : "-") + fmtInt(Math.abs(n))
}

export function signedPct(fraction: number): string {
  return (fraction >= 0 ? "+" : "-") + (Math.abs(fraction) * 100).toFixed(1) + "%"
}

/** Wireframe view-delta format: +3.1M, +0.02M. */
export function compactM(n: number): string {
  const m = Math.abs(n) / 1_000_000
  const digits = m >= 0.1 ? 1 : 2
  return (n >= 0 ? "+" : "-") + m.toFixed(digits) + "M"
}

export function bucketText(width: number | null): string {
  return width === null ? "" : "±" + fmtInt(width)
}

function buildingText(cell: StateCell): string {
  // subs_per_1k_views building cells carry no window bookkeeping; the state
  // still renders as itself, never as a number and never as fake bookkeeping.
  return cell.have !== undefined && cell.need !== undefined
    ? `building, ${cell.have} of ${cell.need} days`
    : "building"
}

export function deltaText(cell: StateCell): string {
  if (cell.state === "ok") return signedInt(cell.value ?? 0)
  if (cell.state === "bounded") return `< ${fmtInt(cell.upper ?? 0)}`
  if (cell.state === "building") return buildingText(cell)
  return "--"
}

export function pctText(cell: StateCell): string {
  if (cell.state === "ok") return signedPct(cell.value ?? 0)
  if (cell.state === "bounded") return `< ${((cell.upper ?? 0) * 100).toFixed(1)}%`
  if (cell.state === "building") return buildingText(cell)
  return "--"
}

export function scoreText(score: ScoreBlock): string {
  if (score.value === null || score.out_of === null) return "--"
  const v = score.value.toFixed(1)
  return score.out_of === 100 ? v : `${v} / ${score.out_of}`
}

export function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "--"
}

export function agoText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never"
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
  return `${days}d`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? "?"
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

export const VERDICT_CLASS: Record<Verdict, string> = {
  MAKE_THIS_NOW: "v-make",
  ONLY_IF_UNSERVED: "v-unserved",
  TOO_EARLY: "v-early",
  SKIP: "v-crowded",
  INSUFFICIENT_DATA: "v-none",
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  MAKE_THIS_NOW: "MAKE_THIS_NOW",
  ONLY_IF_UNSERVED: "ONLY_IF_UNSERVED",
  TOO_EARLY: "TOO_EARLY",
  SKIP: "SKIP",
  INSUFFICIENT_DATA: "INSUFFICIENT",
}

export const VERDICT_RANK: Record<Verdict, number> = {
  MAKE_THIS_NOW: 4,
  ONLY_IF_UNSERVED: 3,
  TOO_EARLY: 2,
  SKIP: 1,
  INSUFFICIENT_DATA: 0,
}
