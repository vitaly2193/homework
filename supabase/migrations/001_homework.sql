begin;
create schema if not exists homework_private;
revoke all on schema homework_private from public, anon, authenticated;

create table public.families (
 id uuid primary key default gen_random_uuid(),
 name text not null default 'Наша семья',
 owner_id uuid not null references auth.users(id),
 timezone text not null default 'Europe/Moscow' check(timezone='Europe/Moscow'),
 schedule jsonb not null,
 created_at timestamptz not null default now()
);
create table public.family_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 family_id uuid not null references public.families(id) on delete cascade,
 joined_at timestamptz not null default now()
);
create index family_members_family on public.family_members(family_id);
create table homework_private.invites (
 code text primary key default encode(extensions.gen_random_bytes(24),'hex'),
 family_id uuid not null references public.families(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days'
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 subject text not null check(length(subject) between 1 and 120),
 body text not null check(length(trim(body)) between 1 and 5000),
 due_date date not null,
 status text not null default 'todo' check(status in ('todo','doing','done')),
 source_text text not null default '' check(length(source_text)<=12000),
 attachment_path text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index assignments_family_due on public.assignments(family_id,due_date);
create table public.lesson_checks (
 family_id uuid not null references public.families(id) on delete cascade,
 subject text not null,
 due_date date not null,
 primary key(family_id,subject,due_date)
);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048),
 p256dh text not null,
 auth text not null,
 created_at timestamptz not null default now()
);
create table public.reminder_settings (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 reminder_time time not null default '19:00'
);
create table homework_private.push_config (
 singleton boolean primary key default true check(singleton),
 public_key text not null,
 private_key text not null,
 job_secret text not null
);
create table homework_private.reminder_deliveries (
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 reminder_date date not null,
 state text not null default 'pending' check(state in ('pending','sent')),
 leased_until timestamptz not null default now(),
 attempts int not null default 0,
 primary key(subscription_id,reminder_date)
);

create function public.my_family_id() returns uuid language sql stable security definer set search_path='' as $$
 select family_id from public.family_members where user_id=auth.uid();
