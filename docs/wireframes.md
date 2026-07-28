# AI Influencers Tracker — page wireframes

Terminal wireframes for every page. **No visual design here**, no colors, no spacing decisions.
This is *what is on the page and in what order*, so Eric can point at a box and say "wrong" before
anything is built.

Contract is in [spec.md](spec.md) §7. Folders, schemas and the data flow are in
[system.md](system.md). Why each call went this way is in [decisions.md](decisions.md).

**Legend**

```
  ▸ ◂     collapsible section, shown open / closed
  ····    Derived value: dotted underline in the real UI, hover shows the formula
  ▓▓▓▓    Inference: tinted background, carries a source chip
  [ ]     control (tab, toggle, filter, button)
  (?)     UNDECIDED — Eric needs to rule on this
```

Five routes, exactly as agreed:

```
  /                    home
  /leaderboard         the full 72
  /topics/[id]         topic page       (two variants: leaf and parent)
  /channels/[id]       channel page
  /compare             two channels
```

---

## 1. `/` — home

Two panels. The first screen every morning. **Ten-second read: who is winning, what do I film.**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  AI INFLUENCERS                    home  leaderboard  topics  channels  compare         │
│                                                        snapshot 2026-07-27 09:00 ● live │
└────────────────────────────────────────────────────────────────────────────────────────┘

  WHO IS GROWING                    [growth ▾] [90d ▾] [all niches ▾]      see all 72 →
  ranked by subscriber growth rate · below a channel's measurement floor renders "< N"

  ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐
  │ 🥇 1   Cole Medin        │ │ 🥈 2   Nate Herk         │ │ 🥉 3   Matthew Berman    │
  │        @ColeMedin        │ │        @nateherk         │ │        @matthew_berman   │
  │                          │ │                          │ │                          │
  │  +7.4%     ····          │ │  +6.1%     ····          │ │  +4.8%     ····          │
  │  subscriber growth 90d   │ │  subscriber growth 90d   │ │  subscriber growth 90d   │
  │                          │ │                          │ │                          │
  │  +15,000 subs  ±1,000    │ │  +53,000 subs  ±1,000    │ │  +30,000 subs ±10,000    │
  │  12.4 subs / 1k views ···│ │  9.8  subs / 1k views ···│ │  4.1  subs / 1k views ···│
  │  12 videos · 25,246 med  │ │  8 videos · 61,004 med   │ │  22 videos · 41,880 med  │
  │  ▁▂▃▅▆█ 90d              │ │  ▁▁▂▄▆█ 90d              │ │  ▃▃▄▄▅▆ 90d              │
  └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘
  ┌──────────────────────────┐ ┌──────────────────────────┐
  │  4    Greg Isenberg      │ │  5    Dan Martell        │
  │       +3.9%   ····       │ │       < 2.0%  ····       │  ← bounded: bucket is 10,000
  │       ...                │ │       below floor, we    │     so anything under 50,000
  │                          │ │       know only "< 50k"  │     cannot be measured
  └──────────────────────────┘ └──────────────────────────┘

  ⓘ You are #7, so you are not in this grid. Your card sits at its true rank on
    /leaderboard, colored differently. No pinned strip: DECIDED, inline only.
    When you crack the top 5 your card appears here like any other, just colored.

  ┌──────────────────────────┐
  │ ★ 5    Eric Tech    YOU  │   ← what it looks like once you are in the top 5
  │        @erictech         │
  │  +3.1%     ····          │
  │  subscriber growth 90d   │
  │  +2,100 subs  ±100       │
  │  target #4 · 8,400 behind│
  │  gap closing ~600/wk ····│
  └──────────────────────────┘

  ═════════════════════════════════════════════════════════════════════════════════════

  WHAT TO MAKE NEXT                          [MAKE_THIS_NOW ▾]  [hide covered ✓]
  score = 40·velocity + 25·keyword + 25·supply gap + 10·staleness      how this works →

  topic                          verdict          who's on it     score   newest
  ───────────────────────────────────────────────────────────────────────────────────
