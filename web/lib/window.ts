// The window lives in the URL as `w` and follows you across routes. Three pages
// held it in their own useState, so picking 7d on the leaderboard and clicking
// into a comparison silently reset you to 90d.
import type { WindowKey } from "./types"
import { WINDOWS } from "./types"

export const DEFAULT_WINDOW: WindowKey = "90d"

export function parseWindow(
  raw: string | undefined,
  fallback: WindowKey = DEFAULT_WINDOW,
): WindowKey {
  return WINDOWS.includes(raw as WindowKey) ? (raw as WindowKey) : fallback
}

/** An internal href with the current window carried onto it. */
export function withWindow(href: string, w: WindowKey): string {
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set("w", w)
  return `${path}?${params.toString()}`
}
