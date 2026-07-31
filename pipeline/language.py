"""What language a video is in, and how confidently we know it.

Two signals, and the tier says which one answered. `defaultAudioLanguage` is the uploader's own
declaration, carried in the videos.list snippet the sweep already pays for — Oracle. The CJK share
of the title is a rule this project applies — Derived, and it ships the rule that produced it.
Neither firing is `unread`: its own state, never folded into en.

This is not the channel's `lang` in config/channels.json, which is hand-authored, one value per
channel, and is what /channels filters on. A channel that posts in both scripts has one value
there and a correct one per video here.

Nothing here reads a transcript or a description. Measured over the corpus on 2026-07-31, a title
check misreads 6 videos out of 11,859, and extraction is behind step 13's hard gate.
"""
from __future__ import annotations

import re

#: The bucket a video with no readable language falls in. Not a language.
NO_LANG = "none"

# CJK Unified Ideographs, Extension A, and the compatibility block. Kana and Hangul are
# deliberately absent: this board tracks an English and a Chinese scene, and a Japanese title
# should read as its own code from a declaration rather than be folded into zh by script alone.
_CJK = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def _primary_subtag(tag: str) -> str:
    """`zh-Hant` and `ZH-hans` are both zh. A tag this project has no opinion on carries through."""
    return tag.strip().lower().split("-")[0]


def cjk_share(title: str) -> float:
    """CJK characters as a share of the title's alphanumerics. 0.0 when there is nothing to count.

    The denominator is alphanumerics rather than the whole string so that punctuation, emoji, and
    the spaces around a Latin product name cannot dilute a Chinese sentence below the threshold.
    """
    letters = [c for c in title if c.isalnum()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if _CJK.match(c)) / len(letters)


def detect(title: str | None, default_audio_language: str | None,
           threshold: float) -> tuple[str, str]:
    """Returns (lang, tier). tier is one of "oracle", "derived", "unread"."""
    if default_audio_language:
        return _primary_subtag(default_audio_language), "oracle"
    if not title:
        return NO_LANG, "unread"
    if not any(c.isalnum() for c in title):
        return NO_LANG, "unread"
    return ("zh" if cjk_share(title) >= threshold else "en"), "derived"
