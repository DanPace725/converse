# CLP broker in Converse

Converse includes Conclave's opt-in CLP evidence broker. Registered claims can be queried by the task model through `query_clp`, with admitted results separated from unresolved/thin/refuted claims. Confidence and separation remain unmeasured; positive floors withhold claims.

There are no CLP form controls yet. Registration and evidence declarations use the existing authenticated `/api/conclave` API, or the standalone Conclave CLI/library. The full [broker guide](../../CLA/conclave/docs/CLP_BROKER.md) defines the inputs, direction of links, source grouping and limitations.

| POST action | Purpose |
|---|---|
| clp_frame_register | Register an immutable frame name/version, fields, validators and resolution defaults. |
| clp_attest | Declare an existing source's origin and earlier parents. |
| clp_record | Record typed content against an exact frame version with original source IDs. |
| clp_link | Link evidence to a target claim with supports/refutes, or a newer record to an older one with supersedes. |
| clp_query | Query frame-scoped results with filters, resolution floors and pagination. |

POST inputs include `conversation_id`; existing password/session authorization applies. GET `action=clp_frames&conversation=conv_ID` lists frame versions; GET `action=clp_bundle&conversation=conv_ID&bundle=clp_ID` reads an exact record.

Example query body:

```json
{"action":"clp_query","conversation_id":"conv_ID","frame":["claim"],"filters":{"keyword":"earthquake"},"resolution":{"min_support":3},"attention_budget":"low","limit":20,"offset":0}
```

Frames must be registered first, and records must reference existing sources. Local uploads need origin attestation to contribute independent support; full retrieved pages already have origins. Origin attestations and support/refute links are declared provenance, not independent verification of truth. Publisher grouping is conservative and can undercount multi-label public suffixes. Follow `next_offset` even when a page contains only unresolved results. Ordinary named state and the working projection are separate from these manual broker records.

SQLite and hosted PostgreSQL preserve the registry, records and links in existing append-only events; no database migration is required. Portable sidecars/import, signatures/trust registries, frame policy enforcement/redaction, vector/graph brokerage, exploration and measured confidence/coherence remain pending.

Engine changes start in the Conclave repository and migrate into Converse using the existing hash manifest. [Validation](archive/2026-10-03/clp-broker.md)