▸ mcp-registry-integration       MAKE_THIS_NOW    ●●            71.9 ···   6d
  claude-code-hooks-config       TOO_EARLY        —             34.0 ···   never
  claude-code-subagents          ONLY_IF_UNSERVED ●●●●●●●       58.2 ···   3d
  frontier-model-launches        CROWDED          ●●●●●●●●●     22.1 ···   1d
  agent-evaluation-testing       INSUFFICIENT     ●             --         41d
                                                                 ↑ sorts last BOTH ways

  ▼ expanded row: mcp-registry-integration
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │ COMPONENT        RAW                 NORM   WT   POINTS   SOURCE              │
    │ repo velocity    266 stars/day       0.89   40    35.6    github              │
    │ keyword volume   8,100 searches/mo   0.54   25    13.5    vidiq               │
    │ supply gap       2 videos / 90d      0.83   25    20.8    youtube             │
    │ staleness        newest 6d ago       0.20   10     2.0    youtube             │
    │                                            ────  ─────                        │
    │                                             100    71.9                       │
    │                                                                               │
    │ fired:  repo_velocity >= 100.0   ·   videos <= 2                              │
    │ repo:   x/mcp-registry  12,496★  47d  ▓ indie ●●○ org, 9 contributors ▓       │
    └──────────────────────────────────────────────────────────────────────────────┘
```

**Open on this page**

- ~~"YOU" strip~~ **DECIDED: inline only.** One card, at your true rank, colored. No duplication
  ever. If you are #31 you click through to `/leaderboard` to find yourself, which is the correct
  amount of friction: the point is to be in the top 5, not to be pinned next to it.
- ~~`x / 75` inline or only expanded?~~ **Inline, always.** Hiding the denominator inside the
  expanded row means a scan reads `54.2` as out of 100 when it is out of 75. That is an inference
  wearing a measurement's clothes, which §2 forbids. The column renders `54.2 / 75` and only a full
  100 is allowed to omit its denominator.

---

## 2. `/leaderboard` — the full 72

Same data, no cap, more columns. This is where you go when the top 5 is not enough.

```
  ALL CHANNELS                                                              72 tracked

  rank by  [growth ▾] [general] [subscribers] [views]        window [90d ▾]
  niche    [all ▾] ai-agents · claude-code · n8n · no-code · chinese · business
  show     [competitors ✓] [company ✓] [adjacent ☐]

  #   channel              subs      Δsubs 90d ··  growth ··  views Δ ··  subs/1k ··  vids
  ────────────────────────────────────────────────────────────────────────────────────────
  1   Cole Medin           219,000   +15,000        +7.4%      +3.1M       12.4        12
  2   Nate Herk            873,000   +53,000        +6.1%      +8.0M        9.8         8
  3   Matthew Berman       626,000   +30,000        +4.8%      +7.3M        4.1        22
  ...
  7 ▸ Eric Tech ★           68,700    +2,100        +3.1%      +0.4M        5.2         6
  ...
  31  Dan Martell        2,930,000   < 50,000       < 2.0%     +12.1M       —          14
                                     ↑ bounded, bucket 10,000, sorts below every "ok"
  ...
  68  AI Systems by Jimi     2,380      +180        +8.2%      +0.02M      14.1         9
                                     ↑ small bucket (10) so a 7d window is measurable here
  71  someprivatechannel        --          --         --          --       --         --
                                     ↑ status: absent, channel went private, never zero
