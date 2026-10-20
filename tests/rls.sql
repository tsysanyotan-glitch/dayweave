-- Run as postgres against the configured development project. All test rows roll back.
begin;
insert into auth.users (id, email) values
 ('f43043b0-cf76-4162-ac19-dfc09a8eac51', 'rls-a@dayweave.invalid'),
 ('718d19ab-c7be-4f3d-88f6-74f72e027558', 'rls-b@dayweave.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f43043b0-cf76-4162-ac19-dfc09a8eac51', true);
do $$
declare
 task_id uuid := 'd1a4ceda-7309-4a44-b93a-663530b0bb51';
 mutation uuid := '50bb4a19-f9f3-4192-895b-0408ab229c9f';
 doc jsonb := '{"id":"d1a4ceda-7309-4a44-b93a-663530b0bb51","title":"RLS test","note":"","date":"2026-10-20","status":"todo","priority":"medium","assignee":"自己","project":"","link":"","waiting":false,"starred":false,"steps":[],"createdAt":"2026-10-20T00:00:00Z","updatedAt":"2026-10-20T00:00:00Z","deletedAt":null}';
 result public.tasks;
begin
 select * into result from public.commit_task(task_id, 0, doc, mutation);
 if result.revision <> 1 then raise exception 'Initial revision failed'; end if;
 select * into result from public.commit_task(task_id, 0, doc, mutation);
 if result.revision <> 1 then raise exception 'Retry not idempotent'; end if;
 select * into result from public.commit_task(task_id, 1, jsonb_set(doc,'{status}','"doing"'), gen_random_uuid());
 if result.revision <> 2 or result.document->>'status' <> 'doing' then raise exception 'Update failed'; end if;
 begin
   perform public.commit_task(task_id, 1, doc, gen_random_uuid());
   raise exception 'Stale write was accepted';
 exception when sqlstate 'PT409' then null;
 end;
end $$;
select set_config('request.jwt.claim.sub', '718d19ab-c7be-4f3d-88f6-74f72e027558', true);
do $$
begin
 if exists(select 1 from public.tasks where id='d1a4ceda-7309-4a44-b93a-663530b0bb51') then raise exception 'Cross-user read leaked'; end if;
 update public.tasks set document=jsonb_set(document,'{title}','"stolen"') where id='d1a4ceda-7309-4a44-b93a-663530b0bb51';
 if found then raise exception 'Cross-user update accepted'; end if;
 begin
   insert into public.tasks(user_id,id,document,last_mutation_id)
   values('f43043b0-cf76-4162-ac19-dfc09a8eac51',gen_random_uuid(),'{}',gen_random_uuid());
   raise exception 'Cross-user insert accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'PASS: revision, idempotency, stale-write rejection, cross-user read/update/insert isolation' as result;
rollback;
