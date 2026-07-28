"""What Eric has taken off the board, and the promise that taking it off is visible."""
from __future__ import annotations

from pipeline import exclusions

EXCLUSIONS = {
    "version": 1,
    "topics": ["n8n-agent-workflows"],
    "terms": ["openclaw", "open claw"],
    "channels": ["UCdan"],
}


def test_an_absent_file_excludes_nothing(ait_root):
    """The config is optional. A missing file is "exclude nothing", never a crash: every other
    layer keeps working for someone who has not written one."""
    rules = exclusions.load()
    assert rules.topics == frozenset()
    assert rules.terms == ()
    assert rules.channels == frozenset()
    assert rules.excludes_video({"title": "anything", "channel_id": "UCcole"}) is False


def test_a_title_term_is_matched_case_insensitively(ait_root, write_config):
    write_config("exclusions.json", EXCLUSIONS)
    rules = exclusions.load()
    assert rules.excludes_video({"title": "OpenClaw Tutorial for Beginners",
                                 "channel_id": "UCcole"}) is True
    assert rules.excludes_video({"title": "open claw, spaced",
                                 "channel_id": "UCcole"}) is True
    assert rules.excludes_video({"title": "Wiring MCP servers",
                                 "channel_id": "UCcole"}) is False


def test_a_muted_channel_is_excluded_without_being_untracked(ait_root, write_config):
    """The softer form of channels.json's tracked:false: the sweep still collects this channel,
    the surfaces just stop showing it."""
    write_config("exclusions.json", EXCLUSIONS)
    rules = exclusions.load()
    assert rules.excludes_video({"title": "fine", "channel_id": "UCdan"}) is True
    assert rules.excludes_video({"title": "fine", "channel_id": "UCcole"}) is False


def test_a_term_does_not_match_inside_a_longer_word(ait_root, write_config):
    """"open claw" must not fire on "openclawback". Substring matching is blunt and this is the
    one place it would read as a false claim about what the video is."""
    write_config("exclusions.json", EXCLUSIONS)
    rules = exclusions.load()
    assert rules.excludes_video({"title": "openclawback explained",
                                 "channel_id": "UCcole"}) is False


def test_topics_are_a_set_of_leaf_ids(ait_root, write_config):
    write_config("exclusions.json", EXCLUSIONS)
    rules = exclusions.load()
    assert rules.excludes_topic("n8n-agent-workflows") is True
    assert rules.excludes_topic("claude-code-mcp-setup") is False


def test_a_missing_title_is_not_a_match(ait_root, write_config):
    """A row with no title is missing data, not a hit. Treating None as "" and matching on it
    would silently drop videos for the one reason nobody chose."""
    write_config("exclusions.json", EXCLUSIONS)
    rules = exclusions.load()
    assert rules.excludes_video({"title": None, "channel_id": "UCcole"}) is False
