-- Personal integration keys: plaintext is generated once on the signed-in client.
create table public.task_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  prefix text not null check (prefix ~ '^dw_[a-f0-9]{12}$'),
  permissions text[] not null default array['tasks:read','tasks:write']
    check (cardinality(permissions) > 0 and permissions <@ array['tasks:read','tasks:write']),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '366 days'),
  revoked_at timestamptz,
  last_used_at timestamptz,
  window_start timestamptz not null default now(),
  window_requests integer not null default 0
);
create index task_api_keys_user_idx on public.task_api_keys(user_id);
alter table public.task_api_keys enable row level security;
revoke all on public.task_api_keys from public, anon, authenticated;
grant select(id,user_id,name,prefix,permissions,created_at,expires_at,revoked_at,last_used_at) on public.task_api_keys to authenticated;
grant insert(user_id,name,token_hash,prefix,permissions,expires_at) on public.task_api_keys to authenticated;
grant update(revoked_at) on public.task_api_keys to authenticated;
grant all on public.task_api_keys to service_role;
create policy api_keys_select_own on public.task_api_keys for select to authenticated using ((select auth.uid()) = user_id);
create policy api_keys_insert_own on public.task_api_keys for insert to authenticated with check ((select auth.uid()) = user_id);
create policy api_keys_revoke_own on public.task_api_keys for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Service-only invoker functions do not elevate callers. No secret or user ID
-- from the public HTTP request is trusted as a database authorization claim.
create function public.authorize_task_api(p_hash text)
returns table(user_id uuid, permissions text[]) language plpgsql security invoker set search_path = '' as $$
declare k public.task_api_keys;
begin
  select * into k from public.task_api_keys where token_hash = p_hash for update;
  if not found or k.revoked_at is not null or k.expires_at <= clock_timestamp() then
    raise exception 'Invalid or expired API key' using errcode = 'PT401';
  end if;
  if k.window_start <= clock_timestamp() - interval '1 minute' then
    k.window_start := clock_timestamp(); k.window_requests := 0;
  end if;
  if k.window_requests >= 60 then raise exception 'Rate limit exceeded' using errcode = 'PT429'; end if;
  update public.task_api_keys set window_start=k.window_start, window_requests=k.window_requests+1, last_used_at=clock_timestamp() where id=k.id;
  return query select k.user_id, k.permissions;
end $$;
revoke all on function public.authorize_task_api(text) from public, anon, authenticated;
grant execute on function public.authorize_task_api(text) to service_role;

create function public.commit_task_api(p_user_id uuid, p_id uuid, p_expected_revision bigint, p_document jsonb, p_mutation_id uuid)
returns setof public.tasks language plpgsql security invoker set search_path = '' as $$
declare current_task public.tasks;
begin
  if p_user_id is null or p_mutation_id is null or p_expected_revision is null or p_expected_revision < 0 or p_document is null then
    raise exception 'Invalid task mutation' using errcode = '22023';
  end if;
  if to_char((p_document->>'date')::date, 'YYYY-MM-DD') is distinct from p_document->>'date' then
    raise exception 'Invalid task date' using errcode = '22023';
  end if;
  select * into current_task from public.tasks where user_id=p_user_id and id=p_id for update;
  if found then
    if current_task.last_mutation_id = p_mutation_id then return next current_task; return; end if;
    if current_task.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
    update public.tasks set document=p_document, last_mutation_id=p_mutation_id where user_id=p_user_id and id=p_id returning * into current_task;
  else
    if p_expected_revision <> 0 then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
    insert into public.tasks(user_id,id,document,last_mutation_id) values(p_user_id,p_id,p_document,p_mutation_id)
      on conflict(user_id,id) do nothing returning * into current_task;
    if not found then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
  end if;
  return next current_task;
end $$;
revoke all on function public.commit_task_api(uuid,uuid,bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.commit_task_api(uuid,uuid,bigint,jsonb,uuid) to service_role;
grant select,insert,update on public.tasks to service_role;
