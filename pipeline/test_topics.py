import pytest

from pipeline import topics


def test_only_childless_nodes_are_leaves(ait_root):
    index = topics.load()
    assert topics.is_leaf(index["claude-code-mcp-setup"])
    assert not topics.is_leaf(index["claude-code"])
    assert {t.id for t in topics.leaves(index)} == {
        "claude-code-mcp-setup", "claude-code-subagents",
        "frontier-model-launches", "mcp-registry-integration",
    }


def test_a_leaf_at_the_root_is_still_a_leaf(ait_root):
    """Arbitrary depth: mcp-registry-integration has no parent and no children."""
    index = topics.load()
    node = index["mcp-registry-integration"]
    assert node.parent_id is None and node.depth == 0 and topics.is_leaf(node)


def test_arbitrary_depth_is_walked(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "children": [
            {"id": "b", "label": "B", "children": [
                {"id": "c", "label": "C", "shape": "tutorial", "aliases": ["deep"]}]}]}]})
    index = topics.load()
    assert index["c"].depth == 2 and index["c"].parent_id == "b"
    assert [t.id for t in topics.leaves(index)] == ["c"]


def test_a_parent_carrying_a_shape_is_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "tutorial", "children": [
            {"id": "b", "label": "B", "shape": "tutorial", "aliases": ["x"]}]}]})
    with pytest.raises(topics.TopicError, match="only leaves carry shape"):
        topics.load()


def test_a_leaf_without_a_valid_shape_is_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "explainer", "aliases": ["x"]}]})
    with pytest.raises(topics.TopicError, match="tutorial|review"):
        topics.load()


def test_duplicate_ids_are_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "review", "aliases": ["x"]},
        {"id": "a", "label": "A again", "shape": "review", "aliases": ["y"]}]})
    with pytest.raises(topics.TopicError, match="duplicate topic id"):
        topics.load()


def test_leaf_becoming_a_parent_warns_and_lists_its_videos(write_config):
    """Adding a child silently demotes a leaf, so the pipeline says so and re-matches."""
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "claude-code", "label": "Claude Code", "children": [
            {"id": "claude-code-mcp-setup", "label": "MCP", "children": [
                {"id": "mcp-http", "label": "HTTP", "shape": "tutorial",
                 "aliases": ["http mcp"]}]}]}]})
    index = topics.load()
    previous = [{"video_id": "v1", "topic_id": "claude-code-mcp-setup"},
                {"video_id": "v2", "topic_id": "claude-code-mcp-setup"}]
    demotions = topics.detect_demotions(index, previous)
    assert demotions == [{"topic_id": "claude-code-mcp-setup",
                          "video_ids": ["v1", "v2"],
                          "new_children": ["mcp-http"]}]


def test_validate_raises_when_a_parent_carries_a_shape():
    index = {
        "a": topics.Topic(id="a", label="A", shape="tutorial", aliases=(),
                           parent_id=None, children_ids=("b",), depth=0),
        "b": topics.Topic(id="b", label="B", shape="tutorial", aliases=("x",),
                           parent_id="a", children_ids=(), depth=1),
    }
    with pytest.raises(topics.TopicError, match="only leaves carry shape"):
        topics.validate(index)


def test_validate_raises_when_a_leaf_has_an_invalid_shape():
    index = {
        "a": topics.Topic(id="a", label="A", shape="explainer", aliases=("x",),
                           parent_id=None, children_ids=(), depth=0),
    }
    with pytest.raises(topics.TopicError, match="tutorial|review"):
        topics.validate(index)


def test_validate_warns_when_two_leaves_share_an_alias():
    index = {
        "a": topics.Topic(id="a", label="A", shape="tutorial", aliases=("x",),
                           parent_id=None, children_ids=(), depth=0),
        "b": topics.Topic(id="b", label="B", shape="review", aliases=("x",),
                           parent_id=None, children_ids=(), depth=0),
    }
    assert topics.validate(index) == ["alias 'x' is shared by 'a' and 'b'"]


def test_validate_of_a_clean_index_returns_no_warnings(ait_root):
    index = topics.load()
    assert topics.validate(index) == []


def test_matching_is_n_to_m_with_exactly_one_primary(ait_root):
    index = topics.load()
    video = {"video_id": "v1",
             "title": "Claude Code subagent teams with MCP",
             "description": "wiring the model context protocol",
             "tags": ["agent team"]}
    assignments = topics.match_video(video, index)
    assert {a["topic_id"] for a in assignments} == {
        "claude-code-mcp-setup", "claude-code-subagents"}
    assert sum(1 for a in assignments if a["primary"]) == 1
    assert all(a["method"] == "keyword" for a in assignments)


def test_the_primary_is_the_topic_matched_in_the_title(ait_root):
    index = topics.load()
    video = {"video_id": "v1", "title": "Everything about subagents",
             "description": "also mentions mcp once", "tags": []}
    primary = next(a for a in topics.match_video(video, index) if a["primary"])
    assert primary["topic_id"] == "claude-code-subagents"
    assert primary["matched_on"] == ["title"]


