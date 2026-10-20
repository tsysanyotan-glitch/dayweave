-- Isolated fixtures; no emails are sent. Everything rolls back.
begin;
insert into auth.users(id,email) values
 ('132c0da1-2960-41ed-88ad-b94c9cc10228','api-rls-a@dayweave.invalid'),
 ('ac10b1c6-f829-40f4-987a-c0554b294dde','api-rls-b@dayweave.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','132c0da1-2960-41ed-88ad-b94c9cc10228',true);
insert into public.task_api_keys(user_id,name,token_hash,prefix,permissions,expires_at)
 values('132c0da1-2960-41ed-88ad-b94c9cc10228','test',repeat('a',64),'dw_aaaaaaaaaaaa',array['tasks:read'],now()+interval '1 day');
do $$ begin
  begin perform token_hash from public.task_api_keys; raise exception 'Token hash leaked'; exception when insufficient_privilege then null; end;
  begin perform * from public.authorize_task_api(repeat('a',64)); raise exception 'Authenticated caller can invoke gateway'; exception when insufficient_privilege then null; end;
  begin perform * from public.commit_task_api('ac10b1c6-f829-40f4-987a-c0554b294dde',gen_random_uuid(),0,'{}',gen_random_uuid()); raise exception 'Privileged write exposed'; exception when insufficient_privilege then null; end;
  begin update public.task_api_keys set permissions=array['tasks:write']; raise exception 'Key scope editable'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','ac10b1c6-f829-40f4-987a-c0554b294dde',true);
do $$ begin
  if exists(select id from public.task_api_keys) then raise exception 'Another user can list keys'; end if;
  update public.task_api_keys set revoked_at=now() where user_id='132c0da1-2960-41ed-88ad-b94c9cc10228';
  if found then raise exception 'Cross-user revoke accepted'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare owner uuid; i integer; begin
  for i in 1..60 loop
    select user_id into owner from public.authorize_task_api(repeat('a',64));
    if owner <> '132c0da1-2960-41ed-88ad-b94c9cc10228'::uuid then raise exception 'Wrong owner'; end if;
  end loop;
  begin perform * from public.authorize_task_api(repeat('a',64)); raise exception 'Limit not enforced'; exception when sqlstate 'PT429' then null; end;
end $$;
update public.task_api_keys set revoked_at=now() where token_hash=repeat('a',64);
do $$ begin
  begin perform * from public.authorize_task_api(repeat('a',64)); raise exception 'Revoked key accepted'; exception when sqlstate 'PT401' then null; end;
end $$;
reset role;
select 'PASS: own-key creation, column grants, cross-account key isolation, service-only RPC, atomic rate limit, revocation' as result;
rollback;
