-- The Evidence Plane, Stage 2 (D22, D30, D36, guide section 5.9).
--
-- Two ideas shape every table and every function below.
--
-- D36 -- run classification authority. A Run's `origin_class` comes from a
-- record a SERVICE principal wrote before the run's first event. Events cannot
-- carry one (the telemetry envelope has no such field), and the ingest RPCs
-- read it from `runs`, never from the payload. So the strongest thing a
-- compromised installation can produce is `operational` evidence -- not by
-- convention, but because there is no code path that would accept anything
-- else from it.
--
-- D22 -- credential boundary. The `ingest` Edge Function holds the only
-- privileged client, and its whole surface is the SECURITY DEFINER functions
-- here. There is no general query. Each function resolves the caller from a
-- token hash rather than accepting a principal id, so even something holding
-- the service key cannot insert *as* another installation through this surface:
-- it would have to present that installation's token hash, which is derived
-- from a token the plane never stores.
--
-- Row level security is enabled on every table and no permissive policy is
-- created for anon or authenticated. That combination denies by default: a
-- leaked publishable key reaches nothing. The owner's own read policies are
-- added where the owner needs them, scoped by `owner_id`.

-- ---------------------------------------------------------------------------
-- Principals
-- ---------------------------------------------------------------------------

create type principal_kind as enum ('installation', 'service');

create table principals (
  id text primary key,
  kind principal_kind not null,
  owner_id uuid not null,
  -- sha256 of the opaque token. The token itself is never stored, never
  -- logged, and never appears in any contract in this repository (D22.1).
  token_hash bytea not null unique,
  scopes text[] not null,
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,

  constraint principals_id_prefix check (
    (kind = 'installation' and id like 'inst\_%') or
    (kind = 'service' and id like 'svc\_%')
  ),
  constraint principals_token_hash_is_sha256 check (octet_length(token_hash) = 32),
  constraint principals_scopes_not_empty check (array_length(scopes, 1) >= 1),
  -- D22.1: an installation may hold these three and nothing else. Written as a
  -- constraint rather than as a rule the enrolment code follows, because the
  -- enrolment code is exactly what a mistake would be in.
  constraint principals_installation_scopes check (
    kind <> 'installation' or scopes <@ array['telemetry.insert', 'observation.insert', 'read.minimal']
  ),
  -- The service scopes are equally closed. `run.register` on an installation
  -- would hand run classification to the agent, which is the whole of D36.
  constraint principals_service_scopes check (
    kind <> 'service' or scopes <@ array['run.register', 'proposal.read', 'proposal.ack', 'ci', 'read.minimal']
  )
);

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create table runs (
  run_id text primary key,
  owner_id uuid not null,
  -- Null for an unregistered run, which is therefore `operational` (D36).
  registered_by text references principals(id),
  origin_class text not null default 'operational',
  holdout_state text,
  eval_set_version text,
  simulation_id text,
  registered_at timestamptz,
  first_event_at timestamptz,
  telemetry_state text,
  qualification_eligible boolean,

  constraint runs_origin_class check (
    origin_class in ('development', 'qualification', 'operational', 'holdout', 'external_attestation')
  ),
  -- D36, as a constraint: an unregistered run cannot carry a stronger class.
  -- This is the single most important line in the file. Everything else about
  -- classification authority is enforcement on top of it; this is the floor.
  constraint runs_unregistered_is_operational check (
    registered_by is not null or origin_class = 'operational'
  ),
  constraint runs_registered_has_time check (
    registered_by is null or registered_at is not null
  ),
  -- D33: holdout_state belongs to holdout runs and to nothing else.
  constraint runs_holdout_state check (
    (origin_class = 'holdout' and holdout_state in ('active', 'retired')) or
    (origin_class <> 'holdout' and holdout_state is null)
  ),
  constraint runs_holdout_names_eval_set check (
    origin_class <> 'holdout' or eval_set_version is not null
  ),
  constraint runs_telemetry_state check (
    telemetry_state is null or telemetry_state in ('COMPLETE', 'INCOMPLETE')
  ),
  -- D23: telemetry loss must never look like a measured run.
  constraint runs_incomplete_is_not_eligible check (
    telemetry_state is distinct from 'INCOMPLETE' or qualification_eligible is not true
  ),
  -- D36: late registration is rejected. Enforced in `register_run` too; kept
  -- here so no future writer can create the state by another route.
  constraint runs_registration_precedes_first_event check (
    registered_at is null or first_event_at is null or registered_at <= first_event_at
  )
);

