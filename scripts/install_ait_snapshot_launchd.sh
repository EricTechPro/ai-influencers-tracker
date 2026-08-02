#!/bin/sh
# Installs the ait-snapshot launchd agent. NOT run automatically by any pipeline code or test;
# Eric runs this by hand when he wants the daily 09:00 sweep running unattended.
#
# What this does:
#   1. Makes ~/Library/Logs, which the plist writes stdout/stderr into. NOT .logs/ in the repo:
#      launchd opens those files as the target program, and Homebrew python has no TCC grant
#      for ~/Desktop, so a repo-local log path fails the spawn as EX_CONFIG 78.
#   2. Copies scripts/ait-snapshot.plist into ~/Library/LaunchAgents/.
#   3. Boots it out and back in, so re-running this picks up an edited plist. `launchctl load`
#      returns "Load failed: 5: Input/output error" when the label is already registered, which
#      reads like a broken plist and is really just "already loaded".
#
# Verify afterwards: `launchctl print gui/$(id -u)/ca.erictech.ait-snapshot` should show
# `last exit code = 0`. `launchctl list` shows a dash for the PID whenever the job is idle,
# which is the normal state for a scheduled job and is not an error.
set -e
cd "$(dirname "$0")/.."
mkdir -p ~/Library/Logs

PLIST_PYTHON="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:0' scripts/ait-snapshot.plist)"
if ! "$PLIST_PYTHON" -c "import datetime; datetime.UTC" >/dev/null 2>&1; then
    echo "error: $PLIST_PYTHON is too old for pipeline/util.py (needs Python 3.11+, for datetime.UTC)." >&2
    echo "Point scripts/ait-snapshot.plist's ProgramArguments at a 3.11+ interpreter and retry." >&2
    exit 1
fi

cp scripts/ait-snapshot.plist ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl bootout "gui/$(id -u)/ca.erictech.ait-snapshot" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl print "gui/$(id -u)/ca.erictech.ait-snapshot" | grep -E 'last exit code|runs'
