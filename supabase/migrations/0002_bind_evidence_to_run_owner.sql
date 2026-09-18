-- D36 hardening: evidence may inherit classification only from a Run owned by
-- the same owner as the authenticated installation that is writing it.
--
-- `run_id` is globally unique, but that alone is not enough. Before this
-- migration an installation owned by B could name a run pre-registered by a
-- service principal owned by A. The ingest functions stamped B as the evidence
-- owner but read `origin_class` from A's Run, so a guessed qualification run id
-- could lend its classification across the owner boundary.
--
-- The invariant belongs in the database rather than in one ingest function:
-- every evidence table that references a Run carries `owner_id`, so a composite
-- foreign key makes cross-owner attribution impossible for current and future
-- writers alike. Existing inconsistent data makes this migration fail closed
-- instead of being grandfathered in silently.

alter table runs
  add constraint runs_run_id_owner_unique unique (run_id, owner_id);

alter table raw_events
  add constraint raw_events_run_owner_fkey
  foreign key (run_id, owner_id) references runs (run_id, owner_id);

alter table observations
  add constraint observations_run_owner_fkey
  foreign key (run_id, owner_id) references runs (run_id, owner_id);

alter table context_snapshots
  add constraint context_snapshots_run_owner_fkey
  foreign key (run_id, owner_id) references runs (run_id, owner_id);
