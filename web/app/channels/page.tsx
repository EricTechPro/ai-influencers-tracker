import { channelAvatarUrl, loadChannels, loadMeta } from "@/lib/bundles"
import { slimChannel } from "@/lib/growth"
import { ChannelsTable } from "@/components/channels-table"

export default function ChannelsPage() {
  const meta = loadMeta()
  const channels = loadChannels().channels.map((c) =>
    slimChannel(c, channelAvatarUrl(c.channel_id))
  )

  return (
    // Eight columns and a 30px face outgrow the 64rem reading measure, the same
    // way the leaderboard's do.
    <section className="breakout">
      <div className="section-kicker">
        <span className="kicker">ALL CHANNELS</span>
        <span className="rule" />
        <span className="cap">
          {meta.channels.total} tracked · {meta.channels.absent} absent
        </span>
      </div>
      <ChannelsTable channels={channels} />
    </section>
  )
}