```

**The point of the two annotated rows:** the floor is per channel, not per window. A 2,380-sub
channel is measurable over a week; a 2.93M channel is not measurable over a quarter.

---

## 3. `/topics/[id]` — leaf topic (the important page)

This is the page that has to replace watching. Modeled on social-invest's ticker page.

```
  claude-code-mcp-setup                                       MAKE_THIS_NOW    71.9 ····
  Wiring MCP servers into Claude Code            tutorial · 9 videos · 7 creators · 90d
  ▓ you have not covered this ▓                            [+ hunch] [open all videos]

  ─── ▸ WHERE THEY DISAGREE ─────────────────────────────────── the opening ─────────

      ┌────────────────────────────────────────────────────────────────────────┐
      │   install-cli ──── then ────▶ authenticate ──── then ────▶ claude-md    │
      │                                                                │        │
      │                                    ┌───────────────────────────┘        │
      │                                    ▼                                    │
      │   claude-mcp-add ◂── alternative_to ──▶ mcp-json ×6                     │
      │   claude-mcp-add ◂──── contradicts ───▶ mcp-json ×2   ← newest          │
      │        │                                   │                            │
      │        4 creators, Feb–Apr            2 creators, 6–11d ago              │
      └────────────────────────────────────────────────────────────────────────┘
                        click any row for the exact words they said

      ⚠  STALE MAJORITY
         4 creators use `claude mcp add` (Feb–Apr). The 2 most recent say it is
         superseded by .mcp.json in the repo. Majority is stale. Newest wins.

  ─── ▸ EASIEST PATH ────────────────────────────────────────────────────────────────

      ★ FEWEST STEPS       3 steps   .mcp.json in repo root      Brad 11d, Charlie 6d
      ○ MOST DURABLE       7 steps   per-project scoped perms    Cole 24d
      ! MOST COMMON        stale     `claude mcp add` global     4 creators, Feb–Apr

  ─── ◂ WHAT THEY ALL DO · 3 steps, 7/7 agree ───────────────────── commodity ───────
      ▼ expanded:

   1  Install the CLI                                                    7/7 ····
      npm i -g @anthropic-ai/claude-code
      cite: Adrian 04:12 · Duncan 02:55 · Samin 06:30  (+4)

   2  Authenticate                                                       7/7 ····
      Run `claude` in any directory. Opens a browser for OAuth.
      Console-key users: `claude auth --api-key`
      ⚠ Samin, Ray: fails behind corporate proxy, set ANTHROPIC_BASE_URL first
      cite: Adrian 04:12 · Duncan 02:55  (+5)

   3  Write a CLAUDE.md                                                  6/7 ····
      Repo root. Project conventions, commands, invariants.
      cite: Brad 07:40  (+5)

  ─── ▸ WHAT VIEWERS ASKED · 1,840 comments, 9 videos, 7 creators ───────────────────

      ┌────────────────────────────────────────────────────────────────────────┐
      │  ▓ UNSERVED BRANCH ▓                                                   │
      │                                                                        │
      │   340 comments across 6 of these 9 videos ask about Windows / WSL.     │
      │     0 of 9 videos cover it.                                            │
      │                                                                        │
      │   → crowded topic, wide-open branch. This is the video.   see all 340 →│
      └────────────────────────────────────────────────────────────────────────┘

      [ all 1840 ] [ requests 210 ] [ questions 640 ] [ corrections 31 ]
      [ suggestions 188 ] [ other 402 ]
      sort [likes ▾] [replies]                                 window [365d ▾]

      who       comment                        ▓cat▓  likes  creator      lag
      ──────────────────────────────────────────────────────────────────────────
      someguy   Would love to see this on      ▓req▓   412   Cole Medin    3d
                Windows, WSL keeps breaking                                after
      devanne   the mcp add command is         ▓cor▓   288   Cole Medin   41d
                deprecated now, use .mcp.json                              after
      pip_h     does this work with a          ▓que▓   204   Brad          8d
                monorepo? mine has 40 pkgs                                 after

      showing 5 of 1,840        [show 10]  [1] 2 3 ... 368 →

      ⓘ Same comment corpus as the channel pages, indexed by topic instead of by
        creator. This view spans all 7 creators; a channel page shows only one.

  ─── ◂ EVERY CREATOR'S TRAIL (collapsed) ───────────────────────────────────────────

  ─── ◂ VIDEOS ON THIS TOPIC · 9 (collapsed) ────────────────────────────────────────
