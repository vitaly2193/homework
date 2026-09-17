export type Tool = {name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown|Promise<unknown>};
declare global {interface Document {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}}
export function validateDraftInput(input:unknown,subjects:string[]){
 if(!input||typeof input!=='object')throw new Error('Expected subject, body and due_date');
 const data=input as Record<string,unknown>;
 if(typeof data.subject!=='string'||!subjects.includes(data.subject))throw new Error('Choose a subject from the timetable');
 if(typeof data.body!=='string'||!data.body.trim()||data.body.length>5000)throw new Error('Invalid assignment text');
 if(typeof data.due_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.due_date)||Number.isNaN(Date.parse(data.due_date+'T12:00:00Z'))||new Date(data.due_date+'T12:00:00Z').toISOString().slice(0,10)!==data.due_date)throw new Error('Invalid due date');
 return {subject:data.subject,body:data.body,due_date:data.due_date};
}
