import Link from "next/link"
import { notFound } from "next/navigation"
import {
  channelAvatarUrl, channelTop, channelVideos, loadChannelComments, loadChannels, loadMeta,
  loadSnapshots,
} from "@/lib/bundles"
import { entriesOf } from "@/lib/muted"
import { loadMuted } from "@/lib/muted-store"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, fmtInt } from "@/lib/trust"
import { parseWindow, withWindow } from "@/lib/window"
import { Avatar } from "@/components/avatar"
import { Chip, Derived } from "@/components/trust"
import { ChannelGrowth } from "@/components/channel-growth"
import { ChannelShelves } from "@/components/channel-shelves"
import { CommentTable } from "@/components/comment-table"
import { SectionKicker } from "@/components/section-kicker"

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
  const meta = loadMeta()
  const channelsWithComments = meta.comment_health.channels_with_comments
  // The biggest uploads, at any age. channel_top.json exists because the recent feed is bounded
  // by feed_window_days and a channel's breakout is almost always older than that window.
  const top = channelTop(channel.channel_id)
  const mutedEntries = entriesOf(loadMuted())
  // Who this channel can be laid over. Ranked by 90-day growth so the fastest movers are the
  // first names in the list, with Eric's own channel pinned first: comparing against yourself is
  // the reason the control exists.
  const allSnapshots = loadSnapshots().channels
  const peers = bundle.channels
    .filter((c) => c.channel_id !== channel.channel_id
      && (allSnapshots[c.channel_id]?.series.length ?? 0) >= 2)
    .sort((a, b) => Number(b.is_self) - Number(a.is_self)
      || (a.rank.growth["90d"] ?? 999) - (b.rank.growth["90d"] ?? 999))
    .map((c) => ({ channel_id: c.channel_id, name: c.name,
                   series: allSnapshots[c.channel_id]?.series ?? [] }))

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
                <Link href={withWindow(`/compare?a=${channel.channel_id}`, win)}
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

      <SectionKicker label="growth" />
      {/* The six-window table used to sit here. Every number in it is a pair of points the chart
          already draws, and reading a delta off a row meant holding six rows in your head to see
          a shape. The chart is the shape. */}
      <ChannelGrowth
        series={snapshots}
        delta={channel.subscriber_delta}
        rate={channel.subscriber_growth_rate}
        bucket={channel.subscriber_bucket}
        win={win}
        name={channel.name}
        peers={peers}
        uploads={uploads.map((v) => ({ video_id: v.video_id, title: v.title,
                                       published_at: v.published_at, view_count: v.view_count }))}
        rank={growthRank}
        fieldSize={bundle.channels.length}
      />

      <ChannelShelves
        videos={top}
        avatarUrl={channelAvatarUrl(channel.channel_id)}
        isSelf={channel.is_self}
        initialMuted={mutedEntries}
      />

      <details>
        <summary>
          comments{comments ? ` · ${fmtInt(comments.channel.totals.ingested)} ingested` : ""}
        </summary>
        <SectionKicker label={`what ${channel.is_self ? "your" : "their"} viewers ask`} />
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
      </details>
    </section>
  )
}
