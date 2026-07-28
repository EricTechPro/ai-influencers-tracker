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
cp scripts/ait-snapshot.plist ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl load -w ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl list | grep ait-snapshot
