import pytest

from pipeline import verdict
from pipeline.conftest import FIXTURE_THRESHOLDS as T

S, D = T["supply"], T["demand"]


def test_supply_bands_at_every_boundary():
    assert verdict.supply_band(0, 0, S)["band"] == "OPEN"
    assert verdict.supply_band(2, 2, S)["band"] == "OPEN"       # open_max_videos is 2
    assert verdict.supply_band(3, 2, S)["band"] == "MID"
    assert verdict.supply_band(4, 9, S)["band"] == "MID"
    assert verdict.supply_band(5, 3, S)["band"] == "CROWDED"    # both minimums must be met
    assert verdict.supply_band(5, 2, S)["band"] == "MID"        # creators short
    assert verdict.supply_band(9, 7, S)["band"] == "CROWDED"


def test_every_band_reports_the_comparison_that_fired():
    assert verdict.supply_band(2, 2, S)["fired"] == ["videos <= 2"]
    assert verdict.supply_band(9, 7, S)["fired"] == ["videos >= 5", "creators >= 3"]


def test_demand_is_high_on_either_axis():
    assert verdict.demand_band(8100, None, D)["band"] == "HIGH"
    assert verdict.demand_band(None, 266.0, D)["band"] == "HIGH"
    assert verdict.demand_band(100, 12.0, D)["band"] == "LOW"
    assert verdict.demand_band(5000, None, D)["fired"] == ["keyword_volume >= 5000"]
    assert verdict.demand_band(None, 100.0, D)["fired"] == ["repo_velocity >= 100.0"]


def test_demand_with_neither_axis_known_is_unknown_not_low():
    assert verdict.demand_band(None, None, D)["band"] == "UNKNOWN"


def test_all_six_cells_of_the_grid():
    grid = {
        ("HIGH", "OPEN"): "MAKE_THIS_NOW",
        ("HIGH", "MID"): "MAKE_THIS_NOW",
        ("HIGH", "CROWDED"): "ONLY_IF_UNSERVED",
        ("LOW", "OPEN"): "TOO_EARLY",
        ("LOW", "MID"): "TOO_EARLY",
        ("LOW", "CROWDED"): "SKIP",
    }
    for (demand, supply), expected in grid.items():
        assert verdict.decide({"band": supply}, {"band": demand}) == expected


def test_an_unknown_demand_axis_is_insufficient_data_in_every_supply_band():
    for supply in ("OPEN", "MID", "CROWDED"):
        assert verdict.decide({"band": supply}, {"band": "UNKNOWN"}) == "INSUFFICIENT_DATA"


def test_the_canonical_worked_example_lands_on_make_this_now():
    """2 videos / 90d, repo velocity 266. Spec §5's example, which must also score 71.9."""
    row = verdict.for_topic(topic_id="mcp-registry-integration", videos=2, creators=2,
                            keyword_volume=8100, repo_velocity=266.0, thresholds=T)
    assert row["verdict"] == "MAKE_THIS_NOW"
    assert row["supply"]["band"] == "OPEN" and row["demand"]["band"] == "HIGH"
    assert row["supply"]["window_days"] == 90


def test_a_low_video_count_does_not_by_itself_make_a_topic_insufficient():
    """Conflict C1: videos < 3 governs the TOPIC PAGE state, not the verdict."""
    row = verdict.for_topic("t", videos=1, creators=1, keyword_volume=8100,
                            repo_velocity=None, thresholds=T)
    assert row["verdict"] == "MAKE_THIS_NOW"


def test_a_parent_topic_can_never_be_banded():
    with pytest.raises(verdict.NotScoreable):
        verdict.for_topic("claude-code", videos=61, creators=22, keyword_volume=1,
                          repo_velocity=1, thresholds=T, is_leaf=False)
