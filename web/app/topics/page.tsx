import Link from "next/link"
import { loadOpportunities, loadTopicPages } from "@/lib/bundles"
import { findOpp } from "@/lib/topic"
import { VerdictBadge } from "@/components/trust"
import type { OpportunityRow, TopicPage } from "@/lib/types"

export default function TopicsIndexPage() {
  const topics = loadTopicPages().topics
  const opps = loadOpportunities().rows
  const roots = topics.filter((t) => t.parent_id === null)
  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">ALL TOPICS</span>
        <span className="rule" />
        <span className="cap">
          {topics.filter((t) => t.is_leaf).length} leaves ·{" "}
          {topics.filter((t) => !t.is_leaf).length} parents
        </span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {roots.map((t) => (
          <TopicNode key={t.topic_id} topic={t} topics={topics} opps={opps} depth={0} />
        ))}
      </ul>
    </section>
  )
}

function TopicNode({
  topic,
  topics,
  opps,
  depth,
}: {
  topic: TopicPage
  topics: TopicPage[]
  opps: OpportunityRow[]
  depth: number
}) {
  const opp = topic.is_leaf ? findOpp(opps, topic.topic_id) : null
  const children = topic.is_leaf
    ? []
    : topic.children
        .map((id) => topics.find((t) => t.topic_id === id))
        .filter((t): t is TopicPage => t !== undefined)
  return (
    <li style={{ paddingLeft: depth * 20, marginBottom: 6 }}>
      <Link href={`/topics/${topic.topic_id}`} className="num">
        {topic.topic_id}
      </Link>{" "}
      <span className="muted">
        {topic.label} · {topic.video_count} videos · {topic.creator_count} creators
      </span>{" "}
      {topic.is_leaf ? (
        opp ? (
          <VerdictBadge verdict={opp.verdict} />
        ) : (
          <span className="chip">not scored</span>
        )
      ) : (
        <span className="chip">parent</span>
      )}
      {children.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
          {children.map((c) => (
            <TopicNode key={c.topic_id} topic={c} topics={topics} opps={opps} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
