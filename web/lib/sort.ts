// Three-way table ordering. The pipeline decided the states (growth.py
// rank_value: measured 2, bounded 1, unmeasured 0); the web side only
// consumes them. Tiers never flip with sort direction: reversing a plain key
// would put the unmeasured rows first, which is exactly the lie the
// INSUFFICIENT_DATA rule forbids.
import type { StateCell } from "./types"

export type SortDir = 1 | -1

export interface Tiered {
  tier: 0 | 1 | 2
  v: number
}

export type SortValue = string | number | null | undefined | Tiered

export function tiered(cell: StateCell): Tiered {
  if (cell.state === "ok") return { tier: 2, v: cell.value ?? 0 }
  if (cell.state === "bounded") return { tier: 1, v: cell.upper ?? 0 }
  return { tier: 0, v: 0 }
}

function resolve(v: SortValue): { tier: number; v: number | string } {
  if (v === null || v === undefined) return { tier: 0, v: 0 }
  if (typeof v === "number") return Number.isNaN(v) ? { tier: 0, v: 0 } : { tier: 2, v }
  if (typeof v === "string") return { tier: 2, v }
  return v
}

/** Negative when a sorts before b. dir orders only within a tier. */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ra = resolve(a)
  const rb = resolve(b)
  if (ra.tier !== rb.tier) return rb.tier - ra.tier
  if (ra.tier === 0) return 0
  if (ra.v < rb.v) return -dir
  if (ra.v > rb.v) return dir
  return 0
}
