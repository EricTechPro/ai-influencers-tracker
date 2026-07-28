import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadSnapshots,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { slimChannel, sparkAll } from "@/lib/growth"
import { oppRowModels } from "@/lib/opportunity"
import { GrowthPanel } from "@/components/growth-panel"
import { OpportunityTable } from "@/components/opportunity-table"

export default function HomePage() {
  const meta = loadMeta()
  const channels = loadChannels().channels
  const snapshots = loadSnapshots()
  const slim = channels.map(slimChannel)
  const sparks = Object.fromEntries(
    slim.map((c) => [c.channel_id, sparkAll(snapshots, c.channel_id)])
  )
  const models = oppRowModels(
    loadOpportunities().rows,
    loadTopicPages().topics,
    channels,
    videosById
  )

  return (
    <div className="vb">
      <section>
        <div className="section-kicker">
          <span className="kicker bigsec">WHO IS GROWING</span>
          <span className="rule" />
          <a className="cap" href="/leaderboard">
            see all {meta.channels.total} →
          </a>
        </div>
        <p className="note">
          ranked by subscriber growth rate · below a channel&apos;s measurement floor renders
          &quot;&lt; N&quot;
        </p>
        <GrowthPanel channels={slim} sparks={sparks} />
      </section>
      <section>
        <div className="section-kicker">
          <span className="kicker bigsec">WHAT TO MAKE NEXT</span>
          <span className="rule" />
          <span className="cap num">score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness</span>
        </div>
        <OpportunityTable models={models} />
      </section>
    </div>
  )
}
