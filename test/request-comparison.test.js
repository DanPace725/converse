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
