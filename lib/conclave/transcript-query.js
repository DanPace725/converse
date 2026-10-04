import { sql } from 'drizzle-orm';
import { events } from './db-schema.js';

// Project provider summaries in PostgreSQL. Opaque signatures/continuations and
// tool arguments never cross the wire; their availability remains visible.
const nativeBlock = value => sql`jsonb_strip_nulls(jsonb_build_object(
  'type', ${value}->'type', 'id', ${value}->'id', 'summary', ${value}->'summary',
  'content', ${value}->'content', 'thinking', ${value}->'thinking',
  'text', ${value}->'text', 'thought', ${value}->'thought',
  'encrypted_content', CASE WHEN ${value}->>'encrypted_content' IS NOT NULL THEN 'true'::jsonb END,
  'signature', CASE WHEN ${value}->>'signature' IS NOT NULL THEN 'true'::jsonb END,
  'thoughtSignature', CASE WHEN ${value}->>'thoughtSignature' IS NOT NULL THEN 'true'::jsonb END))`;
const output = array => sql`COALESCE((SELECT jsonb_agg(${nativeBlock(sql`block`)} ||
  CASE WHEN block ? 'anthropic_content' THEN jsonb_build_object('anthropic_content', ${nativeBlock(sql`block->'anthropic_content'`)}) ELSE '{}'::jsonb END ORDER BY ordinal)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${array}) = 'array' THEN ${array} ELSE '[]'::jsonb END)
  WITH ORDINALITY AS blocks(block, ordinal)), '[]'::jsonb)`;
const metadata = sql`${events.data}->'metadata'`;
const payload = sql`${metadata}->'payload'`;
const request = sql`jsonb_strip_nulls(jsonb_build_object(
  'provider', ${metadata}->'provider', 'user_event_id', ${metadata}->'user_event_id',
  'run_id', ${metadata}->'run_id', 'context_revision', ${metadata}->'context_revision',
  'payload', jsonb_strip_nulls(jsonb_build_object('model', ${payload}->'model',
    'max_output_tokens', ${payload}->'max_output_tokens', 'reasoning', ${payload}->'reasoning'))))`;
const response = sql`jsonb_strip_nulls(jsonb_build_object(
  'request_id', ${metadata}->'request_id', 'model', ${metadata}->'model',
  'response_id', ${metadata}->'response_id', 'usage', ${metadata}->'usage', 'status', ${metadata}->'status',
  'output', ${output(sql`${metadata}->'output'`)}, 'content', ${output(sql`${metadata}->'content'`)}))`;

export const displayEvent = sql`(CASE WHEN ${events.data}->>'kind' = 'document' AND NOT (${metadata} ? 'attachment_id')
    THEN (${events.data} - 'metadata' - 'content') || jsonb_build_object('content', '')
    ELSE ${events.data} - 'metadata' END) || jsonb_build_object('metadata',
  CASE ${events.data}->>'kind'
    WHEN 'inference_request' THEN ${request}
    WHEN 'inference_response' THEN ${response}
    ELSE ${metadata} END)`;
export const displayKinds = sql`(${events.data}->>'kind' IN ('conversation', 'conversation_title', 'turn_complete', 'turn_failure', 'reasoning', 'document_lifecycle')
  OR (${events.data}->>'kind' IN ('user', 'assistant') AND COALESCE(${metadata}->>'purpose', '') NOT LIKE 'manual-%')
  OR (${events.data}->>'kind' = 'document' AND (${metadata} ? 'attachment_id' OR ${metadata} ? 'workspace_path'))
  OR (${events.data}->>'kind' IN ('inference_request', 'inference_response') AND ${events.data}->>'content' = 'answer'))`;
export const checkpointEvent = sql`(${events.data} - 'metadata') || jsonb_build_object('metadata', jsonb_build_object('state',
  (${metadata}->'state') - 'pending' - 'protected_ids' - 'continuation'))`;
