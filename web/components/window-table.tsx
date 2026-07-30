import { videosInWindow } from "@/lib/compare"
import { deltaText, fmtInt, pctText, stateExplain } from "@/lib/trust"
import type { ChannelRow, StateCell, VideoRow } from "@/lib/types"
import { WINDOWS } from "@/lib/types"

/** Only the four windowed records the table reads, not the whole channel row —
 *  a page passing a real ChannelRow satisfies this structurally, and a test
 *  fixture never has to fake the twenty unrelated fields to build one. */
type WindowedChannel = Pick<
  ChannelRow,
  "subscriber_delta" | "subscriber_growth_rate" | "view_delta" | "subs_per_1k_views"
>

/** subs_per_1k_views has no dedicated formatter elsewhere: an ok cell is a
 *  plain ratio, everything else is a state and renders exactly as deltaText
 *  would render it (never a bare number, never blank). */
function per1kText(cell: StateCell): string {
  return cell.state === "ok" ? (cell.value ?? 0).toFixed(1) : deltaText(cell)
}

/**
 * One row per window (the shared six), the same metric set /compare uses —
 * Δsubs, growth, Δviews, subs/1k, videos — for a single channel. The chart
 * above shows shape; this says the number, and every non-ok window renders
 * the reason it has none (one hover away via `title`) rather than a blank
 * or a zero.
 */
export function WindowTable({ channel, videos }: { channel: WindowedChannel; videos: VideoRow[] }) {
  const now = new Date()
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
                  {per1kText(per1k)}
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
