import Link from "next/link"
import type { LeafTopicPage, OpportunityRow, ParentTopicPage } from "@/lib/types"
import type { WeekPoint } from "@/lib/rollup"
import { rollupLine } from "@/lib/rollup"
import { agoText, SCORE_FORMULA, scoreText } from "@/lib/trust"
import { Chip, Derived, VerdictBadge } from "./trust"
import { TrendArea } from "./trend-area"

export interface LeafSummary {
  leaf: LeafTopicPage
  opp: OpportunityRow | null
}

export function TopicParent({
  topic,
  leaves,
  points,
}: {
  topic: ParentTopicPage
  leaves: LeafSummary[]
  points: WeekPoint[]
}) {
  const line = rollupLine(points)
  return (
    <>
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.label}</h1>
          <Chip>parent · not scoreable</Chip>
        </div>
        <p className="note">
          {topic.leaf_count} leaf topics · {topic.video_count} videos · {topic.creator_count}{" "}
          creators · {topic.window_days}d
        </p>
        <p className="note">
          ⓘ Parents are never scored. Only leaves get a verdict, because &quot;{topic.label}&quot;
          is not something you can film.
        </p>
      </header>

      <table className="tbl">
        <thead>
          <tr>
            <th>leaf</th>
            <th>verdict</th>
            <th className="r">videos</th>
            <th className="r">creators</th>
            <th className="r">score</th>
            <th className="r">newest</th>
          </tr>
        </thead>
        <tbody>
          {leaves.map(({ leaf, opp }) => (
            <tr key={leaf.topic_id}>
              <td>
                <Link href={`/topics/${leaf.topic_id}`}>{leaf.topic_id}</Link>
              </td>
              <td>{opp ? <VerdictBadge verdict={opp.verdict} /> : <span className="muted">--</span>}</td>
              <td className="r num">{leaf.video_count}</td>
              <td className="r num">{leaf.creator_count}</td>
              <td className="r num">
                {opp ? (
                  <Derived formula={SCORE_FORMULA}>
                    {scoreText(opp.score)}
                  </Derived>
                ) : (
                  <span className="muted">--</span>
                )}
              </td>
              <td className="r num">{agoText(leaf.newest_video_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <div className="section-kicker">
          <span className="kicker">IS THIS WHOLE AREA HEATING OR COOLING?</span>
          <span className="rule" />
          <span className="cap">videos/wk across all children</span>
        </div>
        <TrendArea points={points} />
        {line && (
          <p className="note">
            <Derived formula="videos published across all children, bucketed by week (Monday UTC)">
              {line}
            </Derived>
          </p>
        )}
      </section>
    </>
  )
}
