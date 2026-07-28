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
