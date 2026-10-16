import CookieManager from '@preeternal/react-native-cookie-manager';
import EventSource from 'react-native-sse';
import type { ActiveThread, Attachment, GalleryFile, ServerRequest, StreamFrame, Thread, Workspace } from './types';
import { originOf, pathForThread } from './model';
export class ApiError extends Error { constructor(message:string,public status:number){super(message)} }
export class CodexApi {
  readonly origin:string;
  constructor(input:string){this.origin=originOf(input)}
  async cookie():Promise<string> {
    const native=await CookieManager.get(this.origin).catch(()=>({}));
    const c=native as Record<string,{value:string}>;
    return c.codex_webui_session?.value?`codex_webui_session=${c.codex_webui_session.value}`:'';
  }
  async request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    const cookie=await this.cookie();
    const headers:Record<string,string>={Accept:'application/json'};
    if(method!=='GET') {headers.Origin=this.origin;headers['Content-Type']='application/json'}
    if(cookie) headers.Cookie=cookie;
    let response:Response;
    try {response=await fetch(this.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'include'});} catch(e){throw new ApiError(`Cannot reach ${this.origin}: ${String(e)}`,0)}
    if(path==='/api/login' && response.ok){
      const setCookie=response.headers.get('set-cookie');
      if(setCookie) await CookieManager.setFromResponse(this.origin,setCookie).catch(()=>{});
    }
    let value:unknown; try{value=await response.json()}catch{value={error:`HTTP ${response.status}`}}
    if(!response.ok) throw new ApiError(String((value as {error?:string}).error||`HTTP ${response.status}`),response.status);
    return value as T;
  }
  login(password:string){return this.request<{ok:true}>('/api/login','POST',{password})}
  session(){return this.request<{authenticated:true;workspaceRoot:string}>('/api/session')}
  async logout(){try{await this.request('/api/logout','POST',{})}finally{await CookieManager.clearByName(this.origin,'codex_webui_session')}}
  status(){return this.request<{ok:boolean;codex:string;workspaceRoot:string}>('/api/status')}
  workspaces(){return this.request<{workspaces:Workspace[]}>('/api/workspaces')}
  activity(){return this.request<{activeThreads:ActiveThread[]}>('/api/activity')}
  threads(archived=false,cursor?:string){return this.request<{data:Thread[];nextCursor?:string|null}>(`/api/threads?archived=${archived}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`)}
  thread(id:string){return this.request<{thread:Thread}>(pathForThread(id))}
  createThread(cwd:string,permissionMode:string){return this.request<{thread:Thread}>('/api/threads','POST',{cwd,permissionMode})}
  send(id:string,data:{text:string;cwd:string;effort:string;systemPrompt:string;amtToolsEnabled:boolean;permissionMode:string;attachments:Attachment[]}){return this.request<{turn:{id:string}}>(`${pathForThread(id)}/messages`,'POST',data)}
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
    const cookie=await this.cookie();
    const source=new EventSource< 'message' >(this.origin+'/api/events',{headers:cookie?{Cookie:cookie}:undefined,withCredentials:true,pollingInterval:3000,timeout:30000});
    source.addEventListener('open',()=>onState('connected'));
    source.addEventListener('error',()=>onState('reconnecting'));
    source.addEventListener('message',e=>{try{if(e.data)onFrame(JSON.parse(e.data) as StreamFrame)}catch{}});
    return ()=>source.close();
  }
}
