import { notFound } from "next/navigation"
import {
  loadChannels,
  loadMeta,
  loadOpportunities,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { creatorTrail, findOpp, findTopic } from "@/lib/topic"
import { TopicLeaf } from "@/components/topic-leaf"

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const topic = findTopic(loadTopicPages().topics, id)
  if (!topic) notFound()

  if (!topic.is_leaf) {
    // Task 11 replaces this branch with the full parent view.
    return (
      <header className="topichead">
        <div className="trow">
          <h1 className="num">{topic.topic_id}</h1>
          <span className="chip">parent · not scoreable</span>
        </div>
        <p className="note">
          {topic.label} · {topic.leaf_count} leaf topics · {topic.video_count} videos ·{" "}
          {topic.creator_count} creators
        </p>
      </header>
    )
  }

  const channels = loadChannels().channels
  const videos = videosById(topic.video_ids)
  return (
    <TopicLeaf
      topic={topic}
      opp={findOpp(loadOpportunities().rows, id)}
      videos={videos}
      trail={creatorTrail(videos, channels)}
      commentHealth={loadMeta().comment_health}
    />
  )
}
