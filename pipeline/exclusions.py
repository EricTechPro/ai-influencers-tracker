"""What Eric has taken off the board, read from config/exclusions.json.

Nothing here deletes anything. Every video stays in _raw/ and in _db/videos.json; these rules
decide only what the display surfaces render, and every count they shrink is reported in
meta.exclusions so the shrinkage is visible rather than silent. That split matters: the corpus is
the record of what the niche made, and it should not change shape because Eric stopped making one
kind of video.

The file is optional. A repo without one excludes nothing.
"""
from __future__ import annotations

import dataclasses
import re

from . import config


@dataclasses.dataclass(frozen=True)
class Rules:
    topics: frozenset[str]
    channels: frozenset[str]
    # One alternation compiled once at load, not a list rebuilt per call. excludes_video runs
    # against the whole corpus, so building the patterns inside it made the regex machinery the
    # dominant cost of two bundles. None when no terms are configured, which skips the search.
    terms: tuple[str, ...] = ()
    _pattern: re.Pattern | None = None

    def excludes_topic(self, topic_id: str) -> bool:
        return topic_id in self.topics

    def excludes_video(self, video: dict) -> bool:
        """Whether this video is off the board, by its channel or by its title.

        Matched on word boundaries, not bare substrings: "openclaw" must not fire on
        "openclawback". A blunt `in` would be a false claim about what the video is about, which
        is the one thing this repo will not do quietly.

        A missing title is not a match. Absent data is a state, and dropping a video because its
        title is None would be an exclusion nobody asked for.
        """
        if video.get("channel_id") in self.channels:
            return True
        if self._pattern is None:
            return False
        title = video.get("title")
        return bool(title) and self._pattern.search(title) is not None


def _compile(terms: tuple[str, ...]) -> re.Pattern | None:
    if not terms:
        return None
    alternation = "|".join(re.escape(term) for term in terms)
    return re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)


def load() -> Rules:
    raw = config.optional("exclusions.json")
    terms = tuple(raw.get("terms") or [])
    return Rules(
        topics=frozenset(raw.get("topics") or []),
        channels=frozenset(raw.get("channels") or []),
        terms=terms,
        _pattern=_compile(terms),
    )
