import { channelCoverage, loadChannels, loadMeta, loadSlimChannels } from "@/lib/bundles"
import { parseWindow, type WindowSearch } from "@/lib/window"
import { LeaderboardTable } from "@/components/leaderboard-table"
import { SectionKicker } from "@/components/section-kicker"

/** The board is the landing page. There is no separate home: a top-5 summary above a table of
 *  all 72 was the same answer twice, and the shorter one was never the one being read. */
export default async function LeaderboardPage({
  searchParams,
}: WindowSearch) {
  const { w } = await searchParams
  const meta = loadMeta()
  const bundle = loadChannels()
  const channels = loadSlimChannels()
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
      <SectionKicker label="ALL CHANNELS" cap={`${meta.channels.total} tracked`} />
      <LeaderboardTable channels={channels} coverage={coverage} selfId={bundle.self_channel_id}
        initialWindow={parseWindow(w)} />
    </section>
  )
}
