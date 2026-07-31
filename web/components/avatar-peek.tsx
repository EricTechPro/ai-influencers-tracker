"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Avatar, type PeekStat } from "./avatar"

/**
 * An Avatar that blows up on hover into a face you can actually identify.
 *
 * The roster is 74 people whose names are mostly "<First Last> | AI Automation", so the inline
 * face is small enough to scan a table with and useless for recognising anyone. This gives the
 * second reading without a click or a page change.
 *
 * It used to be CSS only: a relative wrapper and an absolute panel, hidden with
 * `visibility: hidden`. That is what put 121px of dead white space under the leaderboard.
 * A hidden-but-positioned element is still laid out, so all ten panels sat below the last row
 * contributing scrollable overflow — and `.tblwrap` is `overflow-x: auto` under 90rem, which the
 * spec turns into `overflow-y: auto` on the other axis too. The wrapper therefore became a
 * scrollport 121px shorter than its own content: an empty band under row 10, a scrollbar with
 * nothing in it, and rows 1 and 2 sliding under a sticky header that was now sticking to the
 * wrapper rather than to the page.
 *
 * So the panel leaves the table. It mounts only while open, in a portal on `document.body`, at
 * fixed viewport coordinates. Nothing about it can reach `.tblwrap`'s overflow, and as a bonus it
 * is no longer clipped at the table's edge when the table does scroll sideways — which is the
 * other thing that was wrong with it on a narrow window.
 *
 * `onFocus`/`onBlur` on the tabbable wrapper hand the keyboard the same affordance the mouse gets,
 * as `:focus-within` used to.
 */
export function AvatarPeek({
  src,
  name,
  handle,
  size = 20,
  isSelf = false,
  stats,
}: {
  src: string | null
  name: string
  handle?: string | null
  size?: number
  isSelf?: boolean
  /** The basics worth having without leaving the row: how big this channel is,
   *  and how much of it we have actually pulled. */
  stats?: PeekStat[]
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  // The anchor's box at the moment it opened, and the open flag, in one piece of state: the panel
  // is placed against a rectangle rather than against a live element, so a re-render cannot move
  // it out from under the cursor.
  const [box, setBox] = useState<DOMRect | null>(null)

  const open = useCallback(() => {
    if (anchor.current) setBox(anchor.current.getBoundingClientRect())
  }, [])
  const close = useCallback(() => setBox(null), [])

  // Placed after mount, from the panel's own measured size rather than from the 216px in the
  // stylesheet: its height depends on how many stat lines the caller passed, and a guess here is
  // a panel that hangs off the bottom of the window on the last row of the table.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el || !box) return
    // offsetWidth/offsetHeight, not getBoundingClientRect: the panel is mid-way through its
    // scale(0.96) entry animation at this point, and a measured box 4% short clamps it 12px past
    // the bottom of the window on the last row. The offset pair reports the laid-out size and
    // ignores the transform.
    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 12
    const pad = 8
    // Beside the avatar, and on the side where there is room. Left-flip matters on /compare and
    // on a narrow window, where the face sits far enough right that the panel would go off-screen.
    const toRight = box.right + gap + w <= window.innerWidth - pad
    const left = toRight ? box.right + gap : box.left - gap - w
    // Centred on the face, then clamped into the window. The pointer follows the face rather than
    // the panel, so a clamped panel still points at the row it belongs to.
    const wanted = box.top + box.height / 2 - h / 2
    const top = Math.min(Math.max(pad, wanted), Math.max(pad, window.innerHeight - h - pad))
    el.style.left = `${Math.max(pad, left)}px`
    el.style.top = `${top}px`
    el.style.setProperty("--arrow-top", `${box.top + box.height / 2 - top}px`)
    el.dataset.side = toRight ? "right" : "left"
    el.style.visibility = "visible"
  }, [box])

  // Fixed coordinates go stale the moment anything scrolls, and there is no placement that
  // survives it — so the panel closes instead of drifting. Capture, because the scroll that
  // matters is usually the table's own, not the page's.
  useLayoutEffect(() => {
    if (!box) return
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [box, close])

  return (
    <span
      ref={anchor}
      className="avpeek"
      tabIndex={0}
      aria-label={name}
      onPointerEnter={open}
      onPointerLeave={close}
      onFocus={open}
      onBlur={close}
    >
      <Avatar src={src} name={name} size={size} isSelf={isSelf} />
      {box !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <span ref={panel} className="avpop" aria-hidden="true">
            <Avatar src={src} name={name} size={132} isSelf={isSelf} className="avpop-face" />
            <span className="avpop-meta">
              <b>{name}</b>
              {handle && <span className="mono10">@{handle}</span>}
            </span>
            {stats && stats.length > 0 && (
              <span className="avpop-stats">
                {stats.map((s) => (
                  <span className="avpop-stat" key={s.label}>
                    <span className="k">{s.label}</span>
                    <span className="v num">
                      {s.value ?? "--"}
                      {s.note && <span className="n2"> {s.note}</span>}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </span>,
          document.body
        )}
    </span>
  )
}
