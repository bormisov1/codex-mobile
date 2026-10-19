export type PermissionMode = 'restrictive' | 'moderate' | 'yolo';
export type Effort = '' | 'low' | 'medium' | 'high' | 'xhigh';
export type Theme = 'dark' | 'light';
export type Accent = 'green' | 'blue' | 'purple' | 'gold';
export interface Preferences {
  permissionMode: PermissionMode; effort: Effort; theme: Theme; accent: Accent;
  density: 'comfortable' | 'compact'; autoScroll: boolean; notify: boolean; keepUsageWindowWarm: boolean;
  amtToolsEnabled: boolean; speechLanguage: 'auto' | 'ru-RU' | 'en-US';
  systemPrompts: Record<string,string>; autoResume: Record<string, boolean>;
}
export interface Workspace { name:string; path:string }
export interface Attachment { id:string; name:string; path:string; size:number; mimeType:string; isImage:boolean }
export interface GalleryFile { name:string; path:string; size:number; modifiedAt:number|string; mimeType:string; isImage:boolean; source:string }
export interface ThreadItem { id?:string; type:string; phase?:string; text?:string; content?:unknown; [key:string]:unknown }
export interface Turn { id:string; status:string; items:ThreadItem[]; error?:unknown; [key:string]:unknown }
export interface Thread { id:string; cwd:string; preview?:string; name?:string; status?:{type:string;activeFlags?:string[]}; turns?:Turn[]; updatedAt?:number; createdAt?:number; [key:string]:unknown }
export interface ActiveThread { threadId:string; turnId:string|null; activeFlags?:string[]; updatedAt?:number }
export interface ServerRequest { id:string|number; method:string; params?:Record<string,unknown> }
export interface CodexEvent { method:string; params?:Record<string,unknown> }
export type StreamFrame =
  | {type:'connected';pendingRequests:ServerRequest[];activeThreads:ActiveThread[];recentEvents?:{threadId:string;event:CodexEvent;at:number}[]}
  | {type:'codex_event';event:CodexEvent}
  | {type:'server_request';request:ServerRequest}
  | {type:'bridge_error';message:string};
export interface QueuedMessage { id:string; threadId:string; text:string; attachments:Attachment[]; status:'queued'|'failed'; error?:string }
export interface ActivityEntry { id:string; title:string; detail:string; kind:string; status:string; at:number }
export interface PlanStep { step:string; status:string }
export const DEFAULT_PREFERENCES:Preferences = {
  permissionMode:'moderate', effort:'', theme:'dark', accent:'green', density:'comfortable',
  autoScroll:true, notify:false, keepUsageWindowWarm:false, amtToolsEnabled:false, speechLanguage:'auto', systemPrompts:{}, autoResume:{}
};
