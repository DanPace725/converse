# Converse model costs

Checked October 2, 2026. USD public direct-API list prices, standard paid processing. Rates below are **per million tokens**, except GPT-Live-1. This is a current reference, not a reconstruction of historical invoices. Taxes, negotiated discounts, hosting, database costs, and separately billed provider tools are excluded.

Scope comes from a live, read-only call through Converse's actual `models()` function: **6 GPT, 5 Claude, and 6 Gemini IDs**. The timestamp and exact catalog are in [model inventory](model-inventory-2026-10-02.json). Converse selects the latest five eligible models plus two older comparison models; it does not maintain a fixed model allowlist. Catalog visibility alone does not prove successful generation through every app mode. Context/Agent mode supports OpenAI and Anthropic; ordinary chat additionally supports Gemini.

The [JSON companion](model-costs-2026-10-02.json) preserves exact IDs, rate types, sources, future Gemini rates, and unknowns for a later cost reporter. Unknown rates remain `null`.

## OpenAI

| Exact Converse ID | Input | Cache read | Cache write | Output | Source |
|---|---:|---:|---:|---:|---|
| `gpt-6.1-sol` | 2.00 | 0.10 | 2.50 | 10.00 | [Model](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| `gpt-6-luna` | 0.10 | 0.01 | 0.125 | 0.50 | [Pricing](https://developers.openai.com/api/docs/pricing) |
| `gpt-6-sol` | 2.00 | 0.20 | 2.50 | 10.00 | [Exact model](https://developers.openai.com/api/docs/models/gpt-6-sol) |
| `gpt-6-astra` | 10.00 | 1.00 | 12.50 | 50.00 | [Pricing](https://developers.openai.com/api/docs/pricing) |
| `gpt-4o-2024-11-20` | 2.50 | 1.25 | No separate charge | 10.00 | [GPT-4o family](https://developers.openai.com/api/docs/models/gpt-4o) |
| `gpt-live-1` | — | — | — | — | **$0.05/minute**, billed by the second; backend calls extra. [Model](https://developers.openai.com/api/docs/models/gpt-live-1) |

The GPT-4o dated snapshot uses the published family rate. GPT-Live-1 appears in the current picker but uses a voice-session billing unit; its catalog entry is not sufficient evidence that Converse's ordinary text request path supports it. Its token rates are left blank.

The official pricing page also lists these **long-context** standard rates:

| ID | Input | Cache read | Cache write | Output |
|---|---:|---:|---:|---:|
| `gpt-6.1-sol` | 4.00 | 0.20 | 5.00 | 15.00 |
| `gpt-6-luna` | 0.20 | 0.02 | 0.25 | 0.75 |
| `gpt-6-astra` | 20.00 | 2.00 | 25.00 | 75.00 |

[Source: standard short/long pricing tables](https://developers.openai.com/api/docs/pricing). A numeric tier boundary was not established in the retrieved material; do not choose the tier from the application's byte guard. Long-context rates for the exact older `gpt-6-sol` ID were not verified; do not substitute `gpt-6.1-sol` rates automatically.

**Correction to REORIENTATION.md:** supported OpenAI models cache by default. On GPT-5.6 and later, `prompt_cache_key` is optional for separate accounting, rather than an enable switch. Cache writes use their own rate instead of ordinary input pricing; the write price is not an additive surcharge. Usage reports writes as `input_tokens_details.cache_write_tokens`. GPT-6.1 Sol's cache reads are 5% of its input rate. [Official caching guidance](https://developers.openai.com/api/docs/guides/prompt-caching)

## Anthropic

| Exact Converse ID | Input | Cache read | Write, 5 min | Write, 1 hour | Output |
|---|---:|---:|---:|---:|---:|
| `claude-sonnet-5-5` | 2.00 | 0.20 | 2.50 | 4.00 | 10.00 |
| `claude-opus-5-5` | 4.00 | 0.20 | 5.00 | 8.00 | 20.00 |
| `claude-fable-5-1` | 10.00 | 0.25 | 12.50 | 20.00 | 50.00 |
| `claude-opus-5` | 5.00 | 0.50 | 6.25 | 10.00 | 25.00 |
| `claude-sonnet-5` | 2.00 | 0.20 | 2.50 | 4.00 | 10.00 |

[Source: official Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing). These models have no long-context premium in the published table. Opus 5.5 and Fable 5.1 have model-specific cache discounts; a universal 10% assumption is wrong. Current Converse's native adapter does not set cache breakpoints, so these read rates must not be interpreted as an observed discount in existing runs.

## Google Gemini

| Exact Converse ID | Input | Cache read | Output, including thinking | Explicit cache storage, $/million tokens/hour |
|---|---:|---:|---:|---:|
| `gemini-3.8-flash` | 0.75 | 0.075 | 3.75 | 0.50 |
| `gemini-3.7-flash` | 0.75 | 0.075 | 3.75 | 0.50 |
| `gemini-3.6-flash` | 0.75 | 0.075 | 3.75 | 0.50 |
| `gemini-3.5-flash-lite` | 0.30 | 0.03 | 2.50 | 1.00 |
| `gemini-3.5-flash` | 1.50 | 0.15 | 9.00 | 1.00 |
| `gemini-3.1-pro-preview`, input ≤200K | 2.00 | 0.20 | 12.00 | 4.50 |
| Same ID, input >200K | 4.00 | 0.40 | 18.00 | 4.50 |

[Source: Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing). The first three rows are introductory rates through **December 31, 2026**. From **January 1, 2027**, their input/read/output/storage rates become **1.50 / 0.15 / 7.50 / 1.00**. No separate cache-write token price was verified. Storage applies to stored explicit caches; do not charge it merely because a response reports cached input. Free-tier eligibility is separate from this paid reference.

## Existing management model

`jev-latest` is observed in the supplied exports and remains Converse's TypeSafe selector. Its published price is **$0.042 per million input tokens; output is free**. The neighboring $0.20-$10 input and roughly 5x output figures compare general LLMs with Jev. [TypeSafe announcement, September 15, 2026](https://typesafe.ai/blog/introducing-system-one-models-and-jev), checked October 2. This is a current public rate, not an account invoice. Price management requests separately and include any downstream compaction, retrieval or cache rewrites when evaluating net benefit.

## How the next reporter should use this reference

Normalize each completed call into mutually exclusive input buckets before pricing:

```text
U = total input - cached reads - cache writes
cost = (U * input_rate + reads * read_rate
        + writes_5m * write_5m_rate + writes_1h * write_1h_rate
        + output * output_rate) / 1,000,000
       + applicable cache storage and provider tool fees
```

For OpenAI, `input_tokens` already includes reads and writes. Native Anthropic usage separates ordinary input, cache reads and cache creation; however **Converse's Conclave adapter already combines these into exported `input_tokens`** while retaining the original cache fields. Do not add them again when reading those exports. Preserve cache-write TTL detail where available. Ordinary chat retains native provider usage and therefore needs its own normalization path.

Output reserves are limits, not consumption. Reasoning/thinking tokens must be counted according to provider usage, without adding a subset again to an output total. Missing response usage, write detail, model identity, tier or model rates must produce a visibly partial price or a documented scenario. A local tokenizer count and a provider preflight count are measurements of input scope, not an invoice.

Sum every request: answer, tool continuation, selection, compaction, title, and billed partial/failed responses. Show priced coverage alongside any known subtotal. Use provider/model identity and effective rate dates, rather than assuming the current picker or current prices describe every historical call. Compare against an explicitly labelled cached-append scenario and then calibrate with an actual paired run; this file itself establishes no Conclave savings.