-- ---------------------------------------------------------------------------
-- Raw events
-- ---------------------------------------------------------------------------

create table raw_events (
  event_id text primary key,
  installation_id text not null references principals(id),
  owner_id uuid not null,
  run_id text not null references runs(run_id),
  -- Stamped from the Run record by the ingest RPC. A client cannot express one
  -- (the envelope has no such field) and the RPC never reads one from the
  -- payload, so this column can only ever hold the plane's own answer.
  origin_class text not null,
  emitter_id text not null,
  sequence bigint not null,
  event_type text not null,
  occurred_at timestamptz not null,
  observed_at timestamptz not null,
  -- Server-stamped. A client-supplied ingest time would make the investigation
  -- timeline a claim rather than a record.
  ingested_at timestamptz not null default now(),
  envelope jsonb not null,

  constraint raw_events_sequence_non_negative check (sequence >= 0)
);

-- The D26 ordering key. Indexed because every read of a run's timeline uses it,
-- and unique because two events sharing it would make the order undecidable.
create unique index raw_events_ordering
  on raw_events (installation_id, emitter_id, sequence);
create index raw_events_by_run on raw_events (run_id, ingested_at);

-- ---------------------------------------------------------------------------
-- Observations (staging; never in Git, F3)
-- ---------------------------------------------------------------------------

create table observations (
  observation_id text primary key,
  installation_id text not null references principals(id),
  owner_id uuid not null,
  run_id text not null references runs(run_id),
  origin_class text not null,
  subject_type text not null,
  subject_id text not null,
  ingested_at timestamptz not null default now(),
  payload jsonb not null
);

