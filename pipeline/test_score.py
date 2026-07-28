import pytest

from pipeline import score, verdict
from pipeline.conftest import FIXTURE_THRESHOLDS as T

SC = T["scoring"]


def canonical_inputs():
    """The real 2026-07-27 numbers from spec §5."""
    return {"repo_velocity": 266.0, "keyword_volume": 8100,
            "supply_gap": 2, "staleness": 6}


def test_the_weights_sum_to_one_hundred():
    assert sum(SC["weights"].values()) == 100


def test_each_component_normalizes_and_caps_at_one():
    assert score.normalize("repo_velocity", 266.0, SC["full_scale"]) == 0.89
    assert score.normalize("repo_velocity", 9000.0, SC["full_scale"]) == 1.0
    assert score.normalize("keyword_volume", 8100, SC["full_scale"]) == 0.54
    assert score.normalize("keyword_volume", 99000, SC["full_scale"]) == 1.0
    assert score.normalize("supply_gap", 2, SC["full_scale"]) == 0.83
    assert score.normalize("supply_gap", 40, SC["full_scale"]) == 0.0
    assert score.normalize("staleness", 6, SC["full_scale"]) == 0.2
    assert score.normalize("staleness", 400, SC["full_scale"]) == 1.0


def test_the_worked_example_reproduces_71_point_9():
    """Declared canonical in spec §5: every bundle and every UI surface must reproduce this."""
    row = verdict.for_topic("mcp-registry-integration", videos=2, creators=2,
                            keyword_volume=8100, repo_velocity=266.0, thresholds=T)
    out = score.for_topic(row, canonical_inputs(), T)
    assert out["value"] == 71.9
    assert out["out_of"] == 100
    points = {c["key"]: c["points"] for c in out["components"]}
    assert points == {"repo_velocity": 35.6, "keyword_volume": 13.5,
                      "supply_gap": 20.8, "staleness": 2.0}


def test_every_component_carries_its_raw_label_and_source():
    row = verdict.for_topic("t", 2, 2, 8100, 266.0, T)
    by_key = {c["key"]: c for c in score.for_topic(row, canonical_inputs(), T)["components"]}
    assert by_key["repo_velocity"]["raw_label"] == "266 stars/day"
    assert by_key["repo_velocity"]["source"] == "github"
    assert by_key["keyword_volume"]["raw_label"] == "8,100 searches/mo"
    assert by_key["supply_gap"]["raw_label"] == "2 videos / 90d"
    assert by_key["staleness"]["raw_label"] == "newest 6d ago"


def test_a_missing_component_drops_its_weight_and_out_of_reads_75():
    row = verdict.for_topic("t", 2, 2, None, 266.0, T)
    out = score.for_topic(row, {**canonical_inputs(), "keyword_volume": None}, T)
    assert out["out_of"] == 75
    missing = next(c for c in out["components"] if c["key"] == "keyword_volume")
    assert missing["state"] == "no_data" and missing["points"] is None
    assert out["value"] == 58.4                # 35.6 + 20.8 + 2.0


def test_insufficient_data_scores_null_not_zero():
    row = verdict.for_topic("t", 1, 1, None, None, T)
    out = score.for_topic(row, {"repo_velocity": None, "keyword_volume": None,
                                "supply_gap": 1, "staleness": 41}, T)
    assert row["verdict"] == "INSUFFICIENT_DATA"
    assert out["value"] is None and out["out_of"] is None


def test_a_topic_with_zero_videos_gets_staleness_norm_one():
    row = verdict.for_topic("t", 0, 0, 8100, None, T)
    out = score.for_topic(row, {"repo_velocity": None, "keyword_volume": 8100,
                                "supply_gap": 0, "staleness": None}, T)
    stale = next(c for c in out["components"] if c["key"] == "staleness")
    assert stale["norm"] == 1.0 and stale["raw_label"] == "never covered"


def test_the_score_never_contradicts_its_own_verdict():
    """A MAKE_THIS_NOW must outscore a SKIP built from the same machinery."""
    make = verdict.for_topic("a", 2, 2, 8100, 266.0, T)
    skip = verdict.for_topic("b", 14, 9, 100, 5.0, T)
    make_score = score.for_topic(make, canonical_inputs(), T)["value"]
    skip_score = score.for_topic(
        skip, {"repo_velocity": 5.0, "keyword_volume": 100, "supply_gap": 14,
               "staleness": 1}, T)["value"]
    assert make["verdict"] == "MAKE_THIS_NOW" and skip["verdict"] == "SKIP"
    assert make_score > skip_score


def test_the_indie_score_and_the_hunch_flag_never_enter_the_score():
    row = verdict.for_topic("t", 2, 2, 8100, 266.0, T)
    plain = score.for_topic(row, canonical_inputs(), T)
    with_extras = score.for_topic(row, {**canonical_inputs(), "indie": 1.0, "hunch": True}, T)
    assert plain["value"] == with_extras["value"]
    assert {c["key"] for c in with_extras["components"]} == set(SC["weights"])


def test_normalize_rejects_an_unknown_component():
    with pytest.raises(KeyError):
        score.normalize("vibes", 1, SC["full_scale"])
