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
 * The number bottom-left is vidIQ's breakout score, not ours. Our own multiplier
 * (pipeline/multiplier.py) disagreed with it by roughly 2x on every shared video and cannot
 * normalise by video age, so this surface shows the vendor's figure and says so. That is why
 * the title attribute names vidIQ rather than showing a derivation: we did not compute it and
 * cannot show its working.
 */
export function GridVideoCard({
  v,
  avatarUrl,
  isSelf = false,
  topicLabel = null,
}: {
  v: RecentRow
  avatarUrl: string | null
  isSelf?: boolean
  /** what this video is about. The feed used to say it once per shelf heading; with the shelves
   *  gone it rides the card, which is the only place it can go without regrouping the grid. Null
   *  means no topic was assigned, which is a state and reads as one. */
  topicLabel?: string | null
}) {
  const len = durationText(v.duration_s)
  return (
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
        {v.breakout_score !== null && (
          <span
            className={`ymult ${SCORE_CLASS[tierIndex(v.breakout_score)]}`}
            title={`vidIQ breakout score ${v.breakout_score}. How far past this channel's normal performance at this age the video ran. Measured by vidIQ, not by us.`}
          >
            {v.breakout_score.toFixed(2)}&times;
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
}