```

**Order is decided: fork first.** The page opens on the contested part because that is the question
you came to answer — *is there room for me*. The trunk is commodity and sits collapsed below, with
its step count and agreement level in the header so you can see whether it is worth opening without
opening it.

**Click a mind-map row →**

```
      ┌──── claude-mcp-add  contradicts  mcp-json ──────────────────────────┐
      │  Said 2 times by 2 people. A claim they made, not a verified fact.  │
      │                                                                     │
      │  │ "don't use claude mcp add any more, put a .mcp.json in the       │
      │  │  repo root so it's checked in and your whole team gets it"       │
      │  │  BRAD · 2026-07-16 · 07:40 · open video →                        │
      │                                                                     │
      │  │ "the global install is basically deprecated at this point"       │
      │  │  CHARLIE · 2026-07-21 · 12:03 · open video →                     │
      └─────────────────────────────────────────────────────────────────────┘
```

**Open on this page**

- ~~Order~~ **DECIDED: fork first, trunk collapsed below.**
- ~~What does this page show before extraction exists?~~ **DECIDED: render everything it has, and
  state plainly what is missing.** Before step 15 the page looks like this:

```
  claude-code-mcp-setup                                       MAKE_THIS_NOW    71.9 ····
  Wiring MCP servers into Claude Code            tutorial · 9 videos · 7 creators · 90d

  ─── WHERE THEY DISAGREE ───────────────────────────────────────────────────────────

      ┌────────────────────────────────────────────────────────────────────────┐
      │  not extracted yet                                                     │
      │  9 videos matched this topic · 0 analyzed                              │
      │  needs build step 14                                  [analyze now →]  │
      └────────────────────────────────────────────────────────────────────────┘

  ─── ▸ WHAT VIEWERS ASKED · 1,840 comments ────────────────────── real from step 6 ──
  ─── ▸ VIDEOS ON THIS TOPIC · 9 ──────────────────────────────── real from step 1 ──
  ─── ▸ EVERY CREATOR'S TRAIL ─────────────────────────────────── real from step 1 ──
```

  This follows the project's own rule: **missing is a state, not a hiding place.** Three of the five
  sections are real from the spine, so the page earns its route long before synthesis lands. The
  empty state names the exact build step responsible, which doubles as a progress indicator.

---

## 4. `/topics/[id]` — parent topic (never specced until now)

A parent is never scored and never banded. It exists to navigate and to roll up.

```
  Claude Code                                                    parent · not scoreable
  7 leaf topics · 61 videos · 22 creators · 90d

  ⓘ Parents are never scored. Only leaves get a verdict, because "Claude Code" is not
    something you can film.

  leaf                              verdict          videos  creators  score   newest
  ──────────────────────────────────────────────────────────────────────────────────
  claude-code-mcp-setup             MAKE_THIS_NOW        9        7    71.9     6d
  claude-code-subagents             ONLY_IF_UNSERVED    26       11    58.2     3d
  claude-code-skills-authoring      CROWDED             24       14    31.0     1d
  claude-code-memory                MAKE_THIS_NOW        6        5    66.4    12d
  claude-code-context-engineering   TOO_EARLY            6        4    40.1    22d
  claude-code-plugins               INSUFFICIENT         3        3    --      31d
  claude-code-hooks-config          TOO_EARLY            0        0    34.0    never
                                                        ↑ zero videos in your roster

  ─── IS THIS WHOLE AREA HEATING OR COOLING? ────────────────────────────────────────

   videos/wk  ┤                                    ╭──╮
   across all │                        ╭───────────╯  ╰────
   7 children ┤          ╭─────────────╯
              │──────────╯
              └────┬──────────┬──────────┬──────────┬──────────┬────
                 Apr 28     May 19     Jun 09     Jun 30     Jul 21

   14 videos/wk across this branch, up from 4 in April.  ····
