import Link from "next/link"
import { channelAvatarUrl, loadChannels, loadMeta } from "@/lib/bundles"
import { bucketText, fmtInt } from "@/lib/trust"
import { Avatar } from "@/components/avatar"
import { Chip } from "@/components/trust"

export default function ChannelsPage() {
  const meta = loadMeta()
  const channels = [...loadChannels().channels].sort(
    (a, b) => (a.rank.growth["90d"] ?? Infinity) - (b.rank.growth["90d"] ?? Infinity)
  )

  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">ALL CHANNELS</span>
        <span className="rule" />
        <span className="cap">
          {meta.channels.total} tracked · {meta.channels.absent} absent
        </span>
      </div>
      <div className="card tblwrap">
        {/* Below this the row would wrap the count away from its bucket and
            double in height, so the wrapper scrolls sideways instead. */}
        <table className="tbl tbl-sticky tbl-hover" style={{ minWidth: "48rem" }}>
          <thead>
            <tr>
              <th>
                <span className="derived" title="rank by subscriber growth over 90d">#</span>
              </th>
              <th>channel</th>
              <th>handle</th>
              <th className="r">subs</th>
              <th className="r">views</th>
              <th className="r">videos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const rank = c.rank.growth["90d"]
              return (
                <tr key={c.channel_id} className={c.is_self ? "youcard" : undefined}>
                  <td className="num muted">{rank ?? "--"}</td>
                  <td>
                    <Link href={`/channels/${c.channel_id}`}>
                      <Avatar src={channelAvatarUrl(c.channel_id)} name={c.name} size={30}
                        isSelf={c.is_self}
                        style={{ marginRight: 8, verticalAlign: "middle" }} />
                      {c.name}
                    </Link>
                    {c.is_self && (
                      <>
                        {" "}
                        <Chip variant="you">you</Chip>
                      </>
                    )}
                  </td>
                  <td className="mono10">@{c.handle}</td>
                  <td className="r num" style={{ whiteSpace: "nowrap" }}>
                    {c.subscriber_count === null ? "--" : fmtInt(c.subscriber_count)}{" "}
                    {c.subscriber_bucket !== null && (
                      <span className="muted">{bucketText(c.subscriber_bucket)}</span>
                    )}
                  </td>
                  <td className="r num">{c.view_count === null ? "--" : fmtInt(c.view_count)}</td>
                  <td className="r num">{c.video_count === null ? "--" : fmtInt(c.video_count)}</td>
                  <td>{c.status === "absent" && <Chip variant="warn">absent</Chip>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
