import { agoText, durationText, fmtInt, tierIndex } from "@/lib/trust"
import type { RecentRow } from "@/lib/types"
import { Avatar } from "./avatar"

/** Louder the further past normal it ran. Bands only, never a recomputation. The ramp is
 *  vidIQ's own: their outlier UI runs blue into purple, so a vendor number wears vendor
 *  colours and stops competing with this board's verdict palette. */
export const SCORE_CLASS = ["t2", "t3", "t5", ""] as const

/** Every state says its own word, in plain English. The one thing view count cannot tell you is
 *  whether a video is still getting views, and "unmeasured" is a state too — a video we cannot
 *  speak about must not be left looking like a flat one. */
const MOMENTUM_LABEL = {
  climbing: "climbing",
  steady: "steady",
  flat: "flat",
  unmeasured: "no data",
} as const

/**
 * One video in the recent feed, wearing YouTube's grid geometry.
 *
 * The number bottom-left is our multiplier (pipeline/multiplier.py): this video's views over the
 * median of its channel's last mature uploads of the same kind. It was vidIQ's breakout score,
 * which could not show its working because we did not compute it — so the badge asserted a number
 * and the tooltip could only name a vendor. Derived tier now, and it ships the divisor: the
 * tooltip states the baseline and how many uploads it was taken from, which is the difference
 * between a measurement and a claim on this board.
 *
 * The one thing the vendor's figure did that this does not is normalise by video age, so a
 * six-hour-old video is compared against mature medians and reads low until it has run. The
 * momentum line under the card is what covers that, and it is why it is on the card at all.
 */
export function GridVideoCard({
  v,
  avatarUrl,
  isSelf = false,
  topicLabel = null,
  muted = false,
  onToggleMute,
}: {
  v: RecentRow
  avatarUrl: string | null
  isSelf?: boolean
  /** what this video is about. The feed used to say it once per shelf heading; with the shelves
   *  gone it rides the card, which is the only place it can go without regrouping the grid. Null
   *  means no topic was assigned, which is a state and reads as one. */
  topicLabel?: string | null
  /** whether this video is on the mute list. Only ever true in the feed's `muted` view, since
   *  every other view filters muted videos out before it reaches a card. */
  muted?: boolean
  /** Takes the entry rather than the row, because the strip in recent-feed.tsx toggles the same
   *  videos from `config/muted.json` alone, where no RecentRow exists to pass. One signature, so
   *  the two callers cannot drift into two ideas of what a mute is.
   *  Omitted on the surfaces that only display cards (patterns), where a mute control would be a
   *  button with nothing to hide it from. */
  onToggleMute?: (entry: { video_id: string; title: string; channel_name: string }) => void
}) {
  const len = durationText(v.duration_s)
  const card = (
    <a
      className="ycard"
      href={`https://www.youtube.com/watch?v=${v.video_id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className="ythumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          decoding="async"
        />
        {v.type === "short" && <span className="yshort">SHORT</span>}
        {/* The unscored case wears a badge of its own rather than leaving the corner empty. The
            page used to carry a sentence saying a video with no score is unmeasured and not low;
            an empty corner is what made that sentence necessary. */}
        {v.multiplier === null ? (
          <span
            className="ymult ynoscore"
            title="This channel has too few mature uploads to build a baseline from, so there is nothing to measure this video against. Unmeasured, which is not the same as low."
          >
            unmeasured
          </span>
        ) : (
          <span
            className={`ymult ${SCORE_CLASS[tierIndex(v.multiplier)]}`}
            title={
              `${v.multiplier.toFixed(2)}x this channel's own normal. ` +
              `${v.view_count === null ? "--" : fmtInt(v.view_count)} views over a baseline of ` +
              `${v.baseline === null ? "--" : fmtInt(v.baseline)}, the median of its last ` +
              `${v.baseline_n} mature ` +
              `${v.type === "short" ? "shorts" : "long-form uploads"}. ` +
              `Computed from exact view counts, not bought.`
            }
          >
            {v.multiplier.toFixed(2)}&times;
          </span>
        )}
        {len && <span className="ylen">{len}</span>}
      </span>
      <span className="ybody">
        <Avatar src={avatarUrl} name={v.channel_name} size={34} />
        <span className="ymeta">
          <span className="ytitle" title={v.title}>
            {v.title}
          </span>
          <span className={isSelf ? "ychan yself" : "ychan"}>
            {v.channel_name}
            {isSelf ? " · you" : ""}{" "}
            <span
              className={`ymom ${v.momentum.state}`}
              title={
                v.momentum.daily_share === null
                  ? "no views-per-hour returned for this video, so it cannot be judged"
                  : `about ${v.momentum.per_day?.toLocaleString()} views a day, ${(v.momentum.daily_share * 100).toFixed(1)}% of the ${v.view_count?.toLocaleString()} it already has. Climbing is 2%/day or more, flat is under 0.5%.`
              }
            >
              {MOMENTUM_LABEL[v.momentum.state]}
            </span>
          </span>
          <span className="ystat">
            {v.view_count === null ? "views --" : `${fmtInt(v.view_count)} views`} ·{" "}
            {agoText(v.published_at)}
          </span>
          <span className="ytopic">{topicLabel ?? "no topic assigned"}</span>
        </span>
      </span>
    </a>
  )

  if (!onToggleMute) return card

  /* A sibling of the card, never a child of it. The card is one `<a>` wrapping the whole tile, and
     a `<button>` inside an `<a>` is invalid HTML — browsers reparent it out of the anchor, so the
     control lands somewhere the CSS does not expect and the anchor still swallows the activation
     on some of them. The wrapper is what carries `position: relative` instead, which is also what
     lets the button sit over the thumbnail without joining the card's hover-scale.

     It is in the DOM whether or not it is hovered, and only its opacity changes, so it is
     tab-reachable and a screen reader reads it on every card. A control that exists only under a
     pointer is a control a keyboard cannot reach. */
  return (
    <div className={muted ? "ycard-wrap is-muted" : "ycard-wrap"}>
      {card}
      <button
        type="button"
        className="ymute"
        aria-pressed={muted}
        title={
          muted
            ? "Unmute: put this video back on the feed"
            : "Mute: take this video off the feed. It stays in the corpus and in every count, and the muted key above brings it back."
        }
        onClick={() =>
          onToggleMute({ video_id: v.video_id, title: v.title, channel_name: v.channel_name })
        }
      >
        <span aria-hidden="true">{muted ? "↺" : "✕"}</span>
        <span className="sr-only">{muted ? `unmute ${v.title}` : `mute ${v.title}`}</span>
      </button>
    </div>
  )
}
