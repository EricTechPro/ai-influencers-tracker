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


def detect(title: str | None, default_audio_language: str | None, threshold: float,
           description: str | None = None) -> tuple[str, str]:
    """Returns (lang, tier). tier is one of "oracle", "derived", "unread".

    The description breaks a tie, and only a tie. A title carrying some CJK but not enough to
    clear the threshold is the one case where the title genuinely cannot answer: a Chinese
    sentence padded out by a long Latin product name and a run of hashtags reads as English on
    character share alone. `Claude Code 一键切换到 DeepSeek (CC Switch) #Shorts #claudecode` is
    0.09 of a threshold of 0.10, and its description is 0.44.

    It is deliberately not consulted for an all-Latin title. Chinese creators put the same
    Chinese membership boilerplate under every upload, including their genuinely English ones, so
    a description-first rule would relabel a whole channel on the strength of a footer. Zero
    all-Latin titles in the corpus currently have a Chinese description, and this keeps it that
    way by construction rather than by luck.
    """
    if default_audio_language:
        return _primary_subtag(default_audio_language), "oracle"
    if not title:
        return NO_LANG, "unread"
    if not any(c.isalnum() for c in title):
        return NO_LANG, "unread"
    share = cjk_share(title)
    if share >= threshold:
        return "zh", "derived"
    if share > 0 and description and cjk_share(description) >= threshold:
        return "zh", "derived"
    return "en", "derived"
