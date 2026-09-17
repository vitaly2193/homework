import baseSchedule from './school-schedule.json' with { type: 'json' };
export type Schedule = typeof baseSchedule;
export type Assignment = {id:string;family_id:string;subject:string;body:string;due_date:string;status:'todo'|'doing'|'done';source_text:string;attachment_path:string|null;updated_at:string};
export type LessonCheck = {family_id:string;subject:string;due_date:string};
export type Family = {id:string;owner_id:string;name:string;schedule:Schedule;timezone:string};
export function canonical(s:string):string {
 if(s.startsWith('Лит.чтение')) return 'Литературное чтение';
 return ({'Русский':'Русский язык','Англ.яз.':'Английский язык','Окружающий':'Окружающий мир','ФЗК':'Физкультура'} as Record<string,string>)[s]||s;
}
export function moscowToday(now=new Date()):string {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(date:string,days:number):string {const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function weekday(date:string):number {return new Date(date+'T12:00:00Z').getUTCDay()||7;}
export function nextSchoolDay(date:string,schedule:Schedule):string {for(let n=1;n<=7;n++){const d=addDays(date,n);if(schedule.days.some(x=>x.iso_weekday===weekday(d)))return d;}return addDays(date,1);}
export function nextSubjectDate(subject:string,date:string,schedule:Schedule):string {
 for(let n=1;n<=7;n++){const d=addDays(date,n);const day=schedule.days.find(x=>x.iso_weekday===weekday(d));if(day?.lessons.some(l=>l.subject&&canonical(l.subject)===subject)||(subject==='Доп. английский'&&schedule.extra_classes.some(c=>c.iso_weekday===weekday(d))))return d;}return nextSchoolDay(date,schedule);
}
export function subjectsFor(date:string,schedule:Schedule):string[] {return [...new Set((schedule.days.find(d=>d.iso_weekday===weekday(date))?.lessons||[]).flatMap(l=>l.subject?[canonical(l.subject)]:[]))];}
export function missingSubjects(date:string,schedule:Schedule,assignments:Assignment[],checks:LessonCheck[]):string[]{return subjectsFor(date,schedule).filter(s=>!assignments.some(a=>a.subject===s&&a.due_date===date)&&!checks.some(c=>c.subject===s&&c.due_date===date));}
export function prettyDate(date:string):string {return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',weekday:'short',timeZone:'Europe/Moscow'}).format(new Date(date+'T12:00:00Z'));}
