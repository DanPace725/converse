# Conversation reporting

Run from the Converse repository. Canonical exports and machine-readable evidence stay in their existing locations under `docs/conversations/` and `docs/comparisons/`.

```powershell
node scripts/report-conversations.js
node scripts/report-costs.js
python scripts/conclave_report.py
```

The JavaScript conversation report deduplicates latest exports. Cost reports use `scripts/lib/costs.js` and the dated `docs/model-costs-2026-10-02.json` snapshot. The Python entry point retains context-placement analysis and delegates USD calculations to the same analyzer; it can move recognized Context downloads into Processed. JavaScript reporting reads exports without moving them.

Reports include purpose/call totals, cache reads/writes, partial usage, price coverage, and snapshot trends. USD uses the named public-rate date. Successive snapshots describe the same conversation and are not added as separate spend.

```powershell
node scripts/compare-conversations.js
node scripts/compare-conversations.js --live
```

The first command prepares source-linked templates without inference. `--live` spends provider tokens under the script's local expenditure guard. Derived outputs go into timestamped `docs/comparisons/` directories. Preserve the prompts, settings, ledger, failures, and artifacts with the result.

After analysis, put the compact finding in PROJECT_CONTEXT.md and move generated Markdown reports into a dated `docs/archive/` directory. Keep original JSON/CSV evidence and source exports available to the scripts. The [archive index](archive/README.md) maps the existing historical Markdown.
