-- Event-trigger execution remains owned by postgres; API clients do not need this entry point.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