$$;
revoke all on function public.my_family_id() from public;
grant execute on function public.my_family_id() to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.assignments enable row level security;
alter table public.lesson_checks enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_settings enable row level security;
revoke all on public.families, public.family_members, public.assignments, public.lesson_checks, public.push_subscriptions, public.reminder_settings from anon;
grant select on public.families, public.family_members to authenticated;
grant update(name,schedule) on public.families to authenticated;
grant select,insert,update,delete on public.assignments, public.lesson_checks, public.push_subscriptions, public.reminder_settings to authenticated;
create policy family_read on public.families for select to authenticated using(id=public.my_family_id());
create policy family_update on public.families for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy members_read on public.family_members for select to authenticated using(family_id=public.my_family_id());
create policy homework_read on public.assignments for select to authenticated using(family_id=public.my_family_id());
create policy homework_insert on public.assignments for insert to authenticated with check(family_id=public.my_family_id() and created_by=auth.uid());
create policy homework_update on public.assignments for update to authenticated using(family_id=public.my_family_id()) with check(family_id=public.my_family_id());
create policy homework_delete on public.assignments for delete to authenticated using(family_id=public.my_family_id());
create policy checks_member on public.lesson_checks for all to authenticated using(family_id=public.my_family_id()) with check(family_id=public.my_family_id());
create policy subscription_owner on public.push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy reminder_owner on public.reminder_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.create_family(p_schedule jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if public.my_family_id() is not null then raise exception 'Already in a family'; end if;
 if jsonb_typeof(p_schedule->'days') is distinct from 'array' then raise exception 'Invalid timetable'; end if;
 insert into public.families(owner_id,schedule) values(auth.uid(),p_schedule) returning id into f;
 insert into public.family_members(user_id,family_id) values(auth.uid(),f);
 return f;
end; $$;
create function public.create_family_invite() returns text language plpgsql security definer set search_path='' as $$
declare f uuid; c text;
begin
 select id into f from public.families where owner_id=auth.uid() and id=public.my_family_id();
 if f is null then raise exception 'Only the family owner can invite'; end if;
 delete from homework_private.invites where family_id=f;
 insert into homework_private.invites(family_id) values(f) returning code into c;
 return c;
end; $$;
create function public.join_family(p_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if public.my_family_id() is not null then raise exception 'Already in a family'; end if;
 select family_id into f from homework_private.invites where code=trim(p_code) and expires_at>now();
 if f is null then raise exception 'Invalid or expired invitation'; end if;
 insert into public.family_members(user_id,family_id) values(auth.uid(),f);
 return f;
end; $$;
revoke all on function public.create_family(jsonb), public.create_family_invite(), public.join_family(text) from public;
grant execute on function public.create_family(jsonb), public.create_family_invite(), public.join_family(text) to authenticated;
create function homework_private.touch_assignment() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); new.created_by=old.created_by; new.created_at=old.created_at; return new; end; $$;
create trigger assignment_updated before update on public.assignments for each row execute function homework_private.touch_assignment();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('homework-attachments','homework-attachments',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy attachment_read on storage.objects for select to authenticated using(bucket_id='homework-attachments' and (storage.foldername(name))[1]=public.my_family_id()::text);
create policy attachment_write on storage.objects for insert to authenticated with check(bucket_id='homework-attachments' and (storage.foldername(name))[1]=public.my_family_id()::text);
create policy attachment_delete on storage.objects for delete to authenticated using(bucket_id='homework-attachments' and (storage.foldername(name))[1]=public.my_family_id()::text);

create function public.push_public_key() returns text language sql stable security definer set search_path='' as $$select public_key from homework_private.push_config where singleton;$$;
revoke all on function public.push_public_key() from public;
grant execute on function public.push_public_key() to authenticated;

-- The notification worker is the only caller of these privileged functions.
create function public.push_worker_config() returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(c) from homework_private.push_config c where singleton;$$;
revoke all on function public.push_worker_config() from public,anon,authenticated;
grant execute on function public.push_worker_config() to service_role;

create function homework_private.subject_name(s text) returns text language sql immutable set search_path='' as $$
 select case when s like 'Лит.чтение%' then 'Литературное чтение' when s='Русский' then 'Русский язык' when s='Англ.яз.' then 'Английский язык' when s='Окружающий' then 'Окружающий мир' when s='ФЗК' then 'Физкультура' else s end;
$$;
create function public.claim_homework_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; day date; target date; pending integer; missing integer; claimed uuid; result jsonb='[]'::jsonb;
begin
 for r in select s.*, f.id as family_id, f.schedule, f.timezone, rs.reminder_time
 from public.push_subscriptions s join public.reminder_settings rs on rs.user_id=s.user_id and rs.enabled
 join public.family_members m on m.user_id=s.user_id join public.families f on f.id=m.family_id
 where (now() at time zone f.timezone)::time >= rs.reminder_time
 and (now() at time zone f.timezone)::time < rs.reminder_time+interval '30 minutes'
 loop
  day=(now() at time zone r.timezone)::date;
  select d::date into target from generate_series(day+1, day+7, interval '1 day') d
   where exists(select 1 from jsonb_array_elements(r.schedule->'days') x where (x->>'iso_weekday')::int=extract(isodow from d)) order by d limit 1;
  if target is null then continue; end if;
  select count(*) into pending from public.assignments where family_id=r.family_id and due_date<=target and status<>'done';
  select count(distinct homework_private.subject_name(l->>'subject')) into missing from jsonb_array_elements(r.schedule->'days') d
  cross join lateral jsonb_array_elements(d->'lessons') l
  where (d->>'iso_weekday')::int=extract(isodow from target) and l->>'subject' is not null
   and not exists(select 1 from public.assignments a where a.family_id=r.family_id and a.due_date=target and a.subject=homework_private.subject_name(l->>'subject'))
   and not exists(select 1 from public.lesson_checks c where c.family_id=r.family_id and c.due_date=target and c.subject=homework_private.subject_name(l->>'subject'));
  if pending=0 and missing=0 then continue; end if;
  claimed=null;
  insert into homework_private.reminder_deliveries(subscription_id,reminder_date,leased_until,attempts)
   values(r.id,day,now()+interval '5 minutes',1)
   on conflict(subscription_id,reminder_date) do update set leased_until=now()+interval '5 minutes',attempts=homework_private.reminder_deliveries.attempts+1
   where homework_private.reminder_deliveries.state='pending' and homework_private.reminder_deliveries.leased_until<now() and homework_private.reminder_deliveries.attempts<3
   returning subscription_id into claimed;
  if claimed is not null then
   result=result||jsonb_build_array(jsonb_build_object('id',r.id,'date',day,'endpoint',r.endpoint,'keys',jsonb_build_object('p256dh',r.p256dh,'auth',r.auth),'pending',pending,'missing',missing,'dueDate',target));
  end if;
 end loop;
 return result;
end; $$;
create function public.complete_homework_reminder(p_id uuid,p_date date,p_expired boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_expired then delete from public.push_subscriptions where id=p_id;
 else update homework_private.reminder_deliveries set state='sent' where subscription_id=p_id and reminder_date=p_date; end if;
end; $$;
revoke all on function public.claim_homework_reminders(), public.complete_homework_reminder(uuid,date,boolean) from public,anon,authenticated;
grant execute on function public.claim_homework_reminders(), public.complete_homework_reminder(uuid,date,boolean) to service_role;
commit;
