"""Repo-wide invariants. These fail the build rather than allowing a rule to rot quietly."""
from __future__ import annotations

import ast
import pathlib
import sys

import pytest

from pipeline.conftest import ait_root  # noqa: F401  # makes the fixture visible here too

ROOT = pathlib.Path(__file__).parent
PIPELINE = ROOT / "pipeline"
SKILLS = ROOT / ".agents" / "skills"

FORBIDDEN_SUBSTRINGS = [
    "oauth", "refresh_token", "client_secret", "comments.insert",
    "captions/download", "captions.download", "search.list",
]


def _python_files(base: pathlib.Path) -> list[pathlib.Path]:
    return [] if not base.exists() else sorted(base.rglob("*.py"))


def _imported_roots(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text())
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:                       # relative import, stays inside the package
                continue
            if node.module:
                roots.add(node.module.split(".")[0])
    return roots


@pytest.mark.parametrize("path", _python_files(PIPELINE), ids=lambda p: p.name)
def test_pipeline_imports_stdlib_only(path):
    # pytest itself is the one allowed exception: it is the test runner, not a
    # runtime dependency of pipeline/, and pipeline/'s own tests live beside the code.
    allowed = set(sys.stdlib_module_names) | {"pipeline", "pytest"}
    offenders = _imported_roots(path) - allowed
    assert not offenders, f"{path.name} imports non-stdlib {sorted(offenders)}"


@pytest.mark.parametrize("path", _python_files(PIPELINE), ids=lambda p: p.name)
def test_pipeline_never_imports_a_skill_or_the_web(path):
    text = path.read_text()
    assert "skills." not in text and "from web" not in text, f"{path.name} reaches forward"


def test_a_skill_never_imports_another_skill():
    for path in _python_files(SKILLS):
        skill_name = path.relative_to(SKILLS).parts[0]
        for other in {p.name for p in SKILLS.iterdir() if p.is_dir()} - {skill_name}:
            assert other.replace("-", "_") not in _imported_roots(path), (
                f"{path} imports another skill ({other})"
            )


@pytest.mark.parametrize("path", _python_files(PIPELINE) + _python_files(SKILLS),
                         ids=lambda p: p.name)
def test_no_oauth_or_banned_call_anywhere(path):
    text = path.read_text().lower()
    for needle in FORBIDDEN_SUBSTRINGS:
        assert needle not in text, f"{path.name} references {needle!r}, which is cut by design"


def test_thresholds_version_matches_meta_when_meta_exists():
    from pipeline import config, util
    meta = util.read_json(config.db_dir() / "meta.json")
    if meta is None:
        pytest.skip("_db/meta.json not built yet")
    assert meta["thresholds_version"] == config.thresholds()["version"]


def test_a_full_build_never_writes_into_config(ait_root):  # noqa: F811
    """The invariant, checked by hashing the tree rather than by grepping for open()."""
    import datetime as dt

    from pipeline import build_data, snapshot, util

    today = dt.date(2026, 7, 27)
    snapshot.write_channel_snapshot(
        {"UCcole": {"date": "2026-07-27", "status": "ok", "view_count": 1,
                    "subscriber_count": 219000, "subscriber_bucket": 1000,
                    "video_count": 1, "source": "youtube_api"}}, today)
    before = util.tree_hashes(config_dir_for_test())
    build_data.build(today=today)
    assert util.tree_hashes(config_dir_for_test()) == before


def config_dir_for_test():
    from pipeline import config
    return config.config_dir()
