import { channelAvatarUrl, channelCoverage, loadChannels, loadMeta } from "@/lib/bundles"
import { slimChannel } from "@/lib/growth"
import { LeaderboardTable } from "@/components/leaderboard-table"

/** The board is the landing page. There is no separate home: a top-5 summary above a table of
 *  all 72 was the same answer twice, and the shorter one was never the one being read. */
export default function LeaderboardPage() {
  const meta = loadMeta()
  const bundle = loadChannels()
  const channels = bundle.channels.map((c) =>
    slimChannel(c, channelAvatarUrl(c.channel_id))
  )
  // Coverage is a filesystem read, so it is resolved here and handed to the
  // client table as plain numbers.
  const coverage = Object.fromEntries(
    channels.map((c) => {
      const { videos, comments } = channelCoverage(c.channel_id)
      return [c.channel_id, { videos, comments }]
    })
  )
  return (
    // Eight columns plus a 28px face do not fit the 64rem reading measure the
    // prose pages use; the last column was being clipped at the viewport edge.
    <section className="breakout">
      <div className="section-kicker">
        <span className="kicker">ALL CHANNELS</span>
        <span className="rule" />
        <span className="cap">{meta.channels.total} tracked</span>
      </div>
      <LeaderboardTable channels={channels} coverage={coverage} selfId={bundle.self_channel_id} />
    </section>
  )
}