```

**Decided: parents get a rollup trend and nothing else.** The leaf table, plus one line showing
whether the whole branch is accelerating. A parent still carries no score and no verdict, because
"Claude Code" is not something you can film — but *"this entire area tripled since April"* is a real
signal that no individual leaf carries, and it is free arithmetic over data the spine already has.

---

## 5. `/channels/[id]` — channel page

Three collapsible sections, exactly the order you gave.

```
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  ( )   Cole Medin                                            ★ #1 by growth 90d  │
  │ avatar @ColeMedin · ai-agents · en                          compare with you →   │
  │                                                                                  │
  │  219,000 subs ±1,000    11,991,545 views    412 videos    3.4d cadence ····      │
  │                                                                                  │
  │  ▓ Builds AI agent tutorials focused on n8n, MCP and local-first stacks.         │
  │    Long-form, heavy on live builds. ▓  more ↓     ▓ AI-written · 20 Jul ▓        │
  └──────────────────────────────────────────────────────────────────────────────────┘

  ─── ▸ GROWTH ──────────────────────────────────────────────────────────────────────

      [subscribers] [views] [view growth]                        window [90d ▾]

      219k ┤                                              ╭────
           │                                        ╭─────╯
      210k ┤                            ╭───────────╯
           │              ╭─────────────╯
      204k ┤──────────────╯
           └────┬──────────┬──────────┬──────────┬──────────┬────
              Apr 28     May 19     Jun 09     Jun 30     Jul 21

      +15,000 subs ···· over 90d · bucket 1,000 · ±7%

  ─── ▸ STILL PULLING VIEWS ─────────────────────────────────────────────────────────

      video                                    published   views    +7d ····  mult ····
      ──────────────────────────────────────────────────────────────────────────────
    ▸ Google Just Dropped a Masterclass...     25 Jun      146,102   +5,221    4.8x
    ▼ This RAG Trick Makes Agents Smarter      02 May       88,410   +2,090    2.9x
      ┌──────────────────────────────────────────────────────────────────────────┐
      │  213 comments · topic: rag-pipelines                    open video ↗     │
      │  [ requests 12 ] [ questions 84 ] [ corrections 3 ] [ suggestions 21 ]   │
      │                                                       [ other 93 ]      │
      │                                                                         │
      │  marco    how do you handle rate limits   ▓que▓  190   4          96d   │
      │  jenn_b   would be great to see this      ▓req▓  140   2          12d   │
      │           with a local model                                            │
      │                                              showing 2 of 213  more →   │
      └──────────────────────────────────────────────────────────────────────────┘
      ⓘ the by-video index, same corpus and same four categories as everywhere else

  ─── ▸ WHAT HIS VIEWERS ASK ────────────────────────────────────────────────────────

      [ all 642 ] [ requests 84 ] [ questions 210 ] [ corrections 12 ]
      [ suggestions 96 ] [ other 240 ]                       ← fixed order, always
      sort [likes ▾] [replies]                                 window [365d ▾]

      who        comment                     ▓cat▓  likes repl  video          topic      lag
      ──────────────────────────────────────────────────────────────────────────────────────
      someguy    Would love to see this on   ▓req▓   412    7   Google Just    mcp-setup   3d
                 Windows, WSL keeps breaking                    Dropped... →   →         after
      devanne    the mcp add command is      ▓cor▓   288   22   Google Just    mcp-setup  41d
                 deprecated now, use .mcp.json                  Dropped... →   →         after
      marco      how do you handle rate      ▓que▓   190    4   This RAG       rag-       96d
                 limits when the agent loops                    Trick... →     pipelines after

      showing 5 of 213             [show 10]  [1] 2 3 ... 43 →

      ⓘ lag = days between the video going up and the comment being posted.
        A 96-day lag on a video still pulling views is a different signal from a 3-day one.

      ⓘ topic links through to that topic's own comment view, which spans every creator
        covering it rather than just this one.
