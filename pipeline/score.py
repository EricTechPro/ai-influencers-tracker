"""The 0-100 opportunity score. Four weighted components, none of them an estimate.

repo_velocity carries 40 because it is the only leading signal in the product. All four are
Derived tier and render their own formula, which is why every component ships raw, norm, weight,
points and source rather than just a number.

Rounding is part of the contract: norm to 2dp, points to 1dp, value is the sum of the rounded
points. That is what makes the canonical example land on exactly 71.9.
"""
from __future__ import annotations

import decimal

SOURCES = {"repo_velocity": "github", "keyword_volume": "vidiq",
           "supply_gap": "youtube", "staleness": "youtube"}


def _round(value: float, places: int) -> float:
    quantum = decimal.Decimal(1).scaleb(-places)
    return float(decimal.Decimal(repr(value)).quantize(quantum, rounding=decimal.ROUND_HALF_UP))


def normalize(key: str, raw: float, full_scale: dict) -> float:
    if key == "repo_velocity":
        norm = min(1.0, raw / full_scale["repo_velocity_stars_per_day"])
    elif key == "keyword_volume":
        norm = min(1.0, raw / full_scale["keyword_volume_searches"])
    elif key == "supply_gap":
        norm = max(0.0, 1 - raw / full_scale["supply_gap_max_videos"])
    elif key == "staleness":
        norm = min(1.0, raw / full_scale["staleness_days"])
    else:
        raise KeyError(f"unknown score component {key!r}")
    return _round(norm, 2)


def _raw_label(key: str, raw, window_days: int) -> str:
    if key == "repo_velocity":
        return f"{raw:,.0f} stars/day"
    if key == "keyword_volume":
        return f"{raw:,} searches/mo"
    if key == "supply_gap":
        return f"{raw} videos / {window_days}d"
    return "never covered" if raw is None else f"newest {raw}d ago"


def component(key: str, raw, raw_label: str | None, source: str, scoring_thresholds: dict) -> dict:
    """One row of the components list: normalize, weight, points, in one place."""
    weight = scoring_thresholds["weights"][key]
    if raw is None:
        return {"key": key, "raw": None, "raw_label": None, "norm": None,
                "weight": weight, "points": None, "source": source, "state": "no_data"}
    norm = normalize(key, raw, scoring_thresholds["full_scale"])
    points = _round(norm * weight, 1)
    return {"key": key, "raw": raw, "raw_label": raw_label, "norm": norm,
            "weight": weight, "points": points, "source": source, "state": "ok"}


def compute(components: list[dict], verdict_value: str) -> dict:
    """Sum the rounded points; out_of is the sum of weights that actually scored."""
    if verdict_value == "INSUFFICIENT_DATA":
        return {"value": None, "out_of": None, "components": components}
    out_of = sum(c["weight"] for c in components if c["state"] == "ok")
    total = sum(c["points"] for c in components if c["state"] == "ok")
    return {"value": _round(total, 1) if out_of else None,
            "out_of": out_of or None, "components": components}


def for_topic(verdict_row: dict, inputs: dict, thresholds: dict) -> dict:
    """The opportunities.json score block. INSUFFICIENT_DATA scores null, never zero."""
    scoring = thresholds["scoring"]
    weights = scoring["weights"]
    window_days = verdict_row["supply"]["window_days"]

    if verdict_row["verdict"] == "INSUFFICIENT_DATA":
        components = [{"key": key, "raw": inputs.get(key), "raw_label": None, "norm": None,
                       "weight": weights[key], "points": None, "source": SOURCES[key],
                       "state": "no_data"} for key in weights]
        return compute(components, verdict_row["verdict"])

    components = []
    for key in weights:
        raw = inputs.get(key)
        # A topic nobody has covered is maximally stale, and that is a fact, not a gap.
        zero_videos = key == "staleness" and raw is None and verdict_row["supply"]["videos"] == 0
        if raw is None and zero_videos:
            raw_label = _raw_label(key, None, window_days)
            norm = 1.0
            points = _round(norm * weights[key], 1)
            components.append({"key": key, "raw": None, "raw_label": raw_label, "norm": norm,
                               "weight": weights[key], "points": points, "source": SOURCES[key],
                               "state": "ok"})
            continue
        raw_label = _raw_label(key, raw, window_days) if raw is not None else None
        components.append(component(key, raw, raw_label, SOURCES[key], scoring))
    return compute(components, verdict_row["verdict"])
