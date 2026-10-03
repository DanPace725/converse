import test from 'node:test';
import assert from 'node:assert/strict';
import { requestComparison } from '../lib/conclave/request-comparison.js';
import { anthropicPayload } from '../lib/conclave/provider.js';

test('full-history comparison counts retained task results but not private reasoning or duplicate workspace versions',()=>{
  const payload={model:'fixture',instructions:'Instructions',input:[{role:'user',content:'Small working projection'}],max_output_tokens:100};
  const event=(seq,kind,content,metadata={},actor='human')=>({seq,kind,content,metadata,actor});
  const events=[event(1,'user','Objective'),event(2,'document','Duplicate workspace file '.repeat(500),{workspace_path:'file.md'}),
    event(3,'reasoning','Private thought '.repeat(500)),event(4,'tool_call','workspace_read',{call_id:'read',arguments:'{"path":"file.md"}'},'openai'),
    event(5,'tool_result','Full read result '.repeat(500),{call_id:'read'},'openai'),
    event(6,'tool_call','update_state',{call_id:'state',arguments:'Management '.repeat(500)},'openai'),
    event(7,'tool_result','Management receipt '.repeat(500),{call_id:'state'},'openai')];
  const result=requestComparison(payload,{name:'openai'},events);
  assert.ok(result.full_tokens>result.sent_tokens);
  assert.equal(result.phase,'next');
  assert.equal(result.full_tokens,requestComparison(payload,{name:'openai'},events.filter(e=>!['reasoning','document'].includes(e.kind)&&e.metadata.call_id!=='state')).full_tokens);
  const claude=requestComparison(payload,{name:'anthropic',requestPayload:anthropicPayload},events);
  assert.ok(claude.full_tokens>claude.sent_tokens);
});

test('full-history comparison carries the web and guide results a plain chat would also have sent',()=>{
  const payload={model:'fixture',instructions:'Instructions',input:[{role:'user',content:'Small working projection'}],max_output_tokens:100};
  const event=(seq,kind,content,metadata={},actor='openai')=>({seq,kind,content,metadata,actor});
  const exchange=(seq,name)=>[event(seq,'tool_call',name,{call_id:name,arguments:'{}'}),event(seq+1,'tool_result','Observed text '.repeat(400),{call_id:name})];
  const chat=[event(1,'user','Objective',{},'human')];
  const base=requestComparison(payload,{name:'openai'},chat).full_tokens;
  for(const name of ['web_search','web_fetch','read_app_guide'])
    assert.ok(requestComparison(payload,{name:'openai'},[...chat,...exchange(2,name)]).full_tokens>base+400,name);
  for(const name of ['search_history','resolve_context','read_telemetry'])
    assert.equal(requestComparison(payload,{name:'openai'},[...chat,...exchange(2,name)]).full_tokens,base,name);
});

test('request breakdown attributes each part of the sent input and exposes the unexplained remainder',()=>{
  const segments=[{id:'S1',type:'constraint',status:'active',content:'Budget is fixed. '.repeat(20),state_key:'budget',pinned:true},
    {id:'S2',type:'recent',status:'active',content:'A long user message. '.repeat(200)},
    {id:'S3',type:'evidence',status:'active',content:'Workspace plan.md; source E4.\n'+'Plan text. '.repeat(50)},
    {id:'S4',type:'reference',status:'active',content:'Pointer'}];
  const payload={model:'fixture',instructions:'Instructions '.repeat(30),max_output_tokens:100,
    tools:[{type:'function',name:'web_fetch',description:'Read a page',parameters:{}},{type:'function',name:'calculate',description:'Add',parameters:{}}],
    input:[{role:'user',content:`Working context:\n${JSON.stringify(segments)}\nWorking context revision 4; protected segments: []\nRespond to the latest user message.`},
      {role:'user',content:'Current saved workspace manifest (authoritative):\n[{"path":"plan.md"}]'},
      {type:'function_call',call_id:'c1',name:'web_fetch',arguments:'{"url":"https://example.com"}'},
      {type:'function_call_output',call_id:'c1',output:'Fetched page text. '.repeat(600)},
      {type:'reasoning',encrypted_content:'opaque'}]};
  const request={id:'req',seq:5,metadata:{}};
  const events=[{seq:1,kind:'user',content:'Objective',metadata:{},actor:'human'},request,
    {seq:6,kind:'inference_response',content:'answer',metadata:{request_id:'req',usage:{input_tokens:9000}},actor:'openai'}];
  const result=requestComparison(payload,{name:'openai'},events,request), {breakdown}=result;
  const part=key=>breakdown.parts.find(p=>p.key===key);
  assert.deepEqual(breakdown.parts.map(p=>p.key),['instructions','tools','memory','context','files','turn','reasoning','framing']);
  assert.equal(breakdown.parts.reduce((sum,p)=>sum+p.tokens,0),breakdown.estimated_tokens);
  assert.equal(result.sent_estimated_tokens,breakdown.estimated_tokens);
  assert.deepEqual(part('tools').items.map(i=>i.label).sort(),['calculate','web_fetch']);
  assert.deepEqual(part('memory').items.map(({ref,label,kind,pinned})=>({ref,label,kind,pinned})),[{ref:'S1',label:'budget',kind:'state',pinned:true}]);
  assert.deepEqual(part('context').items.map(i=>i.ref),['S2','S4']);
  assert.deepEqual(part('files').items.map(i=>i.ref||i.kind),['S3','manifest']);
  // The fetched page, not the conversation, is the largest part of this request.
  const fetched=part('turn').items[0];
  assert.deepEqual({label:fetched.label,kind:fetched.kind},{label:'web_fetch',kind:'result'});
  assert.ok(fetched.tokens>part('context').tokens&&part('turn').tokens>breakdown.estimated_tokens/2);
  assert.equal(breakdown.reported_tokens,9000);
  assert.equal(breakdown.unattributed_tokens,9000-breakdown.estimated_tokens);
  const next=requestComparison(payload,{name:'openai'},events);
  assert.equal(next.breakdown.reported_tokens,null);assert.equal(next.breakdown.unattributed_tokens,null);
  const many={...payload,input:[{role:'user',content:`Working context:\n${JSON.stringify(Array.from({length:70},(_,i)=>({id:'S'+i,type:'recent',content:'x'.repeat(i)})))}`}]};
  const context=requestComparison(many,{name:'openai'},events).breakdown.parts.find(p=>p.key==='context');
  assert.equal(context.items.length,60);assert.equal(context.items_omitted,10);
});
