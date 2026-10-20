-- Private, opt-in output copies only. Local filesystem paths never enter Storage.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-outputs', 'task-outputs', false, 26214400)
on conflict (id) do nothing;
create policy dayweave_outputs_read_own on storage.objects for select to authenticated
using (bucket_id = 'task-outputs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy dayweave_outputs_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'task-outputs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy dayweave_outputs_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'task-outputs' and (storage.foldername(name))[1] = (select auth.uid())::text);
