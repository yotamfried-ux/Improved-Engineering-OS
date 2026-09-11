# Version 1 trials — kept because they failed

One trial ran against manifest version 1, at revision `3586c5b`. It is retained
rather than deleted, for the reason D14 gives: criteria may never be changed after
a failure to produce a pass, and a failure that disappears from the record is a
criterion that was quietly changed.

What it established:

- The namespace mechanism works. All four boundaries came back `proven` on a real
  agent run: the evaluator tree showed 0 entries, the control destination was
  refused, the trial was pid 1, and the environment was built rather than filtered.
- The task is solvable without EOS. Every deterministic rule passed, including the
  readable-directory case the repository never mentions. That is a baseline worth
  having, not a disappointment.
- **It could not measure the hidden condition.** `resolve` was not called because
  the `ieos` MCP server never started: `status: "failed"` in the session's own
  init event, and no ieos tool in the offered list. Finding S-6.

The third point is why this trial is not a trial of version 1's claim. Reporting
"the agent did not reach for EOS" from it would have been the most confident wrong
sentence in this repository: the tool did not exist in that session, so the
trajectory says nothing about the agent's judgement.

Version 2 re-runs the same criteria against a revision where the tool is reachable.
The criteria are unchanged; only the system under test moved.
