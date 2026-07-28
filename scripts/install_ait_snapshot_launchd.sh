#!/bin/sh
# Installs the ait-snapshot launchd agent. NOT run automatically by any pipeline code or test;
# Eric runs this by hand when he wants the daily 09:00 sweep running unattended.
#
# What this does:
#   1. Makes the .logs/ directory the plist writes stdout/stderr into.
#   2. Copies scripts/ait-snapshot.plist into ~/Library/LaunchAgents/.
#   3. Loads it with launchctl so it starts running on the declared schedule.
#
# Verify afterwards: `launchctl list | grep ait-snapshot` should print one line with the label
# and exit status 0.
set -e
cd "$(dirname "$0")/.."
mkdir -p .logs

PLIST_PYTHON="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' scripts/ait-snapshot.plist)"
if ! "$PLIST_PYTHON" -c "import datetime; datetime.UTC" >/dev/null 2>&1; then
    echo "error: $PLIST_PYTHON is too old for pipeline/util.py (needs Python 3.11+, for datetime.UTC)." >&2
    echo "Point scripts/ait-snapshot.plist's ProgramArguments at a 3.11+ interpreter and retry." >&2
    exit 1
fi

cp scripts/ait-snapshot.plist ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl load -w ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl list | grep ait-snapshot
