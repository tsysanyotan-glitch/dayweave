-- One row per task; substeps are part of the atomic task document.
create table public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  last_mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint task_document_valid check (
    jsonb_typeof(document) = 'object'
    and document ?& array['id','title','note','date','status','priority','assignee','project','link','waiting','starred','steps','createdAt','updatedAt','deletedAt']
    and document->>'id' = id::text
    and jsonb_typeof(document->'title') = 'string'
    and length(btrim(document->>'title')) between 1 and 300
    and document->>'status' in ('todo','doing','done')
    and document->>'priority' in ('high','medium','low')
    and jsonb_typeof(document->'date') = 'string'
    and document->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    and jsonb_typeof(document->'steps') = 'array'
    and jsonb_array_length(document->'steps') <= 200
    and jsonb_typeof(document->'waiting') = 'boolean'
    and jsonb_typeof(document->'starred') = 'boolean'
    and octet_length(document::text) <= 262144
  )
);
create index tasks_user_updated_idx on public.tasks (user_id, updated_at);
create index tasks_user_date_idx on public.tasks (user_id, (document->>'date'));
alter table public.tasks enable row level security;
revoke all on public.tasks from anon;
grant select, insert, update on public.tasks to authenticated;
create policy tasks_select_own on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy tasks_insert_own on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy tasks_update_own on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.task_revision_bump()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.task_revision_bump() from public, anon, authenticated;
create trigger task_revision_bump before update on public.tasks
for each row execute function public.task_revision_bump();

-- Compare-and-swap plus idempotency: retries cannot overwrite a newer revision.
create function public.commit_task(p_id uuid, p_expected_revision bigint, p_document jsonb, p_mutation_id uuid)
returns setof public.tasks language plpgsql security invoker set search_path = ''
as $$
declare
  current_task public.tasks;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_document is null or p_mutation_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid task mutation' using errcode = '22023';
  end if;
  -- Reject normalized dates such as 2026-02-31.
  if to_char((p_document->>'date')::date, 'YYYY-MM-DD') is distinct from p_document->>'date' then
    raise exception 'Invalid task date' using errcode = '22023';
  end if;
  select * into current_task from public.tasks
    where user_id = owner_id and id = p_id for update;
  if found then
    if current_task.last_mutation_id = p_mutation_id then
      return next current_task;
      return;
    end if;
    if current_task.revision <> p_expected_revision then
      raise exception 'Task changed on another device' using errcode = '40001';
    end if;
    update public.tasks set document = p_document, last_mutation_id = p_mutation_id
      where user_id = owner_id and id = p_id returning * into current_task;
  else
    if p_expected_revision <> 0 then
      raise exception 'Task revision no longer exists' using errcode = '40001';
    end if;
    insert into public.tasks (user_id, id, document, last_mutation_id)
      values (owner_id, p_id, p_document, p_mutation_id)
      on conflict (user_id, id) do nothing returning * into current_task;
    if not found then
      raise exception 'Task created on another device' using errcode = '40001';
    end if;
  end if;
  return next current_task;
end;
$$;
revoke all on function public.commit_task(uuid, bigint, jsonb, uuid) from public, anon;
grant execute on function public.commit_task(uuid, bigint, jsonb, uuid) to authenticated;
alter publication supabase_realtime add table public.tasks;
