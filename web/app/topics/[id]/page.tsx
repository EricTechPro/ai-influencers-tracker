import { notFound } from "next/navigation"
import {
  channelAvatarUrl,
  loadChannels,
  loadOpportunities,
  loadTopicComments,
  loadTopicPages,
  videosById,
} from "@/lib/bundles"
import { compareSortValues } from "@/lib/sort"
import { scoreSortValue } from "@/lib/opportunity"
import { videosPerWeek } from "@/lib/rollup"
import { creatorTrail, findOpp, findTopic } from "@/lib/topic"
import { TopicLeaf } from "@/components/topic-leaf"
import { TopicParent, type LeafSummary } from "@/components/topic-parent"
import type { LeafTopicPage } from "@/lib/types"

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const topic = findTopic(loadTopicPages().topics, id)
  if (!topic) notFound()

  if (!topic.is_leaf) {
    const topics = loadTopicPages().topics
    const opps = loadOpportunities().rows
    const leaves: LeafSummary[] = topic.children
      .map((childId) => findTopic(topics, childId))
      .filter((t): t is LeafTopicPage => t !== null && t.is_leaf)
      .map((leaf) => ({ leaf, opp: findOpp(opps, leaf.topic_id) }))
      .sort((a, b) =>
        compareSortValues(
          a.opp ? scoreSortValue(a.opp) : null,
          b.opp ? scoreSortValue(b.opp) : null,
          -1
        )
      )
    const publishedAts = leaves.flatMap(({ leaf }) =>
      videosById(leaf.video_ids).map((v) => v.published_at)
    )
    const weeks = Math.max(2, Math.round(topic.window_days / 7))
    return (
      <TopicParent topic={topic} leaves={leaves} points={videosPerWeek(publishedAts, weeks)} />
    )
  }

  const channels = loadChannels().channels
  const videos = videosById(topic.video_ids)
  const names = Object.fromEntries(channels.map((c) => [c.channel_id, c.name]))
  return (
    <TopicLeaf
      topic={topic}
      opp={findOpp(loadOpportunities().rows, id)}
      videos={videos}
      trail={creatorTrail(videos, channels, channelAvatarUrl)}
      topicComments={loadTopicComments(id)}
      creatorNames={names}
    />
  )
}
