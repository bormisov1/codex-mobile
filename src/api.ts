import CookieManager from '@preeternal/react-native-cookie-manager';
import EventSource from 'react-native-sse';
import type { ActiveThread, Attachment, GalleryFile, ServerRequest, StreamFrame, Thread, Workspace } from './types';
import { originOf, pathForThread } from './model';
import { basicAuthorization } from './auth';
import type { BasicCredentials } from './auth';
export class ApiError extends Error { constructor(message:string,public status:number){super(message)} }
export class CodexApi {
  readonly origin:string;
  private readonly authorization?:string;
  private sessionCookie='';
  private loginCookieHeaderSeen=false;
  private loginCookieStored=false;
  private loginSucceeded=false;
  constructor(input:string, credentials?:BasicCredentials){this.origin=originOf(input);this.authorization=basicAuthorization(this.origin,credentials)}
  mediaHeaders(cookie=''):Record<string,string> {
    const headers:Record<string,string>={};
    if(this.authorization)headers.Authorization=this.authorization;
    if(cookie)headers.Cookie=cookie;
    return headers;
  }
  async cookie():Promise<string> {
    if(this.sessionCookie)return this.sessionCookie;
    const native=await CookieManager.get(this.origin).catch(()=>({}));
    const c=native as Record<string,{value:string}>;
    return c.codex_webui_session?.value?`codex_webui_session=${c.codex_webui_session.value}`:'';
  }
  async request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    const login=path==='/api/login';
    const cookie=login?'':await this.cookie();
    const headers:Record<string,string>={Accept:'application/json',...this.mediaHeaders(cookie)};
    if(method!=='GET') {headers.Origin=this.origin;headers['Content-Type']='application/json'}
    let response:Response;
    // The native fetch layer appends cookies from its store when credentials are included.
    // Send one explicit Cookie header on authenticated requests to avoid duplicates on iOS.
    try {response=await fetch(this.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:login?'include':'omit'});} catch(e){throw new ApiError(`Cannot reach ${this.origin}: ${String(e)}`,0)}
    if(login && response.ok){
      this.loginSucceeded=true;
      const setCookie=response.headers.get('set-cookie');
      this.loginCookieHeaderSeen=!!setCookie;
      const token=setCookie?.match(/(?:^|;\s*)codex_webui_session=([^;,\s]+)/)?.[1];
      if(token)this.sessionCookie=`codex_webui_session=${token}`;
      if(setCookie)await CookieManager.setFromResponse(this.origin,setCookie).catch(()=>console.warn('[auth] Cookie store write failed'));
      const stored=await CookieManager.get(this.origin).catch(()=>({}));
      this.loginCookieStored=!!(stored as Record<string,{value:string}>).codex_webui_session?.value;
      const available=!!(await this.cookie());
      console.info('[auth] Login response', {status:response.status,setCookieHeader:!!setCookie,nativeCookieStored:this.loginCookieStored,sessionCookieAvailable:available});
      if(!available)throw new ApiError(`Login accepted, but no session cookie was available (Set-Cookie: ${setCookie?'present':'absent'}; native store: empty).`,401);
    }
    let value:unknown; try{value=await response.json()}catch{value={error:response.status===401&&response.headers.get('www-authenticate')?.toLowerCase().startsWith('basic')?'Proxy username or password rejected':`HTTP ${response.status}`}}
    if((login||path==='/api/session')&&!response.ok)console.warn('[auth] Request rejected',{path,status:response.status,cookieSent:!!cookie,proxyChallenge:!!response.headers.get('www-authenticate')});
    if(!response.ok) throw new ApiError(String((value as {error?:string}).error||`HTTP ${response.status}`),response.status);
    return value as T;
  }
  login(password:string){return this.request<{ok:true}>('/api/login','POST',{password})}
  async session(){
    try{return await this.request<{authenticated:true;workspaceRoot:string}>('/api/session')}
    catch(e){
      if(this.loginSucceeded&&e instanceof ApiError&&e.status===401&&e.message!=='Proxy username or password rejected'){
        const message=`Login accepted, but the session was rejected (HTTP 401; cookie prepared: ${await this.cookie()?'yes':'no'}; Set-Cookie: ${this.loginCookieHeaderSeen?'present':'absent'}; native store: ${this.loginCookieStored?'present':'empty'}).`;
        console.warn('[auth] Session verification failed',{cookiePrepared:!!(await this.cookie()),setCookieHeader:this.loginCookieHeaderSeen,nativeCookieStored:this.loginCookieStored});
        throw new ApiError(message,401);
      }
      throw e;
    }
  }
  async logout(){try{await this.request('/api/logout','POST',{})}finally{this.sessionCookie='';await CookieManager.clearByName(this.origin,'codex_webui_session')}}
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
    const source=new EventSource< 'message' >(this.origin+'/api/events',{headers:this.mediaHeaders(cookie),withCredentials:false,pollingInterval:3000,timeout:30000});
    source.addEventListener('open',()=>onState('connected'));
    source.addEventListener('error',()=>onState('reconnecting'));
    source.addEventListener('message',e=>{try{if(e.data)onFrame(JSON.parse(e.data) as StreamFrame)}catch{}});
    return ()=>source.close();
  }
}
