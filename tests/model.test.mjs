import test from 'node:test';
import assert from 'node:assert/strict';
import {originOf, eventThreadId, messagesOf, isDecisionRequest, isRateLimitError, isLocalResource, planOf, rateReset, pathForThread} from '../src/model.ts';

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
 assert.equal(isRateLimitError({message:'rate limit exceeded'}),true);
 assert.equal(isRateLimitError('some other failure'),false);
 assert.equal(isLocalResource('/home/work/image.png'),true);
 assert.equal(isLocalResource('https://example.com/image.png'),false);
});
test('a saved plan is reconstructed from last turn',()=>{
 const thread={id:'t',cwd:'/',turns:[{id:'a',status:'completed',items:[{type:'plan',plan:[{step:'Check',status:'completed'}]}]}]};
 assert.deepEqual(planOf(thread),[{step:'Check',status:'completed'}]);
});
