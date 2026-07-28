import { videosInWindow } from "@/lib/compare"
import { deltaText, fmtInt, pctText, ratioText, stateExplain } from "@/lib/trust"
import type { ChannelRow, StateCell, VideoRow } from "@/lib/types"
import { WINDOWS } from "@/lib/types"

/** Only the four windowed records the table reads, not the whole channel row —
 *  a page passing a real ChannelRow satisfies this structurally, and a test
 *  fixture never has to fake the twenty unrelated fields to build one. */
type WindowedChannel = Pick<
  ChannelRow,
  "subscriber_delta" | "subscriber_growth_rate" | "view_delta" | "subs_per_1k_views"
>


/**
 * One row per window (the shared six), the same metric set /compare uses —
 * Δsubs, growth, Δviews, subs/1k, videos — for a single channel. The chart
 * above shows shape; this says the number, and every non-ok window renders
 * the reason it has none (one hover away via `title`) rather than a blank
 * or a zero.
 */
export function WindowTable({ channel, videos, generatedAt }: {
  channel: WindowedChannel
  videos: VideoRow[]
  generatedAt: string
}) {
  // The server's clock, not the browser's — see videosInWindow's doc comment
  // in lib/compare.ts for why this cannot be `new Date()`.
  const now = new Date(generatedAt)
  return (
    <div className="card tblwrap">
      <table className="tbl tbl-hover" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>window</th>
            <th className="r">Δsubs</th>
            <th className="r">growth</th>
            <th className="r">Δviews</th>
            <th className="r">subs/1k</th>
            <th className="r">videos</th>
          </tr>
        </thead>
        <tbody>
          {WINDOWS.map((w) => {
            const dsubs = channel.subscriber_delta[w]
            const growth = channel.subscriber_growth_rate[w]
            const dviews = channel.view_delta[w]
            const per1k = channel.subs_per_1k_views[w]
            return (
              <tr key={w}>
                <td>{w}</td>
                <td className="r num" title={stateExplain(dsubs)}>
                  {deltaText(dsubs)}
                </td>
                <td className="r num" title={stateExplain(growth)}>
                  {pctText(growth)}
                </td>
                <td className="r num" title={stateExplain(dviews)}>
                  {deltaText(dviews)}
                </td>
                <td className="r num" title={stateExplain(per1k)}>
                  {ratioText(per1k)}
                </td>
                <td className="r num">{fmtInt(videosInWindow(videos, w, now).length)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
