import type { Thread, ThreadItem, Turn, ActivityEntry, CodexEvent, PermissionMode, PlanStep } from './types';
export function originOf(input:string):string {
  const url = new URL(input.trim());
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Enter a server origin such as https://codex.example.com (no path).');
  return url.origin;
}
export function pathForThread(id:string):string { return `/api/threads/${encodeURIComponent(id)}` }
export function threadTitle(t:Thread):string { return (t.name || t.preview || 'New thread').trim().slice(0,100) || 'New thread' }
export function extractText(value:unknown):string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  const o=value as Record<string,unknown>;
  if (typeof o.text==='string') return o.text;
  if (typeof o.value==='string') return o.value;
  if (typeof o.content==='string') return o.content;
  if (o.content) return extractText(o.content);
  return '';
}
export function messagesOf(thread?:Thread|null):{key:string;role:'user'|'assistant'|'commentary';text:string;item:ThreadItem}[] {
  const output:ReturnType<typeof messagesOf>=[];
  for(const turn of thread?.turns||[]) for(const item of turn.items||[]) {
    if(item.type==='userMessage' || item.type==='agentMessage') {
      const text=extractText(item.type==='userMessage'?item.content:(item.text??item.content)) || (item.type==='userMessage'&&itemImagePaths(item).length?`Attached ${itemImagePaths(item).map(p=>p.split('/').at(-1)).join(', ')}`:'');
      if(text) output.push({key:`${turn.id}:${item.id||output.length}`,role:item.type==='userMessage'?'user':item.phase==='commentary'?'commentary':'assistant',text,item});
    }
  }
  return output;
}
export function itemImagePaths(item:ThreadItem):string[] {
 const content=Array.isArray(item.content)?item.content:[];
 return content.filter(x=>x&&typeof x==='object'&&'type' in x&&(x as {type:unknown}).type==='localImage'&&'path' in x).map(x=>String((x as {path:unknown}).path));
}
export function activityOf(turn?:Turn):ActivityEntry[] {
  if(!turn) return [];
  return (turn.items||[]).filter(i=>!['userMessage','agentMessage'].includes(i.type) || i.phase==='commentary').map((item,index)=>({
    id:item.id||String(index), title:activityTitle(item), detail:activityDetail(item), kind:item.type,
    status:String(item.status||'done'), at:Number(item.startedAt||item.completedAt||Date.now())
  }));
}
export function activityTitle(item:ThreadItem):string {
  const names:Record<string,string>={reasoning:'Thinking',plan:'Plan',commandExecution:'Command',fileChange:'File changes',mcpToolCall:'MCP tool',dynamicToolCall:'Tool',collabAgentToolCall:'Subagent',webSearch:'Web search'};
  return names[item.type]||item.type.replace(/([a-z])([A-Z])/g,'$1 $2');
}
export function activityDetail(item:ThreadItem):string {
  for(const key of ['command','query','name','title','summary','text','output','patch']) if(typeof item[key]==='string') return String(item[key]).slice(-12000);
  return JSON.stringify(item,null,2).slice(-12000);
}
export function isWorking(thread:Thread|undefined,activeIds:Set<string>):boolean { return !!thread && (activeIds.has(thread.id) || thread.status?.type==='active' || thread.turns?.at(-1)?.status==='inProgress') }
export function eventThreadId(event:CodexEvent):string|undefined {
 const p=event.params||{}; return (p.threadId || (p.thread as {id?:string}|undefined)?.id || (p.turn as {threadId?:string}|undefined)?.threadId) as string|undefined;
}
export function isDecisionRequest(method:string):boolean { return /requestApproval|applyPatchApproval|execCommandApproval/.test(method) }
export function permissionLabel(mode:PermissionMode):string {return mode==='yolo'?'YOLO':mode[0].toUpperCase()+mode.slice(1)}
export function rateReset(value:unknown):number|undefined {
 const o=value as {rateLimits?:{primary?:{resetsAt?:number|string};secondary?:{resetsAt?:number|string}}};
 const vals=[o?.rateLimits?.primary?.resetsAt,o?.rateLimits?.secondary?.resetsAt].map(x=>typeof x==='string'?Date.parse(x):typeof x==='number'?(x<1e11?x*1000:x):NaN).filter(x=>Number.isFinite(x)&&x>Date.now());
 return vals.length?Math.min(...vals):undefined;
}
export function isRateLimitError(value:unknown):boolean { return /rate.?limit|usage.?limit|quota|too many requests|429/i.test(typeof value==='string'?value:JSON.stringify(value||'')) }
export function planOf(thread?:Thread|null):PlanStep[] {
 const items=thread?.turns?.at(-1)?.items||[];
 const item=[...items].reverse().find(i=>i.type==='plan');
 const steps=(item?.plan||item?.steps) as unknown;
 return Array.isArray(steps)?steps.filter(x=>x&&typeof x.step==='string').map(x=>({step:x.step,status:String(x.status||'pending')})):[];
}
export function isLocalResource(url:string):boolean { return url.startsWith('/')||url.startsWith('file://') }
