import { agoText, fmtInt } from "@/lib/trust"
import type { RecentRow } from "@/lib/types"
import { Avatar } from "./avatar"

function duration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Louder the further past normal it ran. Bands only, never a recomputation. */
function scoreTier(score: number): string {
  if (score >= 10) return ""
  if (score >= 5) return "t5"
  if (score >= 3) return "t3"
  return "t2"
}

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
}: {
  v: RecentRow
  avatarUrl: string | null
  isSelf?: boolean
}) {
  const len = duration(v.duration_s)
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
            className={`ymult ${scoreTier(v.breakout_score)}`}
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
            {isSelf ? " · you" : ""}
          </span>
          <span className="ystat">
            {v.view_count === null ? "views --" : `${fmtInt(v.view_count)} views`} ·{" "}
            {agoText(v.published_at)}
          </span>
        </span>
      </span>
    </a>
  )
}
