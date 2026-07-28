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

/**
 * Card-width rounding for a signed count: exact under 100k, then k, then M.
 *
 * A card is a fixed-width object and the roster's real deltas run to
 * +1,230,000, ten characters that push the hero's own unit label off the
 * card. Rounding here is a layout decision, never a claim: every caller pairs
 * the compact string with the exact one (see capDeltaText), so the precise
 * figure is always one hover away and nothing is quietly lost.
 */
export function compactSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2) + "M"
  if (abs >= 100_000) return sign + Math.round(abs / 1000).toLocaleString("en-US") + "k"
  return sign + fmtInt(abs)
}

/** A rendered figure plus, when the rendering rounded, the exact string it
 *  came from. `exact: null` means the text IS exact, nothing to disclose. */
export interface CappedText {
  text: string
  exact: string | null
}

const PCT_CAP = 10 // fractions at or above this render as a compact multiple

function pctString(fraction: number): string {
  const sign = fraction >= 0 ? "+" : "-"
  const abs = Math.abs(fraction) * 100
  return sign + abs.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
}

function capPct(fraction: number): CappedText {
  if (Math.abs(fraction) < PCT_CAP) return { text: pctString(fraction), exact: null }
  const sign = fraction >= 0 ? "+" : "-"
  return { text: sign + (Math.abs(fraction) * 100 / 1000).toFixed(1) + "k%", exact: pctString(fraction) }
}

/**
 * pctText, capped to something a card can hold. The roster's 365d window
 * reaches +5,480.6%; nine characters is where the hero stops fitting, so past
 * 1000% the number becomes a multiple and the exact percent moves to `exact`.
 * Every non-ok state is passed straight through pctText, so a bounded cell is
 * still "< N%" and a building cell is still never a number.
 */
export function capPctText(cell: StateCell): CappedText {
  if (cell.state === "ok") return capPct(cell.value ?? 0)
  if (cell.state === "bounded") {
    const capped = capPct(cell.upper ?? 0)
    const strip = (s: string) => `< ${s.replace(/^[+-]/, "")}`
    return { text: strip(capped.text), exact: capped.exact && strip(capped.exact) }
  }
  return { text: pctText(cell), exact: null }
}

/** deltaText, capped the same way: exact under 100k, compact above it. */
export function capDeltaText(cell: StateCell): CappedText {
  if (cell.state === "ok") {
    const n = cell.value ?? 0
    const compact = compactSigned(n)
    const exact = signedInt(n)
    return { text: compact, exact: compact === exact ? null : exact }
  }
  if (cell.state === "bounded") {
    const upper = cell.upper ?? 0
    const compact = compactSigned(upper).slice(1)
    const exact = fmtInt(upper)
    return { text: `< ${compact}`, exact: compact === exact ? null : `< ${exact}` }
  }
  return { text: deltaText(cell), exact: null }
}

/**
 * Font multiplier for a hero figure, so the one line that will not fit shrinks
 * instead of wrapping. Capping handles the numbers; this handles the strings
 * capping deliberately leaves long, above all "building, 1 of 90 days", a
 * state that must render as itself and so cannot be shortened.
 */
export function heroScale(text: string): number {
  if (text.length <= 8) return 1
  if (text.length <= 11) return 0.82
  if (text.length <= 16) return 0.6
  return 0.42
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

export const SCORE_FORMULA = "score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness"

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

/**
 * The verdict grid (spec §"The verdict grid") in words rather than in its
 * internal enum. The keys are the pipeline's contract and never change; these
 * are only what a person reads. SCREAMING_SNAKE_CASE told you the name of the
 * cell, not what to do about it, and "ONLY_IF_UNSERVED" in particular reads
 * as a condition with its subject missing.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  MAKE_THIS_NOW: "make this now",
  ONLY_IF_UNSERVED: "crowded · needs an angle",
  TOO_EARLY: "too early",
  SKIP: "skip",
  INSUFFICIENT_DATA: "not enough data",
}

/** The rule behind each verdict, in the two axes that produced it. Rendered as
 *  the badge's tooltip so the label never has to carry the whole definition. */
export const VERDICT_WHY: Record<Verdict, string> = {
  MAKE_THIS_NOW: "High demand, and supply is still open. Nothing is in the way.",
  ONLY_IF_UNSERVED:
    "High demand, but supply is crowded: plenty of creators already cover it. Worth making only if you can serve an angle none of them do.",
  TOO_EARLY: "Supply is open, but demand has not shown up yet. Nobody is asking for this.",
  SKIP: "Low demand and crowded supply. Both axes say no.",
  INSUFFICIENT_DATA:
    "One of the two axes is unknown, so no band was assigned. A missing measurement, not a low one.",
}

export const VERDICT_RANK: Record<Verdict, number> = {
  MAKE_THIS_NOW: 4,
  ONLY_IF_UNSERVED: 3,
  TOO_EARLY: 2,
  SKIP: 1,
  INSUFFICIENT_DATA: 0,
}