create index observations_by_subject on observations (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- Context snapshots (D25, T-05)
-- ---------------------------------------------------------------------------

create table context_snapshots (
  context_snapshot_id text primary key,
  installation_id text not null references principals(id),
  owner_id uuid not null,
  run_id text not null references runs(run_id),
  ingested_at timestamptz not null default now(),
  snapshot jsonb not null
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Enabled everywhere, with owner-scoped read policies and no write policy at
-- all. Writes arrive only through the SECURITY DEFINER functions below, which
-- run as the table owner and are granted to `service_role` alone. A leaked
-- publishable key therefore reads nothing and writes nothing.

alter table principals enable row level security;
alter table runs enable row level security;
alter table raw_events enable row level security;
alter table observations enable row level security;
alter table context_snapshots enable row level security;

create policy principals_owner_reads on principals
  for select to authenticated using (owner_id = auth.uid());
create policy runs_owner_reads on runs
  for select to authenticated using (owner_id = auth.uid());
create policy raw_events_owner_reads on raw_events
  for select to authenticated using (owner_id = auth.uid());
create policy observations_owner_reads on observations
  for select to authenticated using (owner_id = auth.uid());
create policy context_snapshots_owner_reads on context_snapshots
  for select to authenticated using (owner_id = auth.uid());

-- The owner may read their principals, but never the token hashes. Revoking
-- the column keeps `select *` from handing back the one value that, combined
-- with a guessed token, would confirm a guess.
revoke select (token_hash) on principals from authenticated;

-- ---------------------------------------------------------------------------
-- The authenticated-principal helper
-- ---------------------------------------------------------------------------

-- Resolve a principal from a token hash, or raise.
--
-- Every RPC starts here, and the three failure modes stay distinct: unknown,
-- revoked, expired. D22.5 requires revoked or expired tokens to "fail closed
-- with a distinct error the runtime surfaces in doctor", and a single generic
-- rejection would leave the owner unable to tell a rotated token from a
-- misconfigured one.
create or replace function ieos_principal(p_token_hash bytea, p_scope text)
returns principals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Named `caller`, not `found`: PL/pgSQL already has a FOUND variable, and
  -- shadowing it makes `if not found` a type error at run time rather than at
  -- definition time -- which is exactly how this was discovered.
  caller principals;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'ieos_invalid_token' using errcode = '28000';
  end if;

  select * into caller from principals where token_hash = p_token_hash;
  if not found then
    raise exception 'ieos_unknown_token' using errcode = '28000';
  end if;
  if caller.revoked_at is not null then
    raise exception 'ieos_revoked_token' using errcode = '28000';
  end if;
  if caller.expires_at <= now() then
    raise exception 'ieos_expired_token' using errcode = '28000';
  end if;
  if not (p_scope = any (caller.scopes)) then
    raise exception 'ieos_missing_scope_%', p_scope using errcode = '42501';
  end if;

  update principals set last_seen_at = now() where id = caller.id;
  return caller;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_run (D36)
-- ---------------------------------------------------------------------------

-- Pre-register a run's classification. Service principals only.
--
-- Two refusals matter more than the insert. A principal without
-- `run.register` -- every installation, by constraint -- cannot call this at
-- all. And a run that has already emitted an event cannot be reclassified:
-- late registration would let a run be measured first and labelled afterwards,
-- which is the failure D36 exists to prevent.
create or replace function register_run(
  p_token_hash bytea,
  p_run_id text,
  p_origin_class text,
  p_eval_set_version text default null,
  p_holdout_state text default null,
  p_simulation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller principals;
  existing runs;
begin
  caller := ieos_principal(p_token_hash, 'run.register');
  if caller.kind <> 'service' then
    raise exception 'ieos_not_a_service_principal' using errcode = '42501';
  end if;

  select * into existing from runs where run_id = p_run_id;
  if found then
    if existing.first_event_at is not null then
      raise exception 'ieos_late_registration' using errcode = '22023';
    end if;
    if existing.registered_by is not null then
      raise exception 'ieos_already_registered' using errcode = '23505';
    end if;
    update runs
       set registered_by = caller.id,
           registered_at = now(),
           origin_class = p_origin_class,
           holdout_state = p_holdout_state,
           eval_set_version = p_eval_set_version,
           simulation_id = p_simulation_id
     where run_id = p_run_id;
  else
    insert into runs (run_id, owner_id, registered_by, registered_at, origin_class,
                      holdout_state, eval_set_version, simulation_id)
    values (p_run_id, caller.owner_id, caller.id, now(), p_origin_class,
            p_holdout_state, p_eval_set_version, p_simulation_id);
  end if;

  return jsonb_build_object('run_id', p_run_id, 'origin_class', p_origin_class);
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_events (D22, D36)
-- ---------------------------------------------------------------------------

-- Insert telemetry events, stamping what only the plane may decide.
--
-- The run row is created on first event if `register_run` never ran, and it is
-- created `operational` -- the constraint on `runs` makes that the only value
-- an unregistered run can hold. `origin_class` on each event is then read from
-- that row. Nothing in `p_events` is consulted for it, and a payload that
-- carries one is not rejected but ignored, because rejecting would tell a
-- prober which field to stop sending.
--
-- Idempotent on `event_id`: a retried batch after a timeout must not duplicate
-- a run's history. The count of newly inserted ids comes back so the client can
-- acknowledge exactly what became durable.
create or replace function ingest_events(p_token_hash bytea, p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller principals;
  batch_size int;
  accepted text[];
begin
  caller := ieos_principal(p_token_hash, 'telemetry.insert');
  if caller.kind <> 'installation' then
    raise exception 'ieos_not_an_installation' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'ieos_events_not_an_array' using errcode = '22023';
  end if;

  batch_size := jsonb_array_length(p_events);
  if batch_size = 0 then
    return jsonb_build_object('accepted', '[]'::jsonb, 'count', 0);
  end if;
  -- D22.5 asks for body-size limits in the function. This is the same limit one
  -- layer down, so a caller that reached the RPC by another route still cannot
  -- push an unbounded batch through one transaction.
  if batch_size > 500 then
    raise exception 'ieos_batch_too_large' using errcode = '22023';
  end if;

  -- Every run named by the batch exists before any event references it.
  insert into runs (run_id, owner_id, first_event_at)
  select distinct e->>'run_id', caller.owner_id, now()
    from jsonb_array_elements(p_events) as e
  on conflict (run_id) do nothing;

  -- First event time is recorded once, so a later batch cannot move it earlier
  -- than a registration and make a late registration look timely.
  update runs
     set first_event_at = now()
   where first_event_at is null
     and run_id in (select e->>'run_id' from jsonb_array_elements(p_events) as e);

  with incoming as (
    select
      e->>'event_id'                          as event_id,
      e->>'run_id'                            as run_id,
      e->>'emitter_id'                        as emitter_id,
      ((e->'source')->>'sequence')::bigint    as sequence,
      e->>'event_type'                        as event_type,
      ((e->'time')->>'occurred_at')::timestamptz as occurred_at,
      ((e->'time')->>'observed_at')::timestamptz as observed_at,
      e                                       as envelope
    from jsonb_array_elements(p_events) as e
  )
  insert into raw_events (event_id, installation_id, owner_id, run_id, origin_class,
                          emitter_id, sequence, event_type, occurred_at, observed_at, envelope)
  select i.event_id, caller.id, caller.owner_id, i.run_id,
         -- From the Run record. This is the D36 stamp.
         r.origin_class,
         i.emitter_id, i.sequence, i.event_type, i.occurred_at, i.observed_at,
         -- Anything the client put in `origin_class` or `ingested_at` is
         -- dropped here rather than stored beside the plane's own answer,
         -- where a later reader could mistake it for one.
         (i.envelope - 'origin_class' - 'ingested_at')
    from incoming i
    join runs r on r.run_id = i.run_id
  on conflict (event_id) do nothing;

  select array_agg(event_id) into accepted
    from raw_events
   where event_id in (select e->>'event_id' from jsonb_array_elements(p_events) as e)
     and installation_id = caller.id;

  return jsonb_build_object(
    'accepted', to_jsonb(coalesce(accepted, array[]::text[])),
    'count', coalesce(array_length(accepted, 1), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_observations
-- ---------------------------------------------------------------------------

create or replace function ingest_observations(p_token_hash bytea, p_observations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller principals;
  batch_size int;
  accepted text[];
begin
  caller := ieos_principal(p_token_hash, 'observation.insert');
  if caller.kind <> 'installation' then
    raise exception 'ieos_not_an_installation' using errcode = '42501';
  end if;
  if jsonb_typeof(p_observations) <> 'array' then
    raise exception 'ieos_observations_not_an_array' using errcode = '22023';
  end if;
  batch_size := jsonb_array_length(p_observations);
  if batch_size = 0 then
    return jsonb_build_object('accepted', '[]'::jsonb, 'count', 0);
  end if;
  if batch_size > 500 then
    raise exception 'ieos_batch_too_large' using errcode = '22023';
  end if;

  insert into runs (run_id, owner_id, first_event_at)
  select distinct o->>'run_id', caller.owner_id, now()
    from jsonb_array_elements(p_observations) as o
  on conflict (run_id) do nothing;

  insert into observations (observation_id, installation_id, owner_id, run_id,
                            origin_class, subject_type, subject_id, payload)
  select o->>'observation_id', caller.id, caller.owner_id, o->>'run_id',
         r.origin_class,
         (o->'subject')->>'type', (o->'subject')->>'id',
         (o - 'origin_class' - 'ingested_at')
    from jsonb_array_elements(p_observations) as o
    join runs r on r.run_id = o->>'run_id'
  on conflict (observation_id) do nothing;

  select array_agg(observation_id) into accepted
    from observations
   where observation_id in (select o->>'observation_id' from jsonb_array_elements(p_observations) as o)
     and installation_id = caller.id;

  return jsonb_build_object(
    'accepted', to_jsonb(coalesce(accepted, array[]::text[])),
    'count', coalesce(array_length(accepted, 1), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ingest_context_snapshots (D25)
-- ---------------------------------------------------------------------------

create or replace function ingest_context_snapshots(p_token_hash bytea, p_snapshots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller principals;
  accepted text[];
begin
  caller := ieos_principal(p_token_hash, 'telemetry.insert');
  if caller.kind <> 'installation' then
    raise exception 'ieos_not_an_installation' using errcode = '42501';
  end if;
  if jsonb_typeof(p_snapshots) <> 'array' then
    raise exception 'ieos_snapshots_not_an_array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_snapshots) > 500 then
    raise exception 'ieos_batch_too_large' using errcode = '22023';
  end if;

  insert into runs (run_id, owner_id, first_event_at)
  select distinct s->>'run_id', caller.owner_id, now()
    from jsonb_array_elements(p_snapshots) as s
  on conflict (run_id) do nothing;

  insert into context_snapshots (context_snapshot_id, installation_id, owner_id, run_id, snapshot)
  select s->>'context_snapshot_id', caller.id, caller.owner_id, s->>'run_id', s
    from jsonb_array_elements(p_snapshots) as s
  on conflict (context_snapshot_id) do nothing;

  select array_agg(context_snapshot_id) into accepted
    from context_snapshots
   where context_snapshot_id in
         (select s->>'context_snapshot_id' from jsonb_array_elements(p_snapshots) as s)
     and installation_id = caller.id;

  return jsonb_build_object(
    'accepted', to_jsonb(coalesce(accepted, array[]::text[])),
    'count', coalesce(array_length(accepted, 1), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- read_minimal (D22.3)
-- ---------------------------------------------------------------------------

-- Health, score overlay, own-run status. Never a general query.
--
-- The vocabulary of kinds is closed, and an unrecognised one raises rather than
-- returning empty: "no such read" and "that read found nothing" are different
-- answers, and a caller that cannot tell them apart will treat a typo as a fact.
--
-- `run_status` is scoped to the caller's OWN runs. That scoping is the whole of
-- D22.3's "no reads of other installations' sensitive records"; without the
-- `installation_id` predicate this function would be the general query the
-- design says must not exist.
create or replace function read_minimal(p_token_hash bytea, p_kind text, p_arg text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller principals;
  result jsonb;
begin
  caller := ieos_principal(p_token_hash, 'read.minimal');

  if p_kind = 'health' then
    return jsonb_build_object('ok', true, 'now', now());

  elsif p_kind = 'run_status' then
    if p_arg is null then
      raise exception 'ieos_run_id_required' using errcode = '22023';
    end if;
    select jsonb_build_object(
             'run_id', r.run_id,
             'origin_class', r.origin_class,
             'telemetry_state', r.telemetry_state,
             'qualification_eligible', r.qualification_eligible,
             'event_count', (select count(*) from raw_events e
                              where e.run_id = r.run_id and e.installation_id = caller.id)
           )
      into result
      from runs r
     where r.run_id = p_arg
       and exists (select 1 from raw_events e
                    where e.run_id = r.run_id and e.installation_id = caller.id);
    return coalesce(result, jsonb_build_object('run_id', p_arg, 'known', false));

  elsif p_kind = 'score_overlay' then
    -- Deliberately empty at Stage 2 and deliberately not absent. Scoring is
    -- Stage 10; an overlay invented here would be a scoring policy written by
    -- a read endpoint. `state: UNPROVEN` is the same answer the bootstrap
    -- snapshot gives, so a client that switches from bootstrap to this read
    -- sees no change until there is something real to see (D24).
    return jsonb_build_object('state', 'UNPROVEN', 'scores', '[]'::jsonb,
                              'computed_at', null, 'scoring_policy_version', '0');
  end if;

  raise exception 'ieos_unknown_read_kind_%', p_kind using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- These functions bypass RLS. Reaching them from a publishable key would make
-- every policy above decoration, so execute is revoked from everyone and
-- granted to `service_role` alone -- the identity that exists only inside the
-- Edge Function's secrets.
--
-- `ieos_principal` is not granted at all: it is the resolver the others call,
-- and exposing it would turn the RPC surface into a token oracle.

revoke all on function ieos_principal(bytea, text) from public;
revoke all on function register_run(bytea, text, text, text, text, text) from public;
revoke all on function ingest_events(bytea, jsonb) from public;
revoke all on function ingest_observations(bytea, jsonb) from public;
revoke all on function ingest_context_snapshots(bytea, jsonb) from public;
revoke all on function read_minimal(bytea, text, text) from public;

grant execute on function register_run(bytea, text, text, text, text, text) to service_role;
grant execute on function ingest_events(bytea, jsonb) to service_role;
grant execute on function ingest_observations(bytea, jsonb) to service_role;
grant execute on function ingest_context_snapshots(bytea, jsonb) to service_role;
grant execute on function read_minimal(bytea, text, text) to service_role;

-- Not created at Stage 2: `candidates`, `promotion_proposals`, and the
-- `read_proposals` / `ack_proposal` RPCs the guide's section 5.9 table lists
-- for `proposal.*` principals. They belong to Stage 10's promotion policy, and
-- an empty table with a stub RPC would answer "no proposals" to a caller that
-- cannot tell that from "proposals are not implemented here". The scopes are
-- already in the constraint above, so adding them later needs no migration of
-- the principals table.
