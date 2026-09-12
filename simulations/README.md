# simulations/ — Simulation Manifests

One manifest per scenario, validated by `simulationManifestSchema`. The rule that
shapes the directory is D14's: **criteria may never be changed after a failure to
produce a pass.** A scenario found invalid gets a new `version` and the old
failure is kept, so a manifest is append-only in spirit even though it is one file.

`hidden_conditions_ref` always points under `evaluator-only://`, never at a
sibling here. A hidden condition stored next to its manifest is reachable from any
trial that can read the manifest, which would silently invalidate every trial that
used it (F10, TD-16). Fitness rule F10 enforces both halves: the schema refuses a
ref outside the scheme, and the linter refuses a ref whose target is missing or
lives under this directory.

`environment.repo_revision` is the revision the criteria were written against. A
re-run at a different revision is a different scenario and takes a new `version`.