```

**Open on this page**

- ~~Topic column~~ **DECIDED: one corpus, two indexes.** The channel page keeps this per-creator
  view; the topic page gets the cross-creator view where the unserved branch lives. A `topic` column
  is added here so a correction on an MCP video is visibly evidence for that topic's fork.
- ~~`needs_improvement` vs `feedback`~~ **DECIDED: four actionable categories only** —
  `video_request`, `question`, `correction`, `suggestion` — plus `other` (collapsed, never
  discarded). `feedback`, `needs_improvement` and `praise` are cut. Every tab carries its count and
  the tab order is fixed so positions never move between channels.
- ~~Video rows expanding into comments~~ **DECIDED: yes, expand inline.** Shown above. Uses the
  by-video index, same four categories, no extra pipeline.

---

## 6. `/channels/[id]` — **your own channel**, extra section

Everything above, plus one section nobody else's page has.

```
  ─── ▸ REPLY QUEUE · 14 unanswered ─────────────────────── your channel only ───────

      [needs reply ✓] [answered ☐]        sort [likes ▾]        window [30d ▾]

      ┌────────────────────────────────────────────────────────────────────────────┐
      │  marco  ·  188 likes · 6 replies · 12d after  ·  "Claude Code Skills..."   │
      │  "great vid but how do you stop the agent from blowing the context         │
      │   window on a big repo? mine dies every time"                              │
      │                                    ▓question▓                              │
      │  ┌── ▓ DRAFT · not sent · sources: transcript 08:12, KB, Skool Ch3 ▓ ──┐  │
      │  │ Yeah that's the number one thing people hit. Short answer: don't    │  │
      │  │ let it read the whole repo, give it a map instead.                  │  │
      │  │                                                                     │  │
      │  │ I go through the exact setup in Chapter 3 of the community, the     │  │
      │  │ knowledge base lesson. Covers the folder structure that keeps       │  │
      │  │ context flat: skool.com/erictech/classroom → Chapter 3              │  │
      │  └─────────────────────────────────────────────────────────────────────┘  │
      │                                                                            │
      │  [copy draft]   [open comment on YouTube ↗]   [open in Studio ↗]  [skip]   │
      │                                                                            │
      │  ⓘ Nothing posts from here. Copy it, click through, send it yourself.      │
      └────────────────────────────────────────────────────────────────────────────┘

      ✓ answered · 41                                                    [show]
        detected automatically: the daily sweep re-reads each thread and marks a
        comment answered when your channel id appears in its replies. 1 quota unit
        per 100. The queue actually empties instead of showing the same rows forever.
```

Draft shape is locked: **his take first, then where to go and why.** The two CTAs that appear in
his real replies are Skool and another video.

**Decided: answered is detected, not declared.** The daily sweep already reads comment threads, so
it checks whether the self channel id appears among the replies and sets `answered: true`. Costs
nothing extra, requires no local state, and survives a re-ingest — which a manual dismiss would not.
This is the one place the product reads something *about* Eric's own actions, and it is still purely
read-only.

---

## 7. `/compare`

```
  COMPARE                     [Cole Medin ▾]        vs        [Eric Tech ▾ ★ you]

  ─── ▸ WHAT HE COVERS THAT YOU DO NOT ──────────────────────── the actionable part ──

      topic                        him          you       his views      verdict
      ───────────────────────────────────────────────────────────────────────────
      rag-pipelines                6 videos     0         890,400        MAKE_THIS_NOW
      claude-code-memory           3 videos     0         210,880        MAKE_THIS_NOW
      local-llm-stacks             2 videos     0          44,100        TOO_EARLY

      ─── you cover, he does not ───
      claude-code-skills-authoring 0            4          —             —

      ─── both ───
      claude-code-subagents        4 videos     1         640,200        ONLY_IF_UNSERVED
      n8n-agent-workflows          9 videos     2       1,204,000        CROWDED

  ─── ▸ THE NUMBERS ─────────────────────────────────────────────────────────────────

  ⚠  Different bucket widths. Cole rounds to 1,000, you round to 100. A subscriber
     comparison across this size gap is not like-for-like. Views carry no such caveat.

                          Cole Medin              Eric Tech ★
  ─────────────────────────────────────────────────────────────────────
  subscribers             219,000  ±1,000         68,700  ±100
  Δ subs 90d ····         +15,000                 +2,100
  growth rate ····        +7.4%                   +3.1%
  views                   11,991,545              4,102,880
  Δ views 90d ····        +3,100,000              +404,000
  subs / 1k views ····    12.4                    5.2          ← the real gap
  videos 90d              12                      6
  median views ····       25,246                  18,900
  cadence ····            3.4d                    15.0d
