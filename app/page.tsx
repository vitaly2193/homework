'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BookOpen, CalendarDays, CheckCheck, Plus, Bell, LogOut, ArrowRight, Clock3, Download, RefreshCw, Users, Pencil, Image as ImageIcon, X, ListChecks } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import baseSchedule from '@/lib/school-schedule.json';
import { validateDraftInput, type Tool } from '@/lib/webmcp';
import { canonical, moscowToday, nextSchoolDay, nextSubjectDate, prettyDate, missingSubjects, type Assignment, type Family, type LessonCheck } from '@/lib/homework';

type Draft = {id?:string;subject:string;body:string;due_date:string;status:'todo'|'doing'|'done';source_text:string;attachment_path:string|null};
const blank = (subject:string,date:string):Draft=>({subject,body:'',due_date:date,status:'todo',source_text:'',attachment_path:null});

export default function Home() {
 const [session,setSession]=useState<Session|null>(null), [ready,setReady]=useState(false);
 const activeUser=useRef<string|null>(null);
 const [family,setFamily]=useState<Family|null>(null), [assignments,setAssignments]=useState<Assignment[]>([]), [checks,setChecks]=useState<LessonCheck[]>([]);
 const [tab,setTab]=useState('homework'), [filter,setFilter]=useState('next'), [today,setToday]=useState(moscowToday());
 const [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false), [loading,setLoading]=useState(false);
 const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [register,setRegister]=useState(false), [joinCode,setJoinCode]=useState(''), [invite,setInvite]=useState('');
 const [draft,setDraft]=useState<Draft|null>(null), [file,setFile]=useState<File|null>(null), [attachment,setAttachment]=useState<string|null>(null);
 const [pushEnabled,setPushEnabled]=useState(false), [reminderTime,setReminderTime]=useState('19:00'), [online,setOnline]=useState(true);
 const schedule=family?.schedule||baseSchedule;
 const nextDay=nextSchoolDay(today,schedule);
 const subjects=[...new Set(schedule.days.flatMap(d=>d.lessons.flatMap(l=>l.subject?[canonical(l.subject)]:[])).concat(['Доп. английский']))].sort();
 const outstanding=assignments.filter(a=>a.status!=='done');
 const due=outstanding.filter(a=>a.due_date<=nextDay);
 const missing=missingSubjects(nextDay,schedule,assignments,checks);
 const visible=assignments.filter(a=>filter==='done'?a.status==='done':filter==='all'?a.status!=='done':a.due_date<=nextDay&&a.status!=='done');
 const fail=(e:unknown)=>setError(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Не удалось сохранить. Попробуйте ещё раз.');

 const refresh=useCallback(async()=>{
  const expectedUser=activeUser.current;if(!expectedUser)return;
  setLoading(true);
  try {
   const {data:f,error:fe}=await supabase.from('families').select('*').maybeSingle(); if(fe)throw fe;
   if(activeUser.current!==expectedUser)return;
   setFamily(f);
   if(f){
    const [a,c,r]=await Promise.all([supabase.from('assignments').select('*').eq('family_id',f.id).order('due_date').order('created_at'),supabase.from('lesson_checks').select('*').eq('family_id',f.id),supabase.from('reminder_settings').select('*').maybeSingle()]);
    if(a.error)throw a.error;if(c.error)throw c.error;if(r.error)throw r.error;
    if(activeUser.current!==expectedUser)return;
    setAssignments(a.data||[]);setChecks(c.data||[]);setReminderTime(r.data?.reminder_time?.slice(0,5)||'19:00');
    if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager?.getSubscription();setPushEnabled(Boolean(sub&&r.data?.enabled));}
   }
  }catch(e){fail(e);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  const {data}=supabase.auth.onAuthStateChange((_event,s)=>{const id=s?.user.id||null;if(activeUser.current!==id){setFamily(null);setAssignments([]);setChecks([]);setInvite('');setDraft(null);setAttachment(null);}activeUser.current=id;setSession(s);setReady(true);});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  const update=()=>{setToday(moscowToday());setOnline(navigator.onLine);};update();
  window.addEventListener('online',update);window.addEventListener('offline',update);const timer=setInterval(update,60000);
  return ()=>{data.subscription.unsubscribe();window.removeEventListener('online',update);window.removeEventListener('offline',update);clearInterval(timer);};
 },[]);
 useEffect(()=>{if(!session)return;void refresh();const listener=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(listener,30000);window.addEventListener('focus',listener);document.addEventListener('visibilitychange',listener);return()=>{clearInterval(timer);window.removeEventListener('focus',listener);document.removeEventListener('visibilitychange',listener);};},[session?.user.id,refresh]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(t);},[notice]);

 useEffect(()=>{
  const context=document.modelContext;if(!context?.registerTool||!session||!family)return;
  const lifecycle=new AbortController();
  const tools:Tool[]=[
   {name:'read_homework',description:'Read the signed-in family homework and missing-subject checks.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({assignments,nextSchoolDay:nextDay,missingSubjects:missing})},
   {name:'prepare_homework_entry',description:'Open a new assignment draft for the user to review and save. Does not save the assignment.',inputSchema:{type:'object',properties:{subject:{type:'string',enum:subjects},body:{type:'string',maxLength:5000},due_date:{type:'string',format:'date'}},required:['subject','body','due_date'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input)=>{const d=validateDraftInput(input,subjects);setFile(null);setDraft({...blank(d.subject,d.due_date),body:d.body});return {status:'draft_opened',requiresUserSave:true};}}
  ];
  tools.forEach(tool=>{try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}});
  return()=>lifecycle.abort();
 },[session?.user.id,family?.id,assignments,checks,nextDay]);

 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){fail(e);}finally{setBusy(false);}}
 async function auth(e:FormEvent){e.preventDefault();await run(async()=>{
  const result=register?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:location.origin}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(result.error)throw result.error;
  if(register&&!result.data.session)setNotice('Проверьте почту и подтвердите регистрацию. Затем войдите.');
  setPassword('');
 });}
 async function setup(join:boolean){await run(async()=>{const r=join?await supabase.rpc('join_family',{p_code:joinCode}):await supabase.rpc('create_family',{p_schedule:baseSchedule});if(r.error)throw r.error;await refresh();});}
 function startAdd(subject=subjects[0],date?:string){setFile(null);setDraft(blank(subject,date||nextSubjectDate(subject,today,schedule)));setError('');}
 async function saveAssignment(e:FormEvent){e.preventDefault();if(!draft||!family)return;await run(async()=>{
  let path=draft.attachment_path;
  let uploaded:string|null=null;
  if(file){if(file.size>10*1024*1024)throw new Error('Фото должно быть меньше 10 МБ.');const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[file.type];if(!ext)throw new Error('Поддерживаются JPEG, PNG и WebP.');path=`${family.id}/${crypto.randomUUID()}.${ext}`;const r=await supabase.storage.from('homework-attachments').upload(path,file,{contentType:file.type});if(r.error)throw r.error;uploaded=path;}
  const payload={family_id:family.id,subject:draft.subject,body:draft.body.trim(),due_date:draft.due_date,status:draft.status,source_text:draft.source_text,attachment_path:path};
  const r=draft.id?await supabase.from('assignments').update(payload).eq('id',draft.id).select('id').single():await supabase.from('assignments').insert(payload).select('id').single();
  if(r.error){if(uploaded)await supabase.storage.from('homework-attachments').remove([uploaded]);throw r.error;}
  setDraft(null);setFile(null);setNotice('Задание сохранено');await refresh();
 });}
 async function status(a:Assignment,s:Assignment['status']){await run(async()=>{const r=await supabase.from('assignments').update({status:s}).eq('id',a.id).select('id').single();if(r.error)throw r.error;await refresh();});}
 async function markEmpty(subject:string,undo=false){if(!family)return;await run(async()=>{const q={family_id:family.id,subject,due_date:nextDay};const r=undo?await supabase.from('lesson_checks').delete().match(q):await supabase.from('lesson_checks').upsert(q);if(r.error)throw r.error;await refresh();});}
 async function viewPhoto(path:string){await run(async()=>{const r=await supabase.storage.from('homework-attachments').createSignedUrl(path,300);if(r.error)throw r.error;setAttachment(r.data.signedUrl);});}
 async function notifications(){await run(async()=>{
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Откройте приложение в Chrome на Android: этот браузер не поддерживает push-уведомления.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Разрешите уведомления в настройках браузера для этого сайта.');
  const {data:key,error}=await supabase.rpc('push_public_key');if(error)throw error;if(!key)throw new Error('Сервис напоминаний ещё настраивается.');
  const reg=await navigator.serviceWorker.ready;
  const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));const bytes=new Uint8Array([...raw].map(c=>c.charCodeAt(0)));
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  const data=sub.toJSON();const r=await supabase.from('push_subscriptions').upsert({user_id:session!.user.id,endpoint:sub.endpoint,p256dh:data.keys!.p256dh,auth:data.keys!.auth},{onConflict:'endpoint'});if(r.error)throw r.error;
  const saved=await supabase.from('reminder_settings').upsert({user_id:session!.user.id,enabled:true,reminder_time:reminderTime});if(saved.error)throw saved.error;
  setPushEnabled(true);setNotice(`Напоминания включены: ${reminderTime}, Москва`);
 });}
 async function disablePush(){await run(async()=>{const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub){const r=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(r.error)throw r.error;await sub.unsubscribe();}setPushEnabled(false);setNotice('Напоминания на этом устройстве выключены');});}
 async function logout(){await run(async()=>{if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();if(sub){const r=await supabase.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(r.error)throw r.error;await sub.unsubscribe();}}const r=await supabase.auth.signOut();if(r.error)throw r.error;setPushEnabled(false);});}
 function exportData(){const blob=new Blob([JSON.stringify({schema_version:1,exported_at:new Date().toISOString(),schedule,assignments,lesson_checks:checks},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`homework-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

 return <main className="shell">
  <header className="topbar"><a className="brand" href="/"><BookOpen/>Домашка<span>2 «Г»</span></a><div className="header-actions"><span className="muted">Москва · 2 смена</span>{session&&<button className="icon-button" title="Выйти" aria-label="Выйти" onClick={logout} disabled={busy}><LogOut size={19}/></button>}</div></header>
  {!online&&<div className="message error">Нет интернета. Для сохранения и обновления заданий нужно подключение.</div>}
  {error&&<div role="alert" className="message error">{error}<button aria-label="Закрыть сообщение" onClick={()=>setError('')}><X size={18}/></button></div>}
  {notice&&<div role="status" className="message success">{notice}</div>}
  <section className="heading"><div><p className="eyebrow">СЕМЕЙНЫЙ ДНЕВНИК</p><h1>{session&&family?'Что у нас по урокам?':'Всё на своих местах.'}</h1><p>{family?`Ближайший учебный день — ${prettyDate(nextDay)}`:'Расписание, задания и отметки о готовности — вместе.'}</p></div>{family?<button className="primary" onClick={()=>startAdd()}><Plus size={20}/>Добавить задание</button>:<span className="stamp"><CheckCheck/>Шаг за шагом</span>}</section>
  {!ready?<div className="panel" role="status">Загружаем дневник…</div>:!session?<section className="signin-grid"><div className="panel signin"><p className="eyebrow">ДЛЯ ВАШЕЙ СЕМЬИ</p><h2>{register?'Создать аккаунт':'Войти в дневник'}</h2><p className="muted">У каждого свой вход, а задания и отметки — общие.</p><form onSubmit={auth}><label>Электронная почта<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Пароль<input type="password" autoComplete={register?'new-password':'current-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{register?'Зарегистрироваться':'Войти'}<ArrowRight size={18}/></button></form><button className="link-button" onClick={()=>setRegister(!register)}>{register?'Уже есть аккаунт? Войти':'Первый раз? Создать аккаунт'}</button></div><div className="welcome-note"><span className="big-check"><CheckCheck size={42}/></span><h2>Сделали — отметили.</h2><p>Задания к следующему уроку и на будущую неделю больше не потеряются.</p><div className="note-row"><CalendarDays/>Расписание 2 «Г» уже добавлено</div><div className="note-row"><Clock3/>Дополнительный английский: вт и чт</div><div className="note-row"><Bell/>Напоминания в 19:00 по Москве</div></div></section>:!family?<section className="panel setup"><h2><Users/>Ваш семейный дневник</h2>{loading?<p>Загружаем…</p>:<><p>Один родитель создаёт дневник. Остальные присоединяются по коду из его настроек.</p><button className="primary" onClick={()=>setup(false)} disabled={busy}>Создать дневник с нашим расписанием</button><div className="divider">или присоединиться</div><label>Код приглашения<input value={joinCode} onChange={e=>setJoinCode(e.target.value.trim())}/></label><button className="secondary" onClick={()=>setup(true)} disabled={busy||!joinCode}>Присоединиться</button></>}</section>:<Tabs value={tab} onValueChange={v=>setTab(String(v))}>
   <TabsList className="main-tabs"><TabsTrigger value="homework"><ListChecks/>Задания</TabsTrigger><TabsTrigger value="schedule"><CalendarDays/>Расписание</TabsTrigger><TabsTrigger value="settings"><Users/>Семья</TabsTrigger></TabsList>
   <TabsContent value="homework">
    <div className="summary-grid"><div className="summary primary-summary"><span>К ближайшему дню</span><b>{due.length}</b><p>осталось сделать</p></div><div className="summary"><span>Нужно уточнить</span><b>{missing.length}</b><p>предметов без записи</p></div><div className="summary"><span>Уже готово</span><b>{assignments.filter(a=>a.status==='done'&&a.due_date>=today).length}</b><p>заданий заранее</p></div></div>
    <div className="work-grid"><section className="panel task-panel"><div className="section-heading"><h2>Домашние задания</h2><button className="icon-button" disabled={loading} aria-label="Обновить задания" onClick={()=>refresh()}><RefreshCw size={18}/></button></div>
     <Tabs value={filter} onValueChange={v=>setFilter(String(v))}><TabsList className="filter-tabs"><TabsTrigger value="next">К {prettyDate(nextDay).split(',').pop()?.trim()}</TabsTrigger><TabsTrigger value="all">Все незавершённые</TabsTrigger><TabsTrigger value="done">Готово</TabsTrigger></TabsList></Tabs>
     {visible.length===0?<div className="empty"><CheckCheck size={38}/><h3>{filter==='done'?'Здесь будут ваши победы':missing.length&&filter==='next'?'Записанных заданий нет':'В этом списке всё готово'}</h3><p>{missing.length&&filter==='next'?'Проверьте чат и дневник: по некоторым предметам ещё нет информации.':'Добавляйте задания из чата учителя и отмечайте выполненное.'}</p><button className="secondary" onClick={()=>startAdd()}><Plus size={18}/>Добавить задание</button></div>:<div className="task-list">{visible.map(a=><article className={`task ${a.status==='done'?'is-done':''}`} key={a.id}><Checkbox className="task-check" checked={a.status==='done'} disabled={busy||!online} onCheckedChange={v=>status(a,v?'done':'todo')} aria-label={`Готово: ${a.subject}, ${a.body}`}/><div className="task-content"><div className="task-meta"><strong>{a.subject}</strong><span className={a.due_date<today&&a.status!=='done'?'overdue':''}>{a.due_date<today&&a.status!=='done'?'Просрочено · ':''}{prettyDate(a.due_date)}</span></div><p className="task-body">{a.body}</p><div className="task-tools"><button className={`text-button ${a.status==='doing'?'in-progress':''}`} disabled={busy} onClick={()=>status(a,a.status==='doing'?'todo':'doing')}>{a.status==='doing'?'В работе':a.status==='done'?'Вернуть в работу':'Начать'}</button>{a.attachment_path&&<button className="text-button" onClick={()=>viewPhoto(a.attachment_path!)}><ImageIcon size={15}/>Фото</button>}<button className="text-button" onClick={()=>{setFile(null);setDraft({...a});}}><Pencil size={14}/>Изменить</button></div>{a.source_text&&<details><summary>Сообщение учителя</summary><p className="source-text">{a.source_text}</p></details>}</div></article>)}</div>}
    </section><aside><section className="panel check-panel"><p className="eyebrow">НЕ ПРОПУСТИТЬ</p><h2>Свериться с дневником</h2><p className="muted">На {prettyDate(nextDay)}. Пустая запись не означает, что ничего не задали.</p>{missing.map(subject=><div className="check-row" key={subject}><strong>{subject}</strong><div><button className="text-button" onClick={()=>startAdd(subject,nextDay)}>Записать</button><button className="text-button" disabled={busy} onClick={()=>markEmpty(subject)}>Не задано</button></div></div>)}{!missing.length&&<p className="all-checked"><CheckCheck/>Все предметы проверены</p>}{checks.filter(c=>c.due_date===nextDay&&!assignments.some(a=>a.subject===c.subject&&a.due_date===nextDay)).map(c=><div className="checked-row" key={c.subject}><span>{c.subject} · не задано</span><button aria-label={`Отменить: ${c.subject}, не задано`} onClick={()=>markEmpty(c.subject,true)}><X size={15}/></button></div>)}</section><div className="reminder-note"><Bell size={20}/><div><strong>{pushEnabled?`Напомним в ${reminderTime}`:'Включите напоминания'}</strong><p>{pushEnabled?'Только если осталось сделать или уточнить.':'Настройте их на телефоне во вкладке «Семья».'}</p></div></div></aside></div>
   </TabsContent>
   <TabsContent value="schedule"><section className="panel"><h2><CalendarDays/>На этой неделе</h2><div className="week-grid">{schedule.days.map(day=><article className="day" key={day.weekday}><h3>{day.label}</h3>{schedule.extra_classes.filter(c=>c.weekday===day.weekday).map(c=><div className="extra" key={c.start}><b>{c.start}–{c.end}</b><p>Английский · дополнительно</p></div>)}{day.lessons.filter(l=>l.subject).map(l=><div className="lesson" key={l.lesson_number}><span>{schedule.time_slots.find(t=>t.lesson_number===l.lesson_number)?.start}–{schedule.time_slots.find(t=>t.lesson_number===l.lesson_number)?.end}</span><strong>{l.subject}</strong></div>)}</article>)}</div></section></TabsContent>
   <TabsContent value="settings"><div className="settings-grid"><section className="panel"><h2><Bell/>Напоминания</h2><p>О незавершённых заданиях и предметах, по которым ещё нужно уточнить домашнюю работу.</p><label>Время по Москве<input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)}/></label><button className="primary" disabled={busy} onClick={notifications}>{pushEnabled?'Сохранить время':'Включить на этом устройстве'}</button>{pushEnabled&&<button className="link-button" onClick={disablePush} disabled={busy}>Выключить на этом устройстве</button>}<p className="small muted">Разрешение нужно дать на каждом телефоне. Время общее для ваших устройств. В Chrome: меню → «Добавить на главный экран».</p></section><section className="panel"><h2><Users/>Вся семья вместе</h2><p className="muted">Вы вошли как {session.user.email}</p>{family.owner_id===session.user.id?<><p>Создайте код и передайте его члену семьи. Код действует 7 дней; новый код заменяет предыдущий.</p><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const r=await supabase.rpc('create_family_invite');if(r.error)throw r.error;setInvite(r.data);})}>Создать код приглашения</button>{invite&&<label>Код для присоединения<input readOnly value={invite} onFocus={e=>e.target.select()}/></label>}</>:<p>Вы присоединились к семейному дневнику.</p>}<div className="divider"/><h3>Резервная копия</h3><p>Расписание, задания и отметки в переносимом JSON. Фотографии скачиваются отдельно из заданий.</p><button className="secondary" onClick={exportData}><Download size={17}/>Скачать JSON</button></section></div></TabsContent>
  </Tabs>}
  <footer>Домашка · 2 «Г» · Московское время {family&&<span>Обновляется каждые 30 секунд</span>}</footer>
  <Dialog open={Boolean(draft)} onOpenChange={open=>{if(!open&&!busy)setDraft(null);}}><DialogContent className="homework-dialog" showCloseButton={!busy}><DialogTitle>{draft?.id?'Изменить задание':'Новое задание'}</DialogTitle><DialogDescription>Текст из MAX можно вставить в задание или сохранить как исходное сообщение.</DialogDescription>{draft&&<form onSubmit={saveAssignment}><div className="form-grid"><label>Предмет<Select value={draft.subject} onValueChange={v=>{if(v)setDraft({...draft,subject:v,due_date:draft.id?draft.due_date:nextSubjectDate(v,today,schedule)});}}><SelectTrigger className="subject-select"><SelectValue/></SelectTrigger><SelectContent>{subjects.map(s=><SelectItem value={s} key={s}>{s}</SelectItem>)}</SelectContent></Select></label><label>К какому дню<input type="date" required value={draft.due_date} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label></div><label>Что сделать<textarea rows={3} maxLength={5000} required placeholder="Например: стр. 25, задания 3 и 4" value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label><label>Сообщение учителя · необязательно<textarea rows={2} maxLength={12000} value={draft.source_text} onChange={e=>setDraft({...draft,source_text:e.target.value})}/></label><label>Фото задания · до 10 МБ<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{draft.attachment_path&&!file&&<p className="small muted">Фото уже прикреплено. Новое фото заменит его в задании.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy||!online}>{busy?'Сохраняем…':'Сохранить задание'}</button></form>}</DialogContent></Dialog>
  <Dialog open={Boolean(attachment)} onOpenChange={open=>{if(!open)setAttachment(null);}}><DialogContent className="photo-dialog"><DialogTitle>Фото задания</DialogTitle><DialogDescription>Исходное фото из семейного дневника.</DialogDescription>{attachment&&<img src={attachment} alt="Прикреплённое фото задания"/>}</DialogContent></Dialog>
 </main>;
}
