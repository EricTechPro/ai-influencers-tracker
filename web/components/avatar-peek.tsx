"use client"

import { createPortal } from "react-dom"
import { useAnchoredPanel } from "./anchored"
import { Avatar, type PeekStat } from "./avatar"

/**
 * An Avatar that blows up on demand into a face you can actually identify.
 *
 * The roster is 74 people whose names are mostly "<First Last> | AI Automation", so the inline
 * face is small enough to scan a table with and useless for recognising anyone. This gives the
 * second reading without a click or a page change.
 *
 * Two things about it were wrong and are worth naming, because both are easy to reintroduce.
 *
 * It used to be a hidden `position: absolute` panel, which is still laid out — ten of them below
 * the last row gave the leaderboard 121px of empty scrollable band. `useAnchoredPanel` is the
 * answer to that and carries the full story.
 *
 * And the trigger used to be a `tabIndex={0}` span *inside* the row's `<a>`. An anchor may not
 * contain interactive content, so that was a content-model violation with undefined screen-reader
 * behaviour; it also put a third tab stop on every row that announced the channel name a second
 * time, and on touch the avatar pixel belonged to the link, so the first tap navigated away and
 * the peek had no touch path at all. It is a real `<button>` beside the link now, which is what
 * gives a phone a way in. The panel is no longer `aria-hidden` either: the coverage stats in it
 * appear nowhere else on the row.
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
  const { anchor, panel, isOpen, open, close } = useAnchoredPanel<HTMLButtonElement, HTMLSpanElement>(
    "beside"
  )

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="avpeek"
        aria-label={`${name}, channel details`}
        aria-expanded={isOpen}
        onPointerEnter={open}
        onPointerLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={(e) => {
          if (e.key === "Escape") close()
        }}
      >
        <Avatar src={src} name={name} size={size} isSelf={isSelf} />
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <span ref={panel} className="avpop" role="tooltip">
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
    </>
  )
}
