# Section map

What `main` contains, grouped into Sections. Written by `git-history-cleaner`.

**Rewritten 2026-08-07.** Four loose commits became Sections 14 and 15, and one data commit came
off `main`. Backup at tag `backup/pre-rewrite-2026-08-07`, pushed.

The rule: `main` carries one commit per Section and nothing else. A Section is one coherent body of
work — what you would describe in a sentence and revert as a unit.

## The map

| # | Section | On `main` | Date | Detail | Files |
|---|---------|-----------|------|--------|------:|
| — | Initial commit | `bf093a3` | 07-28 | — | 45 |
| 1 | Config and the topic tree | `c51a52e` | 07-28 | `history/detailed` | 15 |
| 2 | Ingestion | `8ff9efa` | 07-28 | `history/detailed` | 17 |
| 3 | Synthesis | `3644c8e` | 07-28 | `history/detailed` | 22 |
| 4 | The bundles | `cc6c69b` | 07-28 | `history/detailed` | 17 |
| 5 | Dashboard shell | `ce2e120` | 07-28 | `history/detailed` | 41 |
| 6 | The leaderboard | `b6dad87` | 07-28 | `history/detailed` | 18 |
| 7 | Channels, compare, and topics | `a15f3fe` | 07-28 | `history/detailed` | 28 |
| 8 | Skills and the daily run | `90a7f94` | 07-30 | `history/detailed` | 8 |
| 9 | Per video language | `0aaa7ea` | 07-31 | `history/detailed` | 21 |
| 10 | The readme and the two audits | `34331f7` | 07-31 | `history/detailed` @ `3132a8e` | 3 |
| 11 | The checks, in one place | `6ac438d` | 08-01 | **none** | 5 |
| 12 | Muting a video | `a970060` | 08-01 | **none** | 16 |
| 13 | The readme, cut to the quick start | `399bbc5` | 08-01 | **none** | 2 |
| — | End of course | `a7d0a05` | 08-01 | — | 0 |
| 14 | The 09:00 sweep survives a missed morning | `6797a49` | 08-07 | `section/14-sweep-catchup` | 5 |
| 15 | The channel page | `95b8be7` | 08-07 | `section/15-channel-page` | 25 |

Every commit on `main` appears exactly once. Running
`git log --format='%s' main | grep -vE '^Section [0-9]+ — |^Initial commit$|^End of course$'`
returns nothing.

## What the rewrite did

| Was | Became |
|---|---|
| `4218f2b fix(ait-ingest): the 09:00 sweep never survived…` | Section 14 (`6797a49`) |
| `1e8f15d feat(ait): the channel page answers…` | Section 15 (`95b8be7`) |
| `e09596d feat(ait-web): the momentum badge became…` | Section 15 (`95b8be7`) |
| `6fec7fb config: record the videos muted on 2026-08-06` | branch `data/muted`, off `main` |

**Verified:** `main`'s tree is `c0e750ae…`, byte-identical to the pre-rewrite tip `e09596d`. The
only diff against `backup/pre-rewrite-2026-08-07` is `config/muted.json`, 60 deletions — the data
commit, dropped on purpose. Pushed with `--force-with-lease`; `main` is in sync with `origin/main`.

### Why two Sections and not one

`4218f2b` is a launchd catch-up fix in the ingest layer; the other two are the channel page in the
web layer. Merged into one Section, reverting the channel page would also revert the sweep fix —
which breaks the exact payoff the rule exists for.

### The detail branches are permanent

`section/14-sweep-catchup` and `section/15-channel-page` are pushed and **never deleted**. History
already merged into `main` cannot get a retroactive PR, so these branches are the only copy of the
per-commit reasoning. Sections merged through a real PR from here on keep their detail in the PR,
and those branches can be deleted.

## Two permitted exceptions

- **`bf093a3` Initial commit** — the repo root. Every history has one.
- **`a7d0a05` End of course** — an empty marker commit, same tree as Section 13. It sits
  mid-history because that is when it happened, 08-01, before the Aug 2 work. Moving it to the tip
  would make it a lie.

## Still open

**The daily launchd sweep (`ca.erictech.ait-snapshot`, 09:00) still writes `config/muted.json` to
`main`.** Until it is pointed at `data/muted` or left untracked, `main` grows a fresh violation on
the next run that touches it. Not part of this cleanup — it needs a decision.

`AGENTS.md` has not yet been stamped with the canonical rule, so an agent working here still reads
the older hand-written `## Commits` section, which does not know about Sections.

## What the detail column found

`history/detailed` holds 181 commits and its tip `3132a8e` carries **Section 10's exact tree**, so
the detailed track stops at Section 10.

**Sections 11, 12 and 13 have no detail anywhere.** Their reasoning exists only in the Section
commit bodies on `main`, which is survivable because those bodies are long — and is exactly the
drift the PR-based rule removes. Nothing can recover their per-commit history.

Sections 1–9 match no single commit on `history/detailed`, so `main`'s section boundaries were cut
at different points than the detailed commits. The two tracks are not a 1:1 squash of each other.
