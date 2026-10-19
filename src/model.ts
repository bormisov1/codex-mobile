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
  const items=(turn.items||[]).filter(i=>!['userMessage','agentMessage'].includes(i.type) || i.phase==='commentary');
  return items.map((item,index)=>({
    id:item.id||String(index), title:activityTitle(item), detail:activityDetail(item), kind:item.type,
    status:activityStatus(item.status,index===items.length-1?turn.status:undefined), at:Number(item.completedAt||item.startedAt||turn.completedAt||turn.startedAt||0)
  }));
}
function rawStatus(value:unknown):string|undefined {
 const status=typeof value==='string'?value:record(value)?.type;
 return typeof status==='string'&&status.trim()?status.trim():undefined;
}
export function activityStatus(itemStatus:unknown,turnStatus?:unknown):string {
 const item=rawStatus(itemStatus)?.replace(/[\s_-]/g,'').toLowerCase();
 const turn=rawStatus(turnStatus)?.replace(/[\s_-]/g,'').toLowerCase();
 const terminalTurn=turn&&!['active','inprogress','running','started','pending'].includes(turn)?turn:undefined;
 if(terminalTurn&&(!item||['active','inprogress','running','started','pending'].includes(item))) {
  if(['completed','complete','succeeded','success','done'].includes(terminalTurn)) return 'done';
  if(['failed','error'].includes(terminalTurn)) return 'failed';
  return ['cancelled','canceled','aborted','interrupted'].includes(terminalTurn)?'interrupted':terminalTurn;
 }
 if(!item) return turn&&['active','inprogress','running','started'].includes(turn)?'running':'done';
 if(['completed','complete','succeeded','success','done'].includes(item)) return 'done';
 if(['active','inprogress','running','started'].includes(item)) return 'running';
 if(['failed','error'].includes(item)) return 'failed';
 if(['cancelled','canceled','aborted','interrupted'].includes(item)) return 'interrupted';
 return rawStatus(itemStatus)||'done';
}
export function reconcileActivity(live:ActivityEntry[],turn?:Turn):ActivityEntry[] {
 if(!turn) return live;
 const durable=activityOf(turn),liveById=new Map(live.map(entry=>[entry.id,entry]));
 const durableIds=new Set(durable.map(entry=>entry.id));
 const terminalStatus=activityStatus(undefined,turn.status);
 const remaining=live.filter(entry=>!durableIds.has(entry.id)).map(entry=>entry.status==='running'&&terminalStatus!=='running'?{...entry,status:terminalStatus}:entry);
 return [...remaining,...durable.map(entry=>{const transient=liveById.get(entry.id);return transient?{...transient,...entry,detail:entry.detail||transient.detail,at:entry.at||transient.at}:entry})].slice(0,100);
}
export function activityEvent(entries:ActivityEntry[],event:CodexEvent,at=Date.now()):ActivityEntry[] {
 const p=event.params||{};
 if(event.method==='turn/completed') {
  const status=activityStatus(undefined,(p.turn as Record<string,unknown>|undefined)?.status??p.status??'completed');
  return entries.map(entry=>entry.status==='running'?{...entry,status}:entry);
 }
 const item=p.item as ThreadItem|undefined;
 if((event.method==='item/started'||event.method==='item/completed')&&item) {
  const id=String(item.id||`${event.method}:${at}`),previous=entries.find(entry=>entry.id===id);
  const next:ActivityEntry={id,kind:item.type||previous?.kind||'activity',title:activityTitle(item),detail:activityDetail(item)||previous?.detail||'',status:event.method==='item/started'?'running':activityStatus(item.status,'completed'),at:previous?.at||at};
  return [next,...entries.filter(entry=>entry.id!==id)].slice(0,100);
 }
 if(!['item/commandExecution/outputDelta','item/reasoning/summaryTextDelta','item/plan/delta','item/fileChange/patchUpdated','turn/diff/updated'].includes(event.method)) return entries;
 const id=String(p.itemId||event.method),previous=entries.find(entry=>entry.id===id);
 const fragment=String(p.delta||p.patch||JSON.stringify(p)).slice(-12000);
 const append=event.method.endsWith('/outputDelta')||event.method.endsWith('/summaryTextDelta')||event.method.endsWith('/delta');
 const detail=(append&&previous?.detail?previous.detail+fragment:fragment).slice(-12000);
 const next:ActivityEntry={id,kind:previous?.kind||event.method,title:previous?.title||event.method.split('/').slice(0,2).join(' · '),detail,status:'running',at:previous?.at||at};
 return [next,...entries.filter(entry=>entry.id!==id)].slice(0,100);
}
export function activityTitle(item:ThreadItem):string {
  const names:Record<string,string>={reasoning:'Thinking',plan:'Plan',commandExecution:'Command',fileChange:'File changes',mcpToolCall:'MCP tool',dynamicToolCall:'Tool',collabAgentToolCall:'Subagent',webSearch:'Web search'};
  return names[item.type]||item.type.replace(/([a-z])([A-Z])/g,'$1 $2');
}
export function activityDetail(item:ThreadItem):string {
  for(const key of ['command','query','name','title','summary','text','output','patch']) {
    const detail=extractText(item[key]);
    if(detail) return detail.slice(-12000);
  }
  const changes=Array.isArray(item.changes)?item.changes:[];
  if(changes.length) return changes.map(change=>{
    if(!change||typeof change!=='object') return '';
    const data=change as Record<string,unknown>;
    const path=String(data.path||data.filePath||data.file||'file');
    const action=String(data.type||data.kind||'updated');
    return `${action}: ${path}`;
  }).filter(Boolean).join('\n').slice(-12000);
  return '';
}
export function isWorking(thread:Thread|undefined,activeIds:Set<string>):boolean { return !!thread && (activeIds.has(thread.id) || thread.status?.type==='active' || thread.turns?.at(-1)?.status==='inProgress') }
export function eventThreadId(event:CodexEvent):string|undefined {
 const p=event.params||{}; return (p.threadId || (p.thread as {id?:string}|undefined)?.id || (p.turn as {threadId?:string}|undefined)?.threadId) as string|undefined;
}
export function isDecisionRequest(method:string):boolean { return /requestApproval|applyPatchApproval|execCommandApproval/.test(method) }
export function permissionLabel(mode:PermissionMode):string {return mode==='yolo'?'YOLO':mode[0].toUpperCase()+mode.slice(1)}
type UsageWindow={key:'primary'|'secondary';label:string;usedPercent:number;remainingPercent:number;resetsAt?:number};
export type UsageDetails={plan?:string;windows:UsageWindow[]};
function record(value:unknown):Record<string,unknown>|undefined {return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined}
function finiteNumber(value:unknown):number|undefined {
 const number=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
 return Number.isFinite(number)?number:undefined;
}
function timestamp(value:unknown):number|undefined {
 const number=finiteNumber(value);
 const date=number!==undefined?(number<1e11?number*1000:number):typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(date)?date:undefined;
}
function usageWindowLabel(minutes:number|undefined,key:'primary'|'secondary'):string {
 if(minutes===10080) return 'Weekly limit';
 if(minutes===1440) return 'Daily limit';
 if(minutes&&minutes%1440===0) return `${minutes/1440}-day limit`;
 if(minutes&&minutes%60===0) return `${minutes/60}-hour limit`;
 if(minutes) return `${minutes}-minute limit`;
 return key==='primary'?'Primary limit':'Secondary limit';
}
export function usageDetails(value:unknown):UsageDetails {
 const data=record(value)||{};
 const limits=record(data.rateLimits)||record(data.rate_limits)||data;
 const windows=(['primary','secondary'] as const).flatMap(key=>{
  const item=record(limits[key]);
  const used=finiteNumber(item?.usedPercent??item?.used_percent);
  if(used===undefined) return [];
  const usedPercent=Math.max(0,Math.min(100,used));
  const minutes=finiteNumber(item?.windowDurationMins??item?.window_duration_mins);
  return [{key,label:usageWindowLabel(minutes,key),usedPercent,remainingPercent:100-usedPercent,resetsAt:timestamp(item?.resetsAt??item?.resets_at)}];
 });
 const rawPlan=limits.planType??limits.plan_type??data.planType??data.plan_type;
 const plan=typeof rawPlan==='string'&&rawPlan.trim()?rawPlan.trim().replace(/(^|[-_\s])\w/g,part=>part.toUpperCase().replace(/[-_]/,' ')):undefined;
 return {plan,windows};
}
export function chatTokenCount(...values:unknown[]):number|undefined {
 for(const value of values) {
  const data=record(value);
  if(!data) continue;
  for(const key of ['totalTokens','total_tokens']) {
   const count=finiteNumber(data[key]);
   if(count!==undefined&&count>=0) return count;
  }
  for(const key of ['totalTokenUsage','total_token_usage','total','tokenUsage','token_usage','usage']) {
   const count=chatTokenCount(data[key]);
   if(count!==undefined) return count;
  }
  const input=finiteNumber(data.inputTokens??data.input_tokens);
  const output=finiteNumber(data.outputTokens??data.output_tokens);
  if(input!==undefined||output!==undefined) return Math.max(0,(input||0)+(output||0));
 }
 return undefined;
}
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
