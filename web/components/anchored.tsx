"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

/**
 * One placement engine for every panel that hangs off something in a table.
 *
 * It exists because the obvious implementation is a trap this project already fell into. A hidden
 * `position: absolute` panel is still laid out, and `.tblwrap` is `overflow-x: auto` under 90rem,
 * which the spec turns into `overflow-y: auto` on the other axis too. Ten hidden avatar cards
 * below the last row therefore gave the leaderboard a scrollport 121px taller than its own
 * content: an empty band under row 10, a scrollbar with nothing in it, and rows sliding under a
 * sticky header that was suddenly sticking to the wrapper instead of the page.
 *
 * Every panel built on this hook mounts only while it is open, in a portal on `document.body`, at
 * fixed viewport coordinates. Nothing it does can reach an ancestor's overflow, and it is never
 * clipped at the table's edge. That matters more now than it did for one avatar card: the
 * Derived-tier disclosures put a panel on roughly forty cells per page.
 */
export type Placement = "beside" | "below"

export function useAnchoredPanel<A extends HTMLElement, P extends HTMLElement>(
  place: Placement
) {
  const anchor = useRef<A>(null)
  const panel = useRef<P>(null)
  // The anchor's box at the moment it opened, and the open flag, in one piece of state: the panel
  // is placed against a rectangle rather than against a live element, so a re-render cannot move
  // it out from under the cursor.
  const [box, setBox] = useState<DOMRect | null>(null)

  const open = useCallback(() => {
    if (anchor.current) setBox(anchor.current.getBoundingClientRect())
  }, [])
  const close = useCallback(() => setBox(null), [])

  useLayoutEffect(() => {
    const el = panel.current
    if (!el || !box) return
    // offsetWidth/offsetHeight, not getBoundingClientRect: the panel is mid-way through its
    // scale(0.96) entry animation at this point, and a measured box 4% short clamps it past the
    // edge of the window on the last row of a table.
    const w = el.offsetWidth
    const h = el.offsetHeight
    const pad = 8
    const gap = place === "beside" ? 12 : 8
    if (place === "beside") {
      // Beside the anchor, on the side where there is room. Above-placement clipped straight off
      // the viewport on the first row of any table, which is the row people hover first.
      const toRight = box.right + gap + w <= window.innerWidth - pad
      const top = clamp(box.top + box.height / 2 - h / 2, pad, window.innerHeight - h - pad)
      el.style.left = `${clamp(toRight ? box.right + gap : box.left - gap - w, pad, Math.max(pad, window.innerWidth - w - pad))}px`
      el.style.top = `${top}px`
      // The pointer follows the anchor rather than the panel, so a clamped panel still points at
      // the row it belongs to.
      el.style.setProperty("--arrow-at", `${box.top + box.height / 2 - top}px`)
      el.dataset.side = toRight ? "right" : "left"
    } else {
      const below = box.bottom + gap + h <= window.innerHeight - pad
      const left = clamp(box.left + box.width / 2 - w / 2, pad, Math.max(pad, window.innerWidth - w - pad))
      el.style.left = `${left}px`
      el.style.top = `${clamp(below ? box.bottom + gap : box.top - gap - h, pad, Math.max(pad, window.innerHeight - h - pad))}px`
      el.style.setProperty("--arrow-at", `${box.left + box.width / 2 - left}px`)
      el.dataset.side = below ? "below" : "above"
    }
    el.style.visibility = "visible"
  }, [box, place])

  // Fixed coordinates go stale the moment anything scrolls, and there is no placement that
  // survives it, so the panel closes instead of drifting. Capture, because the scroll that matters
  // is usually the table's own rather than the page's.
  useLayoutEffect(() => {
    if (!box) return
    const bail = () => setBox(null)
    window.addEventListener("scroll", bail, true)
    window.addEventListener("resize", bail)
    return () => {
      window.removeEventListener("scroll", bail, true)
      window.removeEventListener("resize", bail)
    }
  }, [box])

  return { anchor, panel, isOpen: box !== null, open, close }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}
