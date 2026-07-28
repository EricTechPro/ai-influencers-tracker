import { loadChannels, loadMeta } from "@/lib/bundles"
import { slimChannel } from "@/lib/growth"
import { LeaderboardTable } from "@/components/leaderboard-table"

export default function LeaderboardPage() {
  const meta = loadMeta()
  const channels = loadChannels().channels.map(slimChannel)
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">ALL CHANNELS</span>
        <span className="rule" />
        <span className="cap">{meta.channels.total} tracked</span>
      </div>
      <LeaderboardTable channels={channels} />
    </section>
  )
}
