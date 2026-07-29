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
    terms: tuple[str, ...]
    channels: frozenset[str]

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
        title = video.get("title")
        if not title:
            return False
        return any(pattern.search(title) for pattern in _patterns(self.terms))


def _patterns(terms: tuple[str, ...]) -> list[re.Pattern]:
    return [re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE) for term in terms]


def load() -> Rules:
    raw = config.optional("exclusions.json")
    return Rules(
        topics=frozenset(raw.get("topics") or []),
        terms=tuple(raw.get("terms") or []),
        channels=frozenset(raw.get("channels") or []),
    )
