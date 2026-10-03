import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayBaseline, replayRecipe } from '../scripts/replay-baseline.js';

function fixture(directory) {
  const prompts=['Original objective','Try to continue please','Extend it','Decide','Review it',
    'There was an issue with tool calls, it should be fixed now, try again','Use uploaded documents'];
  const events=prompts.map((content,i)=>({id:'user_'+i,seq:i*10+2,kind:'user',content,
    metadata:{web_settings:{provider:[2,4,5,6].includes(i)?'anthropic':'openai',
      model:[2,4,5,6].includes(i)?'claude-sonnet-5-5':'gpt-6.1-sol',output:16384,reasoning:'medium'}}}));
  events.push(...[0,4].map(i=>({seq:i*10+5,kind:'turn_failure',metadata:{user_event_id:'user_'+i}})),
    ...[0,1].map(i=>({id:'upload_'+i,seq:60+i,kind:'document',actor:'human',content:'Full document '+i,
      metadata:{workspace_path:'upload_'+i+'.md'}})));
  events.sort((a,b)=>a.seq-b.seq);
  const source=join(directory,'source.json');
  const record={title:'Fixture',conversation_id:'conv_original',context_layer:{events}};
  writeFileSync(source,JSON.stringify(record));return {source,record};
}

test('baseline preserves the five workload prompts and uploads, resolves tools, and excludes context-management tools',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'baseline-replay-'));
  try {
    const {source,record}=fixture(dir),recipe=replayRecipe(record);
    assert.deepEqual(recipe.turns.map(t=>t.prompt),['Original objective','Extend it','Decide','Review it','Use uploaded documents']);
    assert.equal(recipe.turns[0].reference_successful_user_id,'user_1');
    assert.equal(recipe.turns[3].reference_successful_user_id,'user_5');
    assert.equal(recipe.turns[4].uploads.length,2);
    let requests=0;
    const folder=await replayBaseline({source,folder:join(dir,'run'),live:true,cap:5,
      providerFactory:name=>({name,respond:async payload=>{
        requests++;
        assert.ok(payload.tools.every(t=>/^(workspace_|calculate)/.test(t.name)));
        assert.ok(payload.tools.some(t=>t.name==='workspace_patch'));
        assert.equal(payload.max_output_tokens,16384);
        if(requests===1)return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
          {type:'function_call',call_id:'write',name:'workspace_write',arguments:JSON.stringify({path:'report.md',content:'Full result',expected_source_event_id:null})}]};
        if(requests===2){assert.ok(payload.input.some(i=>i.call_id==='write'&&i.type==='function_call_output'));
          return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
            {type:'function_call',call_id:'read',name:'workspace_read',arguments:'{"path":"report.md","offset":0}'}]};}
        if(requests===4)assert.ok(payload.input.some(i=>i.content?.includes('Historical tool_result')&&i.content.includes('Full result')));
        return {status:'completed',model:payload.model,usage:{input_tokens:1000,output_tokens:40},output:[{type:'message',content:[{type:'output_text',text:'Completed.'}]}]};
      }})});
    const ledger=JSON.parse(readFileSync(join(folder,'ledger.json')));
    assert.equal(ledger.status,'completed');assert.equal(ledger.turns.length,5);
    assert.equal(ledger.calls.length,7);assert.ok(ledger.debited_usd<5);
    const exported=JSON.parse(readFileSync(join(folder,'baseline-export.json')));
    assert.ok(!exported.context_layer.events.some(e=>['attention_decision','decision_proposal','context_review'].includes(e.kind)));
    assert.equal(readFileSync(join(folder,'artifacts','report.md'),'utf8'),'Full result');
    assert.equal(readFileSync(join(folder,'artifacts','upload_1.md'),'utf8'),'Full document 1');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('baseline spending guard prevents a generation call before exceeding the cap',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'baseline-cap-'));
  try {
    const {source}=fixture(dir);let paid=0;
    const folder=await replayBaseline({source,folder:join(dir,'run'),live:true,cap:0.000001,
      providerFactory:name=>({name,countTokens:async()=>({input_tokens:1000}),respond:async()=>{paid++;throw Error('Must not call');}})});
    assert.equal(paid,0);
    const ledger=JSON.parse(readFileSync(join(folder,'ledger.json')));
    assert.equal(ledger.status,'cost_cap');assert.equal(ledger.calls.length,0);assert.equal(ledger.debited_usd,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a spending-guard stop resumes from saved tool receipts without repeating a paid response or write',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'baseline-resume-'));
  try {
    const {source}=fixture(dir);let paid=0;
    const factory=name=>({name,respond:async payload=>{
      paid++;
      if(paid===1)return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
        {type:'function_call',call_id:'saved_write',name:'workspace_write',arguments:'{"path":"saved.md","content":"Saved once","expected_source_event_id":null}'}]};
      if(paid===2){assert.ok(payload.input.some(i=>i.call_id==='saved_write'&&i.type==='function_call_output'));
        return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
          {type:'function_call',call_id:'read_saved',name:'workspace_read',arguments:'{"path":"saved.md","offset":0}'}]};}
      return {status:'completed',model:payload.model,usage:{input_tokens:1000,output_tokens:40},output:[
        {type:'message',content:[{type:'output_text',text:'Complete.'}]}]};
    }});
    const folder=await replayBaseline({source,folder:join(dir,'run'),live:true,cap:0.28,providerFactory:factory});
    let ledger=JSON.parse(readFileSync(join(folder,'ledger.json')));
    assert.equal(ledger.status,'cost_cap');assert.equal(paid,1);assert.equal(ledger.turns[0].steps,1);
    await replayBaseline({folder,resume:true,live:true,cap:null,providerFactory:factory});
    ledger=JSON.parse(readFileSync(join(folder,'ledger.json')));
    assert.equal(ledger.status,'completed');assert.equal(paid,7);assert.equal(ledger.calls.length,7);
    const record=JSON.parse(readFileSync(join(folder,'baseline-export.json')));
    assert.equal(record.context_layer.events.filter(e=>e.kind==='document'&&e.metadata.workspace_path==='saved.md').length,1);
    assert.equal(ledger.resumptions[0].previous_cap,0.28);
    assert.equal(ledger.cap_usd,null);
    assert.equal(ledger.resumptions[0].new_cap,null);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('reported output exhaustion gets explicit skipped receipts and continues without executing incomplete writes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'baseline-output-'));
  try {
    const {source}=fixture(dir);let paid=0;
    const folder=await replayBaseline({source,folder:join(dir,'run'),live:true,cap:null,
      providerFactory:name=>({name,respond:async payload=>{
        paid++;assert.equal(payload.max_output_tokens,16384);
        if(paid===1)return {status:'incomplete',stop_reason:'max_tokens',usage:{input_tokens:1000,output_tokens:16384},output:[
          {type:'function_call',call_id:'incomplete_write',name:'workspace_write',arguments:'{"path":"unfinished.md","expected_source_event_id":null}'}]};
        if(paid===2){assert.ok(payload.input.some(i=>i.call_id==='incomplete_write'&&i.output?.includes('Not executed')));
          return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
            {type:'function_call',call_id:'complete_write',name:'workspace_write',arguments:'{"path":"complete.md","content":"Complete small write","expected_source_event_id":null}'}]};}
        if(paid===3)return {status:'completed',usage:{input_tokens:1000,output_tokens:40},output:[
          {type:'function_call',call_id:'read_complete',name:'workspace_read',arguments:'{"path":"complete.md","offset":0}'}]};
        return {status:'completed',model:payload.model,usage:{input_tokens:1000,output_tokens:40},output:[
          {type:'message',content:[{type:'output_text',text:'Complete.'}]}]};
      }})});
    const ledger=JSON.parse(readFileSync(join(folder,'ledger.json'))),record=JSON.parse(readFileSync(join(folder,'baseline-export.json')));
    assert.equal(ledger.status,'completed');assert.equal(paid,8);assert.equal(ledger.turns[0].steps,4);
    assert.equal(record.context_layer.events.filter(e=>e.kind==='baseline_output_continuation').length,1);
    assert.ok(!record.context_layer.events.some(e=>e.kind==='document'&&e.metadata.workspace_path==='unfinished.md'));
    assert.equal(readFileSync(join(folder,'artifacts','complete.md'),'utf8'),'Complete small write');
    assert.equal(JSON.parse(readFileSync(join(folder,'costs.json'))).priced_calls,8);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