def test_a_parent_is_never_matched(ait_root):
    index = topics.load()
    video = {"video_id": "v1", "title": "Claude Code in 2026", "description": "", "tags": []}
    assert all(topics.is_leaf(index[a["topic_id"]]) for a in topics.match_video(video, index))


def test_an_alias_only_matches_on_a_word_boundary(ait_root):
    """'mcp' must not match 'mcpherson'."""
    index = topics.load()
    video = {"video_id": "v1", "title": "Interview with Sam Mcpherson",
             "description": "", "tags": []}
    assert topics.match_video(video, index) == []


def test_coverage_rate_is_assigned_over_total(ait_root):
    videos = [{"video_id": "v1"}, {"video_id": "v2"}, {"video_id": "v3"}, {"video_id": "v4"}]
    assignments = [{"video_id": "v1", "topic_id": "x"}, {"video_id": "v1", "topic_id": "y"},
                   {"video_id": "v3", "topic_id": "x"}]
    assert topics.coverage_rate(videos, assignments) == 0.5


def test_coverage_rate_of_an_empty_roster_is_none_not_zero(ait_root):
    assert topics.coverage_rate([], []) is None


def test_rollup_counts_reach_every_ancestor(ait_root):
    index = topics.load()
    rolled = topics.rollup(index, {"claude-code-mcp-setup": {"videos": 9, "creators": 7},
                                   "claude-code-subagents": {"videos": 4, "creators": 3}})
    assert rolled["claude-code"] == {"videos": 13, "creators": 10, "leaves": 2}
    assert "claude-code-mcp-setup" not in rolled


SIMPLE_TREE = {
    "version": 1,
    "topics": [{"id": "n8n", "label": "n8n agent workflows", "shape": "tutorial",
                "aliases": ["zapier", "n8n"]}],
}


def test_membership_requires_more_than_a_passing_mention_in_a_description():
    """A description is a link dump, a sponsor blurb and a tool list. "OpenClaw Tutorial for
    Beginners" says "zapier" once in its description and was thereby filed under n8n agent
    workflows, where it showed up on the shelf next to actual n8n tutorials.

    Across the roster that was 7,317 of 16,113 assignments — 45% — and those counts are what the
    supply band is computed from, so a passing mention was inflating how crowded every topic
    looked. build_data already draws this line for own-coverage ("a description or tags mention
    is too weak to suppress an opportunity"); membership is the same question.
    """
    strong = {"topic_id": "t", "confidence": 0.6, "matched_on": ["title", "description"]}
    tagged = {"topic_id": "t", "confidence": 0.45, "matched_on": ["tags"]}
    weak = {"topic_id": "t", "confidence": 0.3, "matched_on": ["description"]}
    assert topics.is_member(strong, 0.45) is True
    assert topics.is_member(tagged, 0.45) is True
    assert topics.is_member(weak, 0.45) is False


def test_the_membership_floor_is_configurable_and_inclusive():
    weak = {"topic_id": "t", "confidence": 0.3, "matched_on": ["description"]}
    # A build that wants the old behaviour back sets the floor to the description tier.
    assert topics.is_member(weak, 0.3) is True


def test_a_video_matching_only_on_description_still_records_the_assignment():
    """The weak match is real evidence and stays in videos.json; it just stops counting as
    membership. Dropping it would lose the only trace of why the video was ever a candidate."""
    index = topics.load(SIMPLE_TREE)
    video = {"title": "Something else entirely", "tags": [],
             "description": "I also use zapier sometimes"}
    rows = topics.match_video(video, index)
    assert [r["topic_id"] for r in rows] == ["n8n"]
    assert rows[0]["matched_on"] == ["description"]
    assert topics.is_member(rows[0], 0.45) is False


def test_a_leaf_carries_the_phrase_people_actually_search(ait_root, write_config):
    """The keyword sweep asked vidIQ about the topic's full label, and nobody types "Wiring MCP
    servers into Claude Code" into YouTube. 16 of 22 topics came back 0 searches/mo — real
    answers to the wrong question. search_keyword is the phrase to ask about instead."""
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "parent", "label": "Parent", "children": [
            {"id": "leaf", "label": "Wiring MCP servers into Claude Code", "shape": "tutorial",
             "search_keyword": "claude code mcp", "aliases": ["mcp"]},
        ]},
    ]})
    index = topics.load()
    assert index["leaf"].search_keyword == "claude code mcp"


def test_a_leaf_without_one_falls_back_to_its_label(ait_root, write_config):
    """Optional on purpose: a topic whose label is already what people type needs no second
    field, and a missing one must not silently sweep an empty string."""
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "parent", "label": "Parent", "children": [
            {"id": "leaf", "label": "RAG pipelines", "shape": "tutorial", "aliases": ["rag"]},
        ]},
    ]})
    assert topics.load()["leaf"].search_keyword == "RAG pipelines"
