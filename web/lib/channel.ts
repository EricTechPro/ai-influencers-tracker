// Pure helpers for the channel page. No fs, no react.
import type { CategoryCounts, CommentCategory, CommentRow } from "./types"

export const CADENCE_FORMULA = "median days between uploads, last 10 uploads"

/** Derived. Median gap in days across the channel's last 10 uploads.
 *  Below two uploads there is no gap to measure: null, never a fake number. */
export function cadenceDays(publishedAts: string[]): number | null {
  const last = [...publishedAts].sort().slice(-10)
  if (last.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < last.length; i++) {
    gaps.push((Date.parse(last[i]) - Date.parse(last[i - 1])) / 86_400_000)
  }
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.round(median * 10) / 10
}

/** The lag column never shows an absolute date. */
export function lagText(lagDays: number): string {
  return lagDays === 0 ? "same day" : `${lagDays}d after`
}

const CATEGORY_LABEL: Record<CommentCategory, string> = {
  video_request: "requests",
  question: "questions",
  correction: "corrections",
  suggestion: "suggestions",
  other: "other",
}

/** Fixed order, positions never move between channels. */
export const CATEGORY_ORDER: CommentCategory[] = [
  "video_request", "question", "correction", "suggestion", "other",
]

export function categoryTabs(
  counts: CategoryCounts,
  total: number,
): { key: "all" | CommentCategory; label: string; count: number }[] {
  return [
    { key: "all" as const, label: "all", count: total },
    ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABEL[key], count: counts[key] })),
  ]
}

export function filterByCategory(
  rows: CommentRow[],
  key: "all" | CommentCategory,
): CommentRow[] {
  if (key === "all") return rows
  return rows.filter((r) => r.category?.key === key)
}

export function sortComments(rows: CommentRow[], by: "likes" | "replies"): CommentRow[] {
  const field = by === "likes" ? "like_count" : "reply_count"
  return [...rows].sort((a, b) => b[field] - a[field] || a.comment_id.localeCompare(b.comment_id))
}
