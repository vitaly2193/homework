begin;
alter table public.push_subscriptions add constraint push_endpoint_provider check(endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|wns\.windows\.com)/[^[:space:]]+$');
create function homework_private.validate_schedule() returns trigger language plpgsql set search_path='' as $$
declare d jsonb; l jsonb;
begin
 if jsonb_typeof(new.schedule->'days') is distinct from 'array' or jsonb_array_length(new.schedule->'days') not between 1 and 7 then raise exception 'Invalid timetable days'; end if;
 for d in select value from jsonb_array_elements(new.schedule->'days') loop
  if not coalesce((d->>'iso_weekday') ~ '^[1-7]$',false) or jsonb_typeof(d->'lessons') is distinct from 'array' then raise exception 'Invalid timetable day'; end if;
  for l in select value from jsonb_array_elements(d->'lessons') loop
   if jsonb_typeof(l->'subject') not in ('null','string') then raise exception 'Invalid subject'; end if;
  end loop;
 end loop;
 return new;
end; $$;
revoke all on function homework_private.validate_schedule() from public,anon,authenticated;
create trigger validate_family_schedule before insert or update of schedule on public.families for each row execute function homework_private.validate_schedule();
commit;
