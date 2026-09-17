import pg from 'pg';
import webpush from 'web-push';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(readFileSync(new URL(process.env.HOMEWORK_ENV_FILE || '../../.env', import.meta.url), 'utf8'));
const client = new pg.Client({host:'aws-0-ap-southeast-2.pooler.supabase.com',port:5432,user:'postgres.waeaktwcryulosjchxvd',database:'postgres',password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('./supabase-ca.crt', import.meta.url),'utf8')},connectionTimeoutMillis:15000});
try {
 await client.connect();
 if (process.argv[2]==='inspect') {
  const r=await client.query("select tablename from pg_tables where schemaname='public' order by tablename");
  console.log('Connected. Public tables:', r.rows.map(r=>r.tablename));
 } else if (process.argv[2]==='test-reminder') {
  const {rows}=await client.query('select job_secret from homework_private.push_config where singleton');
  const key=readFileSync(new URL('./scheduler-public-key.txt',import.meta.url),'utf8').trim();
  const res=await fetch('https://waeaktwcryulosjchxvd.supabase.co/functions/v1/send-reminders',{method:'POST',headers:{Authorization:'Bearer '+key,'x-job-secret':rows[0].job_secret,'Content-Type':'application/json'},body:'{}'});
  console.log('Reminder endpoint:',res.status,await res.text());
  if(!res.ok)process.exitCode=1;
 } else if (process.argv[2]==='configure-push') {
  const keys=webpush.generateVAPIDKeys();
  await client.query('insert into homework_private.push_config(singleton,public_key,private_key,job_secret) values(true,$1,$2,$3) on conflict(singleton) do nothing',[keys.publicKey,keys.privateKey,randomBytes(32).toString('hex')]);
  console.log('Notification signing credentials configured privately.');
 } else if (process.argv[2]==='file') {
  const result=await client.query(readFileSync(process.argv[3],'utf8'));
  console.log('SQL completed successfully.');
 } else { throw new Error('Use inspect or file <path>'); }
} catch(e) { console.error(e.code || 'DATABASE_ERROR', e.message.replaceAll(env.SUPABASE_DB_PASSWORD,'[redacted]')); process.exitCode=1; }
finally {await client.end();}
