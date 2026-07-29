"""Outlier fetching. Every test uses a fake transport; none ever spends a credit."""
from __future__ import annotations

from pipeline import outliers


def test_batches_splits_at_the_vendor_limit():
    ids = [f"UC{i:03d}" for i in range(72)]
    groups = outliers.batches(ids)
    assert len(groups) == 3
    assert [len(g) for g in groups] == [24, 24, 24]
    assert [i for g in groups for i in g] == ids


def test_batches_keeps_a_short_final_group():
    ids = [f"UC{i:03d}" for i in range(50)]
    groups = outliers.batches(ids)
    assert [len(g) for g in groups] == [24, 24, 2]


def test_batches_of_an_empty_roster_is_empty_not_one_empty_group():
    assert outliers.batches([]) == []