```

**Decided: gaps lead, numbers follow.** Same reasoning as the topic page opening on the fork. The
stat table tells you *that* you are behind; the topic gaps tell you *what to do about it*, with each
gap carrying the verdict it already has on the opportunity table so the page hands you a filmable
list rather than a scoreboard.

---

## Cold start: what all of this looks like on day one

Worth deciding now, because it is 100% of the first experience.

```
  WHO IS GROWING                              [growth ▾] [90d ▾]

  ┌──────────────────────────────────────────────────────────────────────┐
  │  building, 1 of 90 days                                              │
  │                                                                      │
  │  Growth needs a window of snapshots. You have 1 day.                 │
  │  Run the vidIQ backfill (360 credits) to buy 365 days of history     │
  │  and this fills in immediately.                     [how →]          │
  └──────────────────────────────────────────────────────────────────────┘
```

After the step 2 backfill this panel is fully populated on day one, which is the entire reason that
360-credit purchase is in the plan. **The opportunity table still needs GitHub and keyword data**,
and topic pages stay thin until extraction lands.

**Decided**: the topic route renders from day one. Three of its five sections (comments, videos,
creator trail) are real off the spine alone; the mind map carries an empty state naming the build
step that fills it. Nothing is hidden because it is incomplete.

---

## Visual language — locked 2026-07-28

Chosen from the HTML mockup board in [`mockups/`](mockups/index.html) (three full versions per
page, social-invest tokens throughout, per E8). Versions keep one personality per letter:
**A dense terminal** (faithful social-invest port), **B card-forward** (gamified), **C editorial
ledger** (quiet). The locked set:

| page | version | why |
|---|---|---|
| `/` home | **B** | F1 says *gamified* top-5 — podium top-3, ghost rank numerals, and the score derivation as a side panel next to the table beats an expanding row for the ten-second read |
| `/leaderboard` | **A** | all columns visible; bounded `< N` and absent `—` semantics read cleanest in the dense table |
| `/topics` leaf | **A** | the fork renders as the chain-map port — §12 names `chain-map.tsx` the model; terminal rows with colored verbs, click-through to verbatim quotes |
| `/topics` parent | **A** | leaf table first, small rollup trend under it; parents stay quiet because they carry no verdict |
| `/channels` | **A** | section-for-section port of the ticker page: kicker sections, flat profile card, inline comment expansion |
| reply queue | **B** | working a queue wants the split panel: queue rail left, comment + draft side by side, actions on one line |
| `/compare` | **A** | the bucket-width caveat wants sober stacked tables, not bars that invite cross-bucket comparison |

Component-level, from [`mockups/component-board.html`](mockups/component-board.html):

- **Verdict badge: tinted pill** (action-badge STYLES pattern), one hue per band: MAKE green
  `#16a34a` · UNSERVED teal `#0e7490` · EARLY amber `#f5a623` · CROWDED red `#e5484d` ·
  INSUFFICIENT gray.
- **Trust tiers:** Oracle plain · Derived dotted underline, formula on hover · **Inference violet
  tint** `#7c3aed` (the retired `--limit` hue) + source chip. Green is reserved for "measured and
  positive", warning amber for stale/caveat, primary blue for interaction and YOU.
- **Growth card:** home-B treatment — ghost rank numeral, area sparkline behind the hero number on
  #1, bucket chip always beside Δsubs.

Overridable by pointing at any row and naming a different letter; everything else in this file is
unchanged by the visual pass.
