begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into public.families(id,owner_id,schedule) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"days":[{"iso_weekday":1,"lessons":[{"subject":"Русский"}]},{"iso_weekday":2,"lessons":[{"subject":"Русский"}]},{"iso_weekday":3,"lessons":[{"subject":"Русский"}]},{"iso_weekday":4,"lessons":[{"subject":"Русский"}]},{"iso_weekday":5,"lessons":[{"subject":"Русский"}]}]}'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','{"days":[{"iso_weekday":1,"lessons":[]}]}');
insert into public.family_members(user_id,family_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
insert into public.assignments(family_id,subject,body,due_date,created_by) values
 ('20000000-0000-4000-8000-000000000001','Русский язык','Own family',current_date,'10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','Русский язык','Other family',current_date,'10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$declare n int; begin
 if (select count(*) from public.assignments)<>1 then raise exception 'RLS read leak'; end if;
 update public.assignments set body='Bad update' where family_id='20000000-0000-4000-8000-000000000002';
 get diagnostics n=row_count; if n<>0 then raise exception 'RLS write leak'; end if;
 begin
  insert into public.assignments(family_id,subject,body,due_date) values('20000000-0000-4000-8000-000000000002','x','illegal',current_date);
  raise exception 'RLS cross-family insert succeeded';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('authenticated','public.push_worker_config()','EXECUTE') then raise exception 'Push credentials exposed'; end if;
 if has_function_privilege('anon','public.create_family(jsonb)','EXECUTE') then raise exception 'Anonymous family creation allowed'; end if;
end $$;
select public.create_family_invite();
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin if (select count(*) from public.assignments)<>0 then raise exception 'Unjoined user read leak'; end if; end$$;
reset role;
insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('10000000-0000-4000-8000-000000000001','https://fcm.googleapis.com/test-rollback-only','test','test');
insert into public.reminder_settings(user_id,enabled,reminder_time) values('10000000-0000-4000-8000-000000000001',true,((now() at time zone 'Europe/Moscow')-interval '1 minute')::time);
do $$declare batch jsonb; begin
 batch=public.claim_homework_reminders();
 if jsonb_array_length(batch)<>1 then raise exception 'Reminder not queued'; end if;
 if (batch->0->>'pending')::int<>1 or (batch->0->>'missing')::int<>1 then raise exception 'Reminder counts incorrect'; end if;
 if jsonb_array_length(public.claim_homework_reminders())<>0 then raise exception 'Duplicate reminder claimed'; end if;
end$$;
rollback;
