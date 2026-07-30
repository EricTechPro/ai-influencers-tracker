"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { SlimChannel } from "@/lib/growth"
import type { WindowKey } from "@/lib/types"
import { withWindow } from "@/lib/window"
import { Avatar } from "./avatar"

/** null means there is nothing to compare yet, so the bar stays hidden rather
 *  than rendering a link that goes nowhere. */
export function compareHref(picked: string[], selfId: string, w: WindowKey): string | null {
  if (picked.length === 0) return null
  const [a, b] = picked.length >= 2 ? picked : [picked[0], selfId]
  // An empty id (selfId not yet known) is missing data, not a valid side —
  // a blank query param would be a dead link just like the a === b case.
  if (a === b || a === "" || b === "") return null
  return withWindow(`/compare?a=${a}&b=${b}`, w)
}

/**
 * The leaderboard's picks bar. Ticking one row offers it against you; ticking
 * a second swaps you out for the second pick. Fixed to the bottom so it stays
 * on screen while you keep browsing the table — `.page` already carries
 * bottom padding for exactly this, so it never covers the last row.
 *
 * `.breakout` (the leaderboard's wide-section wrapper) uses `transform:
 * translateX(-50%)` to centre itself outside the reading measure, and a
 * transformed ancestor becomes the containing block for any `position:
 * fixed` descendant per the CSS spec — so an in-place fixed bar here would
 * pin to the bottom of that section, not the viewport, landing on top of
 * the pager instead of below it. Portalling to `document.body` (which
 * carries no transform) sidesteps that. The portal only mounts client-side,
 * after hydration, since `document` does not exist during the server render.
 */
export function CompareBar({
  picked,
  channels,
  selfId,
  win,
  onClear,
}: {
  picked: string[]
  channels: SlimChannel[]
  selfId: string
  win: WindowKey
  onClear: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const href = compareHref(picked, selfId, win)
  if (href === null || !mounted) return null

  const byId = new Map(channels.map((c) => [c.channel_id, c]))
  const first = byId.get(picked[0])
  const second = picked.length >= 2 ? byId.get(picked[1]) : byId.get(selfId)

  return createPortal(
    <div id="picks">
      <span className="lbl">compare</span>
      {first ? (
        <span className="pick">
          <Avatar src={first.avatarUrl} name={first.name} size={18} isSelf={first.is_self} />
          {" "}
          {first.name}
        </span>
      ) : (
        <span className="pending">pick a channel</span>
      )}
      <span className="mono10">vs</span>
      {second ? (
        <span className="pick">
          <Avatar src={second.avatarUrl} name={second.name} size={18} isSelf={second.is_self} />
          {" "}
          {second.is_self ? "you" : second.name}
        </span>
      ) : (
        <span className="pending">you</span>
      )}
      <Link href={href} className="btn primary">compare →</Link>
      <button type="button" className="btn" onClick={onClear}>clear</button>
    </div>,
    document.body
  )
}
