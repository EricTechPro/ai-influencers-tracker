import type { LeafTopicPage, OpportunityRow, TopicCommentsFile, VideoRow } from "@/lib/types"
import type { TrailRow } from "@/lib/topic"
import { insufficientText, multText } from "@/lib/topic"
import { visibleEdges } from "@/lib/chain"
import { agoText, fmtDate, fmtInt, initials, SCORE_FORMULA, scoreText } from "@/lib/trust"
import { ChainMap } from "./chain-map"
import { CommentTable } from "./comment-table"
import { Chip, Derived, VerdictBadge } from "./trust"

export function TopicLeaf({
  topic,
  opp,
  videos,
  trail,
  topicComments,
  creatorNames,
}: {
  topic: LeafTopicPage
  opp: OpportunityRow | null
  videos: VideoRow[]
  trail: TrailRow[]
  topicComments: TopicCommentsFile | null
  creatorNames: Record<string, string>
}) {
  const edges = visibleEdges(topic.edges)
  return (
    <>
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.topic_id}</h1>
          {opp ? (
            <>
              <VerdictBadge verdict={opp.verdict} />
              <span className="num">
                <Derived formula={SCORE_FORMULA}>
                  {scoreText(opp.score)}
                </Derived>
              </span>
              {opp.hunch && <Chip>hunch</Chip>}
            </>
          ) : (
            <Chip>not scored in this build</Chip>
          )}
        </div>
        <p className="note">
          {topic.label} · {topic.shape ?? "shape unset"} · {topic.video_count} videos ·{" "}
          {topic.creator_count} creators · {topic.window_days}d
        </p>
        {topic.state === "insufficient_data" && (
          <p className="callout warn" style={{ display: "inline-block" }}>
            {insufficientText(topic.video_count, topic.min_videos)}
          </p>
        )}
        {opp &&
          (opp.own_coverage.covered ? (
            <p className="callout inf" style={{ display: "inline-block" }}>
              you covered this:{" "}
              <a
                href={`https://www.youtube.com/watch?v=${opp.own_coverage.video_id}`}
                target="_blank"
                rel="noreferrer"
              >
                open your video ↗
              </a>{" "}
              on {fmtDate(opp.own_coverage.published_at)}
            </p>
          ) : (
            <p className="callout inf" style={{ display: "inline-block" }}>
              you have not covered this
            </p>
          ))}
      </header>

      <section>
        <div className="section-kicker">
          <span className="kicker">WHERE THEY DISAGREE</span>
          <span className="rule" />
          <span className="cap">the opening</span>
        </div>
        {edges.length > 0 ? (
          <ChainMap edges={edges} />
        ) : (
          <div className="empty">
            not extracted yet
            <br />
            {topic.video_count} videos matched this topic · 0 analyzed
            <br />
            needs build step 14
          </div>
        )}
      </section>

      <section>
        <div className="section-kicker">
          <span className="kicker">WHAT VIEWERS ASKED</span>
          <span className="rule" />
          <span className="cap">real from step 6</span>
        </div>
        {topicComments ? (
          <CommentTable rows={topicComments.topic.top} byCategory={topicComments.topic.by_category}
            totals={{
              ingested: topicComments.topic.totals.comments,
              classified: topicComments.topic.totals.comments - topicComments.topic.by_category.unsorted,
            }}
            creatorNames={creatorNames} />
        ) : (
          <p className="note">no comments ingested for this topic yet</p>
        )}
      </section>

      <details className="sect">
        <summary className="section-kicker">
          <span className="kicker">EVERY CREATOR&apos;S TRAIL</span>
          <span className="rule" />
          <span className="cap">{trail.length} creators</span>
        </summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>creator</th>
              <th className="r">videos</th>
              <th className="r">newest</th>
            </tr>
          </thead>
          <tbody>
            {trail.map((t) => (
              <tr key={t.channel_id}>
                <td>
                  <span className={t.is_self ? "avatar av18 av-you" : "avatar av18"}>
                    {initials(t.name)}
                  </span>{" "}
                  {t.name}
                  {t.is_self && (
                    <>
                      {" "}
                      <Chip variant="you">YOU</Chip>
                    </>
                  )}
                </td>
                <td className="r num">{t.count}</td>
                <td className="r num">{agoText(t.newest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="sect">
        <summary className="section-kicker">
          <span className="kicker">VIDEOS ON THIS TOPIC</span>
          <span className="rule" />
          <span className="cap">{videos.length}</span>
        </summary>
        <table className="tbl">
          <thead>
            <tr>
              <th>title</th>
              <th>creator</th>
              <th className="r">published</th>
              <th className="r">views</th>
              <th className="r" title="views over the channel's median of mature uploads">
                mult
              </th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <tr key={v.video_id}>
                <td>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.video_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {v.title} ↗
                  </a>
                </td>
                <td>{trail.find((t) => t.channel_id === v.channel_id)?.name ?? v.channel_id}</td>
                <td className="r num">{fmtDate(v.published_at)}</td>
                <td className="r num">{v.view_count !== null ? fmtInt(v.view_count) : "--"}</td>
                <td className="r num">
                  {v.multiplier.state === "ok" && v.multiplier.value !== null ? (
                    <Derived formula="views ÷ channel median of the last 20 mature uploads">
                      {multText(v.multiplier)}
                    </Derived>
                  ) : (
                    <span className="muted">{multText(v.multiplier)}</span>
                  )}
                </td>
                <td className="muted">{v.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}
