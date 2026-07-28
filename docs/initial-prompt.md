# The initial prompt

The seed prompt for the grill that produced this spec.

Five of the six files in `docs/` were never authored directly. `spec.md`, `system.md`,
`wireframes.md`, `decisions.md` and `CONTEXT.md` all came out of one 43-round
`grill-me-checkpoint` interview, raw capture at
`_raw/grill-me-checkpoint/2026-07-27-ai-influencers-tracker.md` in EricOS. This file is the
exception: it came out of its own later session, captured at
`_raw/grill-me-checkpoint/2026-07-27-ait-seed-prompt.md`.

That 43-round session had **no seed prompt**. It opened cold, and the first two rounds paid for it:
Q1 was rejected as unparseable, the agent assumed Eric had read a spec he had not read, and a false
premise (that the deliverable is always a video) survived until Q2. The prompt below is the
reconstruction, meaning what should have been typed at t=0 so those rounds had gone to content
instead of recovery.

It is here so the next project starts with it rather than rediscovering it.

---

## The prompt

```
Use the grill-me-checkpoint skill. Interview me one question at a time and save every answer to
disk before asking the next one. Write no code and no spec until I say the grilling is done.

WHAT I WANT TO BUILD
A local dashboard that reads two feeds against each other: ~72 AI/automation YouTube channels, and
the GitHub repos those channels cover. It tells me what to make next without me watching anything.
It is a second brain, so every run has to leave behind data I keep, not just a page I look at once.
One user: me. Runs on my Mac alongside my existing social-invest dashboard.

WHAT IS ALREADY DECIDED (do not re-litigate these)
- Every YouTube signal is lagging: a video existing means someone already made it. GitHub star
  velocity is the only leading signal I have.
- Local only. No hosting, no auth, no multi-user, not a product.
- Standard library and free APIs first. One paid vendor at most, and it must sell something
  nothing free does.
- Copy the shape of my social-invest project, share no code with it.

WHAT IS NOT DECIDED (these are your grill targets)
- What decision I make badly today that this fixes, and how I make it right now.
- What "winning" means, in one sentence I would actually say out loud.
- What the primary object is: the channel, the video, or the subject a video is about.
- Whether comments are a demand signal I can act on or just noise under the video, and what I
  would do with one if it turns out to be real.
- Which layers of stored data are worth keeping forever, and which are safe to throw away and
  rebuild.
- Which pages exist, and what sits on each one.
- What the deliverable is when the dashboard flags something.
- Where every number comes from, what it costs, and which are exact, computed, or judged.
- What the build order is, and which step is a hard gate.

HOW TO ASK ME
I have not read any spec. Open every question with two or three plain sentences on what is
currently written, then ask ONE small concrete question. No abstract multiple-choice framings.
Recommend the answer you think is right so I can confirm or push back. Never ask two things at
once. If I cannot answer, log it as an open flag with an owner and move on. Check the files
instead of asking me when the answer is already on disk. If I go off on a tangent and start
specifying something unprompted, follow me there and capture all of it as authoritative.

THE RULE TO TEST EVERY ANSWER AGAINST
Never assert a number, a step, or a recommendation that nobody said and no API returned. Missing
data is a state, never a zero. If an answer of mine would let the dashboard invent something,
push back on me right then, in that round.

WHAT I WANT AT THE END
A spec a fresh agent could build from: what it is and what it answers, the data flow with every
API call and its cost, the pages as ASCII wireframes, why each call went that way and what was
rejected, and a glossary naming the words to avoid. Plus the raw capture file, kept.

Keep grilling until I say stop. Assume 40+ rounds, not 10.
```

---

## The seven blocks, and why each one is there

Each block exists because its absence cost a round in the real session.

| Block | What it prevents |
|---|---|
| **Mode** | The agent writing the spec while still interviewing. Checkpoint-before-next-question is what makes the file, not the chat, the source of truth. |
| **What I want to build** | Round 1 spent establishing the premise. |
| **Already decided** | Settled ground getting reopened at round 30. Holds only what was true before the first question. |
| **Not decided** | A false premise surviving into the docs. Q2 caught video-vs-repo by luck. |
| **How to ask me** | The Q1 failure. Abstract multi-choice framing on an unread spec is unanswerable. |
| **The one rule** | Answers that quietly license the dashboard to invent a number. This became §2 of `spec.md`. |
| **What I want at the end** | An interview that produces conversation instead of a contract. The five grilled files in `docs/` are this line. |

## Reusing it on a different project

Blocks 2 and 3 are the only project-specific ones. Rewrite those and the rest carries.

**One caution, and it is the whole trap.** Almost everything a finished project "knows" was produced
by the grill, not brought to it. Topic-first, video-only output, port 3002, the trunk/fork
extraction shape: all of those came *out* of this interview. Reproduced verbatim in block 3 they
replay this project. Carried into a new one they assert conclusions the new project has not earned,
which is the same class of error the one rule exists to prevent, aimed at the spec instead of the
dashboard.

So on a new project, **block 3 starts nearly empty.** It holds only what is true before anyone asks
a question: the constraints you brought with you. Everything else belongs in block 4, where it can
be grilled.

This file shipped with that exact bug. "Topic is the primary object" sat in block 3 through the
first draft, even though Q2 is where it was decided. It now sits in block 4, where it belongs.
