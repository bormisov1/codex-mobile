import type { ActiveThread, Attachment, GalleryFile, ServerRequest, StreamFrame, Thread, Workspace } from './types';
import { originOf, pathForThread } from './model';
import type { BasicCredentials } from './auth';
export class ApiError extends Error { constructor(message:string,public status:number){super(message)} }
export class CodexApi {
  readonly origin:string;
  constructor(input:string,_credentials?:BasicCredentials){originOf(input);this.origin=window.location.origin}
  mediaHeaders(_cookie=''):Record<string,string> { return {}; }
  async cookie():Promise<string> { return ''; }
  async request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    const headers:Record<string,string>={Accept:'application/json'};
    if(method!=='GET') headers['Content-Type']='application/json';
    let response:Response;
    try {response=await fetch(this.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'include'});} catch(e){throw new ApiError(`Cannot reach ${this.origin}: ${String(e)}`,0)}
    let value:unknown; try{value=await response.json()}catch{value={error:`HTTP ${response.status}`}}
    if(!response.ok) throw new ApiError(String((value as {error?:string}).error||`HTTP ${response.status}`),response.status);
    return value as T;
  }
  login(password:string){return this.request<{ok:true}>('/api/login','POST',{password})}
  session(){return this.request<{authenticated:true;workspaceRoot:string}>('/api/session')}
  async logout(){await this.request('/api/logout','POST',{})}
  status(){return this.request<{ok:boolean;codex:string;workspaceRoot:string}>('/api/status')}
  workspaces(){return this.request<{workspaces:Workspace[]}>('/api/workspaces')}
  activity(){return this.request<{activeThreads:ActiveThread[]}>('/api/activity')}
  threads(archived=false,cursor?:string){return this.request<{data:Thread[];nextCursor?:string|null}>(`/api/threads?archived=${archived}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`)}
  thread(id:string){return this.request<{thread:Thread}>(pathForThread(id))}
  createThread(cwd:string,permissionMode:string){return this.request<{thread:Thread}>('/api/threads','POST',{cwd,permissionMode})}
  send(id:string,data:{text:string;cwd:string;effort:string;systemPrompt:string;amtToolsEnabled:boolean;permissionMode:string;attachments:Attachment[]}){return this.request<{turn:{id:string}}>(`${pathForThread(id)}/messages`,'POST',data)}
  scheduleAutoResume(id:string,data:{retryAt:number;message:{text:string;cwd:string;effort:string;systemPrompt:string;amtToolsEnabled:boolean;permissionMode:string;attachments:Attachment[]}}){return this.request<{ok:true;scheduled:true;retryAt:number}>(`${pathForThread(id)}/auto-resume`,'PUT',data)}
  cancelAutoResume(id:string){return this.request<{ok:true;cancelled:boolean}>(`${pathForThread(id)}/auto-resume`,'DELETE',{})}
  command(id:string,action:string,body:unknown={}){return this.request<{thread?:Thread}>(`${pathForThread(id)}/commands/${action}`,'POST',body)}
  archive(ids:string[]){return this.request<{archived:string[];failed:{id:string;message:string}[]}>('/api/threads/archive','POST',{threadIds:ids})}
  interrupt(threadId:string,turnId:string){return this.request(`${pathForThread(threadId)}/turns/${encodeURIComponent(turnId)}/interrupt`,'POST',{})}
  decide(id:string|number,decision:'accept'|'acceptForSession'|'decline'|'cancel'){return this.request(`/api/requests/${encodeURIComponent(id)}`,'POST',{decision})}
  rateLimits(){return this.request<Record<string,unknown>>('/api/account/rate-limits')}
  gallery(cwd:string){return this.request<{files:GalleryFile[]}>(`/api/gallery?cwd=${encodeURIComponent(cwd)}`)}
  imageUrl(path:string){return `${this.origin}/api/image?path=${encodeURIComponent(path)}`}
  fileUrl(path:string){return `${this.origin}/api/file?path=${encodeURIComponent(path)}`}
  upload(name:string,dataBase64:string,mimeType:string){return this.request<{file:Attachment}>('/api/upload','POST',{name,dataBase64,mimeType})}
  amtStatus(){return this.request<Record<string,unknown>>('/api/amt/status')}
  amtConnect(key:string){return this.request('/api/amt/connect','POST',{key})}
  amtDisconnect(){return this.request('/api/amt/connect','DELETE',{})}
  async events(onFrame:(frame:StreamFrame)=>void,onState:(state:'connected'|'reconnecting'|'failed')=>void):Promise<()=>void>{
    const source=new EventSource(this.origin+'/api/events', { withCredentials:true });
    source.addEventListener('open',()=>onState('connected'));
    source.addEventListener('error',()=>onState('reconnecting'));
    source.addEventListener('message',e=>{try{if(e.data)onFrame(JSON.parse(e.data) as StreamFrame)}catch{}});
    return ()=>source.close();
  }
}
