"""The refusals in ait-refresh, which are the only thing standing between a typo and 370 credits.

Lives at the project root rather than beside the script because pytest's default
`norecursedirs` skips dotted directories, so a test inside `.agents/` would never run --
and a money guard with a test that silently does not execute is worse than no test.

Every case here settles from disk, so the suite needs no API key and makes no billable
call. That is itself the invariant under test: a refused run must cost nothing.
"""
from __future__ import annotations

import importlib.util
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parent
SCRIPT = ROOT / ".agents" / "skills" / "ait-refresh" / "scripts" / "ait_refresh.py"


def _load():
    spec = importlib.util.spec_from_file_location("ait_refresh", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mod = _load()


@pytest.fixture
def no_network(monkeypatch):
    """Any billable path explodes. A passing test therefore proves nothing was spent."""
    def boom(*_a, **_k):
        raise AssertionError("refused run reached a billable call")
    monkeypatch.setattr(mod.vidiq, "client_from_env", boom)
    monkeypatch.setattr(mod.vidiq, "balance", boom)
    return boom


def test_both_jobs_at_once_is_refused(no_network):
    # 370 + 125 is over the 400 ceiling, so the guard would abort mid-run having
    # already spent. Refusing up front is what keeps that from being a partial charge.
    assert mod.main(["--sweep", "--backfill"]) == 2


def test_codex_without_a_job_is_refused(no_network):
    # The whole point of the offload: Codex changes where a job runs, never whether.
    assert mod.main(["--codex"]) == 2


def test_backfill_refused_when_every_channel_has_history(monkeypatch, no_network):
    monkeypatch.setattr(mod, "state", lambda: {"roster": 74, "backfill_missing": [],
                                               "last_sweep": "2026-08-08", "sweep_age_days": 6})
    assert mod.main(["--backfill"]) == 2


def test_backfill_allowed_to_reach_the_client_when_a_channel_is_missing(monkeypatch):
    """The refusal must be about missing data, not a blanket 'never backfill'."""
    monkeypatch.setattr(mod, "state", lambda: {"roster": 74, "backfill_missing": ["UC_gap"],
                                               "last_sweep": "2026-08-08", "sweep_age_days": 6})

    reached = []
    monkeypatch.setattr(mod.vidiq, "client_from_env", lambda: reached.append("client") or "c")
    monkeypatch.setattr(mod.vidiq, "balance", lambda _c: {"totalCredits": 1254})
    monkeypatch.setattr(mod, "run_job", lambda *_a: {"credits": 5, "channels": 1})
    monkeypatch.setattr(mod, "verify_ledger", lambda *_a: True)

    assert mod.main(["--backfill", "--no-build"]) == 0
    assert reached == ["client"]


def test_codex_never_reaches_the_vidiq_client(monkeypatch, no_network):
    """--codex hands the job to a subprocess; this process must not also bill for it."""
    monkeypatch.setattr(mod, "state", lambda: {"roster": 74, "backfill_missing": [],
                                               "last_sweep": "2026-08-08", "sweep_age_days": 6})
    seen = {}

    def fake_codex(job, timeout):
        seen["job"] = job
        return 0

    monkeypatch.setattr(mod, "via_codex", fake_codex)
    assert mod.main(["--sweep", "--codex"]) == 0
    assert seen["job"] == "sweep"


def test_ledger_mismatch_fails_the_run(monkeypatch, capsys):
    """A bill the preview never showed is the failure the preview exists to catch."""
    monkeypatch.setattr(mod.vidiq, "balance", lambda _c: {"totalCredits": 1100})
    assert mod.verify_ledger("c", 1254, 125) is False          # 154 spent, 125 previewed
    assert "MISMATCH" in capsys.readouterr().out

    monkeypatch.setattr(mod.vidiq, "balance", lambda _c: {"totalCredits": 1129})
    assert mod.verify_ledger("c", 1254, 125) is True           # 125 spent, 125 previewed


def test_ledger_mismatch_propagates_to_the_exit_code(monkeypatch):
    monkeypatch.setattr(mod, "state", lambda: {"roster": 74, "backfill_missing": [],
                                               "last_sweep": "2026-08-08", "sweep_age_days": 6})
    monkeypatch.setattr(mod.vidiq, "client_from_env", lambda: "c")
    monkeypatch.setattr(mod.vidiq, "balance", lambda _c: {"totalCredits": 1254})
    monkeypatch.setattr(mod, "run_job", lambda *_a: {"credits": 125, "topics": 25})
    monkeypatch.setattr(mod, "verify_ledger", lambda *_a: False)
    assert mod.main(["--sweep", "--no-build"]) == 1


def test_state_reports_missing_channels(monkeypatch, tmp_path):
    (tmp_path / "backfill").mkdir()
    (tmp_path / "backfill" / "UC_have.json").write_text("{}")
    (tmp_path / "keywords").mkdir()
    (tmp_path / "keywords" / "2026-08-08.json").write_text("{}")

    monkeypatch.setattr(mod.config, "raw_dir", lambda: tmp_path)
    monkeypatch.setattr(mod.config, "roster",
                        lambda: [{"channel_id": "UC_have"}, {"channel_id": "UC_gap"}])
    monkeypatch.setattr(mod.util, "today", lambda: __import__("datetime").date(2026, 8, 14))

    st = mod.state()
    assert st["backfill_missing"] == ["UC_gap"]
    assert st["last_sweep"] == "2026-08-08"
    assert st["sweep_age_days"] == 6
