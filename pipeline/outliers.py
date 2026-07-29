"""vidIQ breakout scores for the roster. Metered, so it lands in _synthesize/, never _raw/.

The score is vidIQ's, not ours. pipeline/multiplier.py still serves the taxonomy shelves; this
module exists because our median-over-mature-uploads baseline disagreed with vidIQ by roughly 2x
on every shared video, and vidIQ additionally normalises by video age, which we cannot do until
the snapshot series exists. See docs/superpowers/specs/2026-07-28-topics-recent-feed-design.md.
"""
from __future__ import annotations

# vidIQ rejects a 72-id request and accepts a 24-id one. Verified live 2026-07-29. This is a
# vendor constraint, not a tuning knob, which is why it is a constant and not in thresholds.json.
BATCH_SIZE = 24
OUTLIER_COST = 5


def batches(channel_ids: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    """The roster split into requests vidIQ will actually accept, order preserved."""
    return [channel_ids[i:i + size] for i in range(0, len(channel_ids), size)]
