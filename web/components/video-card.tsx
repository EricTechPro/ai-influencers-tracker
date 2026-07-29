import { agoText, fmtInt } from "@/lib/trust"
import { Avatar } from "./avatar"

export interface VideoCardModel {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
  duration_s: number | null
  type: "short" | "long"
  channel_name: string
  channel_id: string
  channel_avatar: string | null
  /** how this video's views compare to its channel's own baseline; null when
   *  the channel has too few videos to have one yet */
  multiplier: number | null
  still_growing: boolean | null
}

function duration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * A video, shown the way a video is normally shown.
 *
 * The topics pages listed their videos as counts — "1,936 videos · 55
 * creators" — which is the right summary for ranking a topic and useless for
 * the actual question underneath it, which is what those videos *are*. A
 * thumbnail answers that faster than any row of numbers.
 *
 * The thumbnail comes from YouTube's own CDN rather than from _db/: it is
 * keyed entirely by video_id, costs no quota, and nothing downstream depends
 * on it, so a failed load degrades to the title alone.
 */
export function VideoCard({ v }: { v: VideoCardModel }) {
  const len = duration(v.duration_s)
  const hot = v.multiplier !== null && v.multiplier >= 2
  return (
    <a
      className="vcard"
      href={`https://www.youtube.com/watch?v=${v.video_id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className="vthumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          decoding="async"
        />
        {len && <span className="vlen num">{len}</span>}
        {v.type === "short" && <span className="vshort">SHORT</span>}
      </span>
      <span className="vbody">
        <span className="vtitle" title={v.title}>
          {v.title}
        </span>
        <span className="vchan">
          <Avatar src={v.channel_avatar} name={v.channel_name} size={20} />
          <span className="ell">{v.channel_name}</span>
        </span>
        <span className="vmeta num">
          {v.view_count === null ? "views --" : `${fmtInt(v.view_count)} views`} ·{" "}
          {agoText(v.published_at)}
          {hot && (
            <>
              {" "}
              <span
                className="vmult"
                title={`${v.multiplier!.toFixed(1)}x this channel's own median. Derived: view_count ÷ the channel's baseline.`}
              >
                {v.multiplier!.toFixed(1)}×
              </span>
            </>
          )}
          {v.still_growing && (
            <>
              {" "}
              <span className="vgrow" title="Still gaining views at a rate above the traction threshold.">
                still climbing
              </span>
            </>
          )}
        </span>
      </span>
    </a>
  )
}
