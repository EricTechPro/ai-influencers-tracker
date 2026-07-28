"""The verdict grid. One supply vocabulary, one demand vocabulary, one cell.

Only leaves reach this function. "Claude Code" can never win a MAKE_THIS_NOW, which is the
entire point of the tree having a leaf rule at all.
"""
from __future__ import annotations

GRID = {
    ("HIGH", "OPEN"): "MAKE_THIS_NOW",
    ("HIGH", "MID"): "MAKE_THIS_NOW",
    ("HIGH", "CROWDED"): "ONLY_IF_UNSERVED",
    ("LOW", "OPEN"): "TOO_EARLY",
    ("LOW", "MID"): "TOO_EARLY",
    ("LOW", "CROWDED"): "SKIP",
}
INSUFFICIENT = "INSUFFICIENT_DATA"


class NotScoreable(RuntimeError):
    pass


def supply_band(videos: int, creators: int, supply_thresholds: dict) -> dict:
    fired: list[str] = []
    open_max = supply_thresholds["open_max_videos"]
    crowded_videos = supply_thresholds["crowded_min_videos"]
    crowded_creators = supply_thresholds["crowded_min_creators"]
    if videos <= open_max:
        band = "OPEN"
        fired.append(f"videos <= {open_max}")
    elif videos >= crowded_videos and creators >= crowded_creators:
        band = "CROWDED"
        fired.extend([f"videos >= {crowded_videos}", f"creators >= {crowded_creators}"])
    else:
        band = "MID"
        fired.append(f"videos > {open_max}")
    return {"band": band, "videos": videos, "creators": creators,
            "window_days": supply_thresholds["window_days"], "fired": fired}


def demand_band(keyword_volume: int | None, repo_velocity: float | None,
                demand_thresholds: dict) -> dict:
    """HIGH on EITHER axis. Neither axis known is UNKNOWN, which is not the same as LOW."""
    min_volume = demand_thresholds["high_min_keyword_volume"]
    min_velocity = demand_thresholds["high_min_repo_velocity"]
    fired: list[str] = []
    if keyword_volume is None and repo_velocity is None:
        band = "UNKNOWN"
    else:
        if keyword_volume is not None and keyword_volume >= min_volume:
            fired.append(f"keyword_volume >= {min_volume}")
        if repo_velocity is not None and repo_velocity >= min_velocity:
            fired.append(f"repo_velocity >= {min_velocity}")
        band = "HIGH" if fired else "LOW"
        if band == "LOW":
            if keyword_volume is not None:
                fired.append(f"keyword_volume < {min_volume}")
            if repo_velocity is not None:
                fired.append(f"repo_velocity < {min_velocity}")
    return {"band": band, "keyword_volume": keyword_volume,
            "repo_velocity": repo_velocity, "fired": fired}


def decide(supply: dict, demand: dict) -> str:
    if demand["band"] == "UNKNOWN" or supply["band"] == "UNKNOWN":
        return INSUFFICIENT
    return GRID[(demand["band"], supply["band"])]


def for_topic(topic_id: str, videos: int, creators: int, keyword_volume: int | None,
              repo_velocity: float | None, thresholds: dict, is_leaf: bool = True) -> dict:
    if not is_leaf:
        raise NotScoreable(f"{topic_id} is a parent: parents are never scored or banded")
    supply = supply_band(videos, creators, thresholds["supply"])
    demand = demand_band(keyword_volume, repo_velocity, thresholds["demand"])
    return {"topic_id": topic_id, "supply": supply, "demand": demand,
            "verdict": decide(supply, demand)}
