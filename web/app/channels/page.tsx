import Link from "next/link"
import { hasChannelAvatar, loadChannels, loadMeta } from "@/lib/bundles"
import { bucketText, fmtInt, initials } from "@/lib/trust"
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
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
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
              const avatarClass = `avatar av20${c.is_self ? " av-you" : ""}`
              return (
                <tr key={c.channel_id} className="rowlink">
                  <td className="num muted">{rank ?? "—"}</td>
                  <td>
                    <Link href={`/channels/${c.channel_id}`}>
                      {hasChannelAvatar(c.channel_id) ? (
                        <img className={avatarClass} src={`/assets/channels/${c.channel_id}.jpg`}
                          alt="" width={20} height={20} style={{ marginRight: 6, verticalAlign: "middle" }} />
                      ) : (
                        <span className={avatarClass} style={{ marginRight: 6, verticalAlign: "middle" }}>
                          {initials(c.name)}
                        </span>
                      )}
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
                  <td className="r num">
                    {c.subscriber_count === null ? "—" : fmtInt(c.subscriber_count)}{" "}
                    {c.subscriber_bucket !== null && (
                      <span className="muted">{bucketText(c.subscriber_bucket)}</span>
                    )}
                  </td>
                  <td className="r num">{c.view_count === null ? "—" : fmtInt(c.view_count)}</td>
                  <td className="r num">{c.video_count === null ? "—" : fmtInt(c.video_count)}</td>
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
