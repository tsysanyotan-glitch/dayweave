create or replace function public.commit_task(p_id uuid, p_expected_revision bigint, p_document jsonb, p_mutation_id uuid)
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
      raise exception 'Task changed on another device' using errcode = 'PT409';
    end if;
    update public.tasks set document = p_document, last_mutation_id = p_mutation_id
      where user_id = owner_id and id = p_id returning * into current_task;
  else
    if p_expected_revision <> 0 then
      raise exception 'Task revision no longer exists' using errcode = 'PT409';
    end if;
    insert into public.tasks (user_id, id, document, last_mutation_id)
      values (owner_id, p_id, p_document, p_mutation_id)
      on conflict (user_id, id) do nothing returning * into current_task;
    if not found then
      raise exception 'Task created on another device' using errcode = 'PT409';
    end if;
  end if;
  return next current_task;
end;
$$;

