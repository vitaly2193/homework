begin;
-- Supabase default privileges grant named roles directly as well as PUBLIC.
revoke all on function public.my_family_id(), public.create_family(jsonb), public.create_family_invite(), public.join_family(text), public.push_public_key() from anon;
revoke all on all tables in schema homework_private from public,anon,authenticated;
revoke all on all functions in schema homework_private from public,anon,authenticated;
commit;
