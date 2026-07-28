import Link from "next/link"
import { notFound } from "next/navigation"
import { channelVideos, hasChannelAvatar, loadChannels, loadSnapshots } from "@/lib/bundles"
import { CADENCE_FORMULA, cadenceDays } from "@/lib/channel"
import { bucketText, fmtInt, initials } from "@/lib/trust"
import { Chip, Derived } from "@/components/trust"
import { ChannelGrowth } from "@/components/channel-growth"

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bundle = loadChannels()
  const channel = bundle.channels.find((c) => c.channel_id === id || c.handle === id)
  if (!channel) notFound()

  const snapshots = loadSnapshots().channels[channel.channel_id]?.series ?? []
  const growthRank = channel.rank.growth["90d"]
  const uploads = channelVideos(channel.channel_id)
  const cadence = cadenceDays(uploads.map((v) => v.published_at))
  const avatarClass = `avatar av56${channel.is_self ? " av-you" : ""}`

  return (
    <section>
      <div className="card pad" style={{ marginTop: "1.2rem" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {hasChannelAvatar(channel.channel_id) ? (
            <img className={avatarClass} src={`/assets/channels/${channel.channel_id}.jpg`}
              alt="" width={56} height={56} />
          ) : (
            <span className={avatarClass}>{initials(channel.name)}</span>
          )}
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
                {channel.subscriber_count === null ? "—" : <b>{fmtInt(channel.subscriber_count)}</b>}{" "}
                subs <Chip>{bucketText(channel.subscriber_bucket)}</Chip>
              </span>
              <span>
                {channel.view_count === null ? "—" : <b>{fmtInt(channel.view_count)}</b>} views
              </span>
              <span>
                {channel.video_count === null ? "—" : <b>{fmtInt(channel.video_count)}</b>} videos
              </span>
              <span>
                {cadence === null ? "—" : <Derived formula={CADENCE_FORMULA}><b>{cadence}d</b></Derived>}{" "}
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
        <span className="kicker">▸ growth</span>
        <span className="rule" />
      </div>
      <ChannelGrowth
        series={snapshots}
        delta={channel.subscriber_delta}
        rate={channel.subscriber_growth_rate}
        bucket={channel.subscriber_bucket}
      />

      {/* still pulling views: Task 5 */}
      {/* what viewers ask: Task 5 */}
    </section>
  )
}
