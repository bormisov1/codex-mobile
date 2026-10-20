import test from 'node:test';
import assert from 'node:assert/strict';
import {activityDetail, activityEvent, activityOf, chatTokenCount, countdownLabel, originOf, eventThreadId, interruptTurnId, isAlreadyStoppedError, isWorking, messagesOf, isDecisionRequest, isRateLimitError, isLocalResource, planOf, rateReset, reconcileActivity, pathForThread, usageDetails, usageWarmupKey} from '../src/model.ts';

test('server origin accepts a pathless HTTP or HTTPS origin only',()=>{
 assert.equal(originOf('https://codex.example.com/'),'https://codex.example.com');
 assert.equal(originOf('http://192.168.1.10:4545'),'http://192.168.1.10:4545');
 for(const input of ['https://example.com/api','https://user:pass@example.com','file:///tmp/x','https://example.com/?x=1']) assert.throws(()=>originOf(input));
});
test('thread paths encode IDs and events identify their thread',()=>{
 assert.equal(pathForThread('a/b'),'/api/threads/a%2Fb');
 assert.equal(eventThreadId({method:'turn/started',params:{turn:{threadId:'t1'}}}),'t1');
 assert.equal(eventThreadId({method:'turn/started',params:{thread:{id:'t2'}}}),'t2');
});
test('working state and interrupt target ignore stale completed turns',()=>{
 const completed={id:'t',cwd:'/',status:{type:'idle'},turns:[{id:'old',status:'completed',items:[]}]};
 assert.equal(isWorking(completed,new Set()),false);
 assert.equal(interruptTurnId(completed),undefined);
 const running={...completed,status:{type:'active'},turns:[{id:'current',status:'inProgress',items:[]}]};
 assert.equal(isWorking(running,new Set()),false);
 assert.equal(isWorking(running,new Set(['t'])),true);
 assert.equal(interruptTurnId(running),'current');
 assert.equal(interruptTurnId(completed,{turnId:'server-turn'}),'server-turn');
});
test('durable item history retains user, assistant, and commentary',()=>{
 const thread={id:'t',cwd:'/workspace',turns:[{id:'turn',status:'completed',items:[{type:'userMessage',content:[{type:'text',text:'Hello'}]},{type:'agentMessage',text:'World'},{type:'agentMessage',phase:'commentary',text:'Checking files'}]}]};
 assert.deepEqual(messagesOf(thread).map(m=>[m.role,m.text]),[['user','Hello'],['assistant','World'],['commentary','Checking files']]);
});
test('attachment-only messages remain visible after durable resync',()=>{
 const thread={id:'t',cwd:'/workspace',turns:[{id:'turn',status:'completed',items:[{type:'userMessage',content:[{type:'localImage',path:'/workspace/upload/photo.png'}]}]}]};
 assert.equal(messagesOf(thread)[0].text,'Attached photo.png');
});
test('approval gate distinguishes decision requests and unsupported structured input',()=>{
 assert.equal(isDecisionRequest('item/commandExecution/requestApproval'),true);
 assert.equal(isDecisionRequest('tool/requestUserInput'),false);
});
test('rate-limit reset is converted from seconds, and local links are recognized',()=>{
 const next=Math.floor(Date.now()/1000)+60;
 assert.equal(rateReset({rateLimits:{primary:{resetsAt:next}}}),next*1000);
 assert.equal(rateReset({rateLimits:{primary:{resetsAt:next*1000}}}),next*1000);
 const now=2_000_000;
 assert.equal(rateReset({rateLimits:{primary:{usedPercent:100,resetsAt:1900},secondary:{usedPercent:20,resetsAt:3000}}},now),undefined);
 assert.equal(rateReset({rateLimits:{primary:{usedPercent:100,resetsAt:2500},secondary:{usedPercent:20,resetsAt:2100}}},now),2_500_000);
 assert.equal(rateReset({rateLimits:{primary:{usedPercent:0,resetsAt:2500}}},now),undefined);
 assert.equal(isRateLimitError({message:'rate limit exceeded'}),true);
 assert.equal(isRateLimitError('some other failure'),false);
 assert.equal(isLocalResource('/home/work/image.png'),true);
 assert.equal(isLocalResource('https://example.com/image.png'),false);
});
test('already-finished interruption errors are safe to suppress',()=>{
 assert.equal(isAlreadyStoppedError(new Error('Turn is not active')),true);
 assert.equal(isAlreadyStoppedError('Turn already interrupted'),true);
 assert.equal(isAlreadyStoppedError(new Error('Network unavailable')),false);
});
test('countdowns retain ticking seconds alongside hours and minutes',()=>{
 assert.equal(countdownLabel(7),'7s');
 assert.equal(countdownLabel(127),'2m 7s');
 assert.equal(countdownLabel(7384),'2h 3m 4s');
});
test('Codex usage is normalized from API and live event payloads',()=>{
 const screenshotPayload={rateLimits:{limitId:'codex',limitName:null,primary:{usedPercent:0,windowDurationMins:300,resetsAt:1792397861},secondary:{usedPercent:26,windowDurationMins:10080,resetsAt:1792895195},credits:{hasCredits:false,unlimited:false,balance:'0'},planType:'plus'}};
 assert.deepEqual(usageDetails(screenshotPayload),{plan:'Plus',windows:[
  {key:'primary',label:'5-hour limit',usedPercent:0,remainingPercent:100,resetsAt:1792397861000},
  {key:'secondary',label:'Weekly limit',usedPercent:26,remainingPercent:74,resetsAt:1792895195000},
 ]});
 assert.deepEqual(usageDetails({rateLimits:{primary:{usedPercent:'12.5',windowDurationMins:'60',resetsAt:'2026-10-20T10:00:00Z'}}}).windows,[
  {key:'primary',label:'1-hour limit',usedPercent:12.5,remainingPercent:87.5,resetsAt:Date.parse('2026-10-20T10:00:00Z')},
 ]);
 assert.deepEqual(usageDetails(undefined),{plan:undefined,windows:[]});
});
test('usage warmup keys only fully reset primary windows',()=>{
 const now=1_000_000;
 assert.equal(usageWarmupKey({rateLimits:{primary:{usedPercent:0,resetsAt:2000}}},now),'primary:2000000');
 assert.equal(usageWarmupKey({rateLimits:{primary:{usedPercent:1,resetsAt:2000}}},now),undefined);
 assert.equal(usageWarmupKey({rateLimits:{primary:{usedPercent:0,resetsAt:500}}},now),undefined);
});
test('chat token count accepts durable and live Codex shapes',()=>{
 assert.equal(chatTokenCount({totalTokenUsage:{totalTokens:12345}}),12345);
 assert.equal(chatTokenCount({total:{total_tokens:'23456'}}),23456);
 assert.equal(chatTokenCount({tokenUsage:{inputTokens:20,outputTokens:5}}),25);
 assert.equal(chatTokenCount({},undefined),undefined);
});
test('activity details never expose empty protocol objects',()=>{
 assert.equal(activityDetail({type:'reasoning',id:'r1',summary:[],content:[]}), '');
 assert.equal(activityDetail({type:'reasoning',summary:[{type:'text',text:'Checking the project'}]}),'Checking the project');
 assert.equal(activityDetail({type:'fileChange',changes:[{type:'modified',path:'App.tsx'}]}),'modified: App.tsx');
});
test('durable activity infers only the current item as running',()=>{
 const active={id:'turn',status:'inProgress',startedAt:100,items:[{id:'r1',type:'reasoning',summary:[{text:'First'}]},{id:'c1',type:'commandExecution',command:'npm test'}]};
 assert.deepEqual(activityOf(active).map(x=>[x.id,x.status]),[['r1','done'],['c1','running']]);
 assert.equal(activityOf({...active,status:'completed'}).at(-1).status,'done');
 assert.equal(activityOf({...active,status:'failed'}).at(-1).status,'failed');
});
test('live activity transitions preserve details and finish on turn completion',()=>{
 let entries=activityEvent([],{method:'item/started',params:{item:{id:'r1',type:'reasoning'}}},100);
 entries=activityEvent(entries,{method:'item/reasoning/summaryTextDelta',params:{itemId:'r1',delta:'Checking '}},110);
 entries=activityEvent(entries,{method:'item/reasoning/summaryTextDelta',params:{itemId:'r1',delta:'files'}},120);
 assert.deepEqual([entries[0].status,entries[0].detail,entries[0].at],['running','Checking files',100]);
 entries=activityEvent(entries,{method:'turn/completed',params:{turn:{status:'completed'}}},130);
 assert.equal(entries[0].status,'done');
});
test('durable polling reconciles stale live statuses in both directions',()=>{
 const staleDone=[{id:'r1',kind:'reasoning',title:'Thinking',detail:'Live',status:'done',at:100}];
 const active={id:'turn',status:'inProgress',items:[{id:'r1',type:'reasoning',summary:[]}]};
 assert.equal(reconcileActivity(staleDone,active)[0].status,'running');
 const staleRunning=[{...staleDone[0],status:'running'}];
 assert.equal(reconcileActivity(staleRunning,{...active,status:'completed'})[0].status,'done');
});
test('a saved plan is reconstructed from last turn',()=>{
 const thread={id:'t',cwd:'/',turns:[{id:'a',status:'completed',items:[{type:'plan',plan:[{step:'Check',status:'completed'}]}]}]};
 assert.deepEqual(planOf(thread),[{step:'Check',status:'completed'}]);
});
