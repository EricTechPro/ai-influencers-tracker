import Link from "next/link"
import { notFound } from "next/navigation"
import {
  channelAvatarUrl, channelVideos, loadChannelComments, loadChannels, loadMeta, loadSnapshots,
  videosById,
} from "@/lib/bundles"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, fmtInt } from "@/lib/trust"
import { parseWindow } from "@/lib/window"
import { Avatar } from "@/components/avatar"
import { Chip, Derived } from "@/components/trust"
import { ChannelGrowth } from "@/components/channel-growth"
import { CommentTable } from "@/components/comment-table"
import { StillPulling } from "@/components/still-pulling"
import { WindowTable } from "@/components/window-table"

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ w?: string }>
}) {
  const { id } = await params
  const { w } = await searchParams
  const win = parseWindow(w)
  const bundle = loadChannels()
  const channel = bundle.channels.find((c) => c.channel_id === id || c.handle === id)
  if (!channel) notFound()

  const snapshots = loadSnapshots().channels[channel.channel_id]?.series ?? []
  const growthRank = channel.rank.growth["90d"]
  const uploads = channelVideos(channel.channel_id)
  const cadence = cadenceDays(uploads.map((v) => v.published_at))

  const comments = loadChannelComments(channel.channel_id)
  const growing = videosById(channel.still_growing_video_ids)
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
  const stillRows = growing.map((v) => ({
    video_id: v.video_id,
    title: v.title,
    published_at: v.published_at,
    view_count: v.view_count,
    gained7d: v.traction.views_gained["7d"] ?? null,
    multiplier: v.multiplier.value,
    topic_id: (v.topic_assignments as { topic_id: string }[])[0]?.topic_id ?? null,
    comments: comments?.videos[v.video_id] ?? null,
  }))
  const channelsWithComments = loadMeta().comment_health.channels_with_comments

  return (
    <section>
      <div className="card pad" style={{ marginTop: "1.2rem" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Avatar src={channelAvatarUrl(channel.channel_id)} name={channel.name} size={96}
            isSelf={channel.is_self} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: "1.2rem" }}>{channel.name}</b>
              <span className="mono10">
                @{channel.handle}
                {channel.niche ? ` · ${channel.niche}` : ""}
                {channel.lang ? ` · ${channel.lang}` : ""}
              </span>
              {growthRank !== null && growthRank <= 3 && (
                <Chip variant="rank1">★ #{growthRank} by growth 90d</Chip>
              )}
              {channel.is_self ? (
                <Chip variant="you">★ you</Chip>
              ) : (
                <Link href={`/compare?a=${channel.channel_id}`}
                  style={{ marginLeft: "auto", fontSize: 12 }}>
                  compare with you →
                </Link>
              )}
            </div>
            <div className="num"
              style={{ marginTop: 8, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
              <span>
                {channel.subscriber_count === null ? "--" : <b>{fmtInt(channel.subscriber_count)}</b>}{" "}
                subs <Chip>{bucketText(channel.subscriber_bucket)}</Chip>
              </span>
              <span>
                {channel.view_count === null ? "--" : <b>{fmtInt(channel.view_count)}</b>} views
              </span>
              <span>
                {channel.video_count === null ? "--" : <b>{fmtInt(channel.video_count)}</b>} videos
              </span>
              <span>
                {cadence === null ? "--" : <Derived formula={CADENCE_FORMULA}><b>{cadence}d</b></Derived>}{" "}
                cadence
              </span>
            </div>
            {channel.blurb && (
              <p className="inference" style={{ margin: "10px 0 0", fontSize: 12, maxWidth: "36rem" }}>
                {channel.blurb}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="section-kicker">
        <span className="kicker">growth</span>
        <span className="rule" />
      </div>
      <WindowTable channel={channel} videos={uploads} />
      <ChannelGrowth
        series={snapshots}
        delta={channel.subscriber_delta}
        rate={channel.subscriber_growth_rate}
        bucket={channel.subscriber_bucket}
        win={win}
      />

      <div className="section-kicker">
        <span className="kicker">still pulling views</span><span className="rule" />
      </div>
      <StillPulling rows={stillRows} channelClassified={comments?.channel.totals.classified ?? 0} />

      <div className="section-kicker">
        <span className="kicker">what {channel.is_self ? "your" : "their"} viewers ask</span>
        <span className="rule" />
        {comments && (
          <span className="cap">
            {fmtInt(comments.channel.totals.ingested)} in {comments.channel.totals.window_days}d
          </span>
        )}
      </div>
      {comments ? (
        <CommentTable rows={comments.channel.top} byCategory={comments.channel.by_category}
          totals={comments.channel.totals} />
      ) : (
        <div className="card pad">
          <p className="note" style={{ margin: 0 }}>
            The comment ledger has not reached this channel yet. It fills on the next daily
            sweep with spare quota; {channelsWithComments} of {bundle.channels.length} channels
            are in so far.
          </p>
        </div>
      )}
    </section>
  )
}
