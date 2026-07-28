"""Growth math. Everything here is Derived tier and must render its own formula.

YouTube rounds subscriberCount to three significant figures for every channel you do not own,
so the bucket width is always about 0.1% of the count. Counts below 1,000 are exact.
"""
from __future__ import annotations


def bucket_width(subscriber_count: int | None) -> int | None:
    """The rounding granularity YouTube applied. 219,000 -> 1,000. 2,380 -> 10. None -> None."""
    if subscriber_count is None:
        return None
    count = int(subscriber_count)
    if count < 1000:
        return 1
    return 10 ** (len(str(count)) - 3)
