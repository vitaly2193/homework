begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create function homework_private.invoke_reminders() returns bigint language sql security definer set search_path='' as $$
 select net.http_post(
  url:='https://waeaktwcryulosjchxvd.supabase.co/functions/v1/send-reminders',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhZWFrdHdjcnl1bG9zamNoeHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzUxMzksImV4cCI6MjEwNTIxMTEzOX0.kdZIDcS7LatyR4NwUPTRr_5v0zPez_6iAIOWTiH8rVA','x-job-secret',c.job_secret),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 ) from homework_private.push_config c where singleton
 and exists(select 1 from public.reminder_settings r join public.push_subscriptions s on s.user_id=r.user_id where r.enabled and (now() at time zone 'Europe/Moscow')::time>=r.reminder_time and (now() at time zone 'Europe/Moscow')::time<r.reminder_time+interval '30 minutes');
$$;
revoke all on function homework_private.invoke_reminders() from public,anon,authenticated;
select cron.schedule('homework-reminders','* * * * *','select homework_private.invoke_reminders()');
commit;
