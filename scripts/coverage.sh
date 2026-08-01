#!/bin/sh
# Runs the pipeline tests under coverage and prints the source-only report, worst-covered first.
# NOT run by any pipeline code, test, or the daily sweep; this is a by-hand check.
#
# pytest-cov is deliberately not installed. Rule 4 (standard library first) applies to `pipeline/`,
# and a coverage plugin is a dev tool that no shipped code imports. `uv run --no-project` builds a
# throwaway env per invocation, so nothing lands in the system Python (which PEP 668 blocks anyway)
# or in this repo.
#
# Usage:
#   scripts/coverage.sh          term report, source only, sorted by coverage
#   scripts/coverage.sh --html   also writes htmlcov/index.html
set -e
cd "$(dirname "$0")/.."

if ! command -v uv >/dev/null 2>&1; then
    echo "error: uv not found. Install it with \`brew install uv\`." >&2
    exit 1
fi

# Measure pipeline/ and scripts/. The test files themselves are measured too and then omitted from
# the report below, because coverage cannot exclude a file it never traced.
uv run --no-project --with pytest --with pytest-cov \
    pytest -q --cov=pipeline --cov=scripts --cov-report=

uv run --no-project --with coverage \
    coverage report --omit="*/test_*.py,*/conftest.py" --show-missing --sort=cover

if [ "$1" = "--html" ]; then
    uv run --no-project --with coverage \
        coverage html --omit="*/test_*.py,*/conftest.py"
    echo "wrote htmlcov/index.html"
fi
