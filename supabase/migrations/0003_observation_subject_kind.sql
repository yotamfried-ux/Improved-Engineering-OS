-- 0003: read the observation subject the way the Agent Contract writes it.
--
-- 0001 built `observations.subject_type` from `(o->'subject')->>'type'`. No
-- producer in this repository emits that key. The Agent Contract types the
-- subject as `{kind, id}`: see the observation schema under
-- `contracts/schemas/`, whose `properties.subject.required` is
-- `['kind','id']`, and the `handleSchema` definition in `packages/core` it is
-- generated from. So the expression returned NULL for every real observation,
-- and the insert then violated the `subject_type text not null` constraint.
--
-- This was not caught by the suite, which used a `{type, id}` fixture of its
-- own making, and not by the Edge Function, which passes the envelope through
-- untouched. It was caught by the first live canary on the owner's Windows
-- machine, where every observation in a real run was refused by the database.
-- The suite's fixture is corrected alongside this migration, so the test that
-- would have caught it now exists.
--
-- `create or replace` deliberately: it rewrites the body in place and so keeps
-- the function's owner and the `revoke`/`grant execute` set that 0001 applied
-- to it. Nothing here re-grants, because nothing here needs to. The signature,
-- the language, the `security definer` marking and the `search_path` are
-- unchanged from 0001; the sole difference is `->>'type'` becoming `->>'kind'`.

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
         (o->'subject')->>'kind', (o->'subject')->>'id',
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
