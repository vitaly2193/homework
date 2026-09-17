// Scheduled by pg_cron. No browser calls; both a valid gateway JWT and job secret are required.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req: Request) => {
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=req.headers.get('x-job-secret');
 if(!secret||secret.length!==64)return new Response('Unauthorized',{status:401});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:config,error:configError}=await db.rpc('push_worker_config');
 if(configError||!config)return new Response('Configuration unavailable',{status:503});
 // Fixed-length comparison avoids prefix-dependent timing.
 let diff=secret.length^config.job_secret.length;
 for(let i=0;i<secret.length;i++)diff|=secret.charCodeAt(i)^config.job_secret.charCodeAt(i);
 if(diff)return new Response('Unauthorized',{status:401});
 webpush.setVapidDetails('https://waeaktwcryulosjchxvd.supabase.co',config.public_key,config.private_key);
 const {data:batch,error}=await db.rpc('claim_homework_reminders');
 if(error)return new Response('Unable to prepare reminders',{status:500});
 let sent=0, failed=0;
 for(const item of batch||[]){
  // Restrict network destinations to known push services, never arbitrary subscription URLs.
  const url=new URL(item.endpoint);
  const allowed=url.protocol==='https:'&&(!url.port||url.port==='443')&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h));
  if(!allowed){await db.rpc('complete_homework_reminder',{p_id:item.id,p_date:item.date,p_expired:true});continue;}
  try{
   await webpush.sendNotification({endpoint:item.endpoint,keys:item.keys},JSON.stringify({title:'Домашка · пора свериться',body:'Осталось сделать: '+item.pending+'. Нужно уточнить: '+item.missing+'.',tag:'homework-'+item.date}),{TTL:1800,timeout:10000});
   const r=await db.rpc('complete_homework_reminder',{p_id:item.id,p_date:item.date,p_expired:false});if(r.error)throw r.error;
   sent++;
  }catch(e){
   const status=(e as {statusCode?:number}).statusCode;
   if(status===404||status===410)await db.rpc('complete_homework_reminder',{p_id:item.id,p_date:item.date,p_expired:true});
   failed++;
  }
 }
 return Response.json({sent,failed});
});
