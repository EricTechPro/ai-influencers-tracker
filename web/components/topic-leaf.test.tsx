// Fix round 1: C1's videos-below-min_videos gate (docs/spec.md:347,352,
// docs/system.md:525-526) is a topic_pages.state read the original brief
// omitted. A leaf below min_videos must say "N video(s), need M" instead of
// rendering as an ordinary scored topic.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { LeafTopicPage } from "@/lib/types"
import { TopicLeaf } from "./topic-leaf"

function leaf(overrides: Partial<LeafTopicPage>): LeafTopicPage {
  return {
    topic_id: "test-topic",
    label: "Test Topic",
    is_leaf: true,
    parent_id: null,
    shape: "tutorial",
    state: "ok",
    video_count: 5,
    creator_count: 3,
    min_videos: 3,
    newest_video_at: "2026-07-20T00:00:00Z",
    window_days: 90,
    video_ids: [],
    nodes: null,
    edges: null,
    ...overrides,
  }
}

function render(topic: LeafTopicPage) {
  return renderToStaticMarkup(
    <TopicLeaf topic={topic} opp={null} videos={[]} trail={[]}
      topicComments={null} creatorNames={{}} />
  )
}

describe("TopicLeaf: the consensus-gate shortfall is a page state, not a hidden route", () => {
  it("insufficient_data renders the real shortfall", () => {
    const html = render(leaf({ state: "insufficient_data", video_count: 1, min_videos: 3 }))
    expect(html).toContain("1 video, need 3")
  })

  it("a shortfall of more than one video pluralizes honestly", () => {
    const html = render(leaf({ state: "insufficient_data", video_count: 2, min_videos: 3 }))
    expect(html).toContain("2 videos, need 3")
  })

  it("an ok leaf never shows the shortfall callout", () => {
    const html = render(leaf({ state: "ok", video_count: 5, min_videos: 3 }))
    expect(html).not.toContain("need 3")
  })
})
