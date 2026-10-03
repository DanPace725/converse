# Conclave master report

Regenerated from 11 distinct conversations. Where multiple exports exist, the latest export timestamp wins (event count breaks ties). Latest included export: 2026-10-02T17:31:13.585Z.

103 user turns; 90 completions; 8 turn-failure records; 9 completed turns contain tool errors. 341 inference requests plus 7 separately logged title generations; 22 top-level tool errors.

Known input / output: **5,024,187 / 188,098 tokens**. Cached input subset: 974,881. Management input (selection and compaction): 82,695. Missing or partial usage: 2 calls in 2 conversations. Unknown usage is not zero; totals are known subtotals.

| Conversation | User turns | Completed | Failure records | Completed with tool errors | Calls | Known input | Tool errors | Missing/partial usage |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [Testing Assistant Capabilities and Functions](Report/conv_b65bc693-2839-4ff5-a3ce-31d9ba602b42.md) | 10 | 10 | 0 | 2 | 82 | 804,602 | 4 | 0 |
| [Document Reading Request](Report/conv_1acde777-ef0d-471b-8e95-bdad014149db.md) | 14 | 14 | 0 | 5 | 68 | 1,290,472 | 9 | 0 |
| [Testing the App and Capabilities](Report/conv_29711123-738b-4701-b7f2-716a1d2baea4.md) | 5 | 5 | 0 | 0 | 27 | 502,289 | 0 | 0 |
| [Designing Associative Memory for AI Agents](Report/conv_3cb9a9e8-7d42-4f37-8d30-632c321fefe4.md) | 4 | 2 | 1 | 0 | 5 | 21,878 | 0 | 1 |
| [Brain's Efficient Information Storage Capacity](Report/conv_550f6b41-7b14-4322-aeaa-1624ccf60db1.md) | 24 | 19 | 5 | 0 | 39 | 1,336,281 | 4 | 0 |
| [Local integration smoke test: our sample project is a garden club newsletter. Reply with one short s](Report/conv_5a7a1139-8413-4ebb-8846-13c1afb07ef7.md) | 1 | 1 | 0 | 0 | 1 | 1,174 | 0 | 0 |
| [This is a short deployment check. Reply with exactly: Context saved.](Report/conv_8aa1a561-63d8-4dba-b345-8c16723b0b7c.md) | 1 | 1 | 0 | 0 | 1 | 1,156 | 0 | 0 |
| [What's the tldr on Btc from where it started to now?](Report/conv_944a48ee-220c-4917-a94a-b8b834c74f1d.md) | 11 | 11 | 0 | 0 | 24 | 73,816 | 0 | 0 |
| [You are responsible for designing a realistic launch plan for a small community makerspace serving t](Report/conv_af2bc22d-b525-4727-ae99-8137d8e0b6fa.md) | 8 | 8 | 0 | 0 | 28 | 205,484 | 0 | 0 |
| [How the Brain Stores Memories](Report/conv_b53ebbe1-a7b3-403a-8dc3-f2b40cd67582.md) | 14 | 12 | 1 | 1 | 49 | 714,542 | 3 | 1 |
| [Algorithms for Chess’s Combinatorial Complexity](Report/conv_e0427e3c-bfc8-4bba-9d75-0b8000dd4a56.md) | 11 | 7 | 1 | 1 | 17 | 72,493 | 2 | 0 |

## Reading these measurements

- Each conversation report separates answer, selector, compaction and title requests. Peak guard use is calculated against that request's own budget. A selector's 8,000-unit guard is not the answer model's context capacity.
- Serialized bytes plus output-token reserve form the historical application's mixed-unit guard; its percentage is not context-window occupancy. Reported provider tokens, stored local tokenizer estimates and preflight counts have different scopes. Cached input remains part of input and is not added twice.
- Tool failures are parsed only from top-level tool-result errors. Nested audit text containing historical errors is not a new failure. A completed turn can contain unsuccessful optimizations. Agent stop status and turn failures remain separately listed.
- These exports record historical app versions. Old Claude continuation/effort failures do not prove a current regression; use current regression tests and a deployed rerun to establish that.
- Earlier full-history savings estimates are not carried forward: they mixed approximations and do not establish fidelity or net benefit. Compare complete request costs and preservation on controlled workloads before claiming savings.

Reproduce with `node scripts/report-conversations.js docs/conversations`. This generator reads canonical JSON and writes only master/per-conversation Markdown reports.
