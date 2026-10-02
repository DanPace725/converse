import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const known = (value) => Number.isSafeInteger(value) && value >= 0;
const sum = (rows, key) => rows.reduce((n, row) => n + (row[key] || 0), 0);
const number = (value) =>
  value == null ? "unknown" : value.toLocaleString("en-US");
const safe = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");

export function analyzeConversation(record) {
  const layer = record.context_layer || record,
    events = layer.events;
  const requests = events.filter((e) => e.kind === "inference_request");
  const responses = new Map(
    events
      .filter((e) => e.kind === "inference_response")
      .map((e) => [e.metadata.request_id, e]),
  );
  const users = events.filter(
    (e) => e.kind === "user" && !e.metadata.purpose?.startsWith("manual-"),
  );
  const completed = events.filter((e) => e.kind === "turn_complete");
  const failures = events.filter((e) => e.kind === "turn_failure");
  const errors = events.flatMap((e) => {
    if (e.kind !== "tool_result") return [];
    let output;
    try {
      output = JSON.parse(e.content);
    } catch {
      return [];
    }
    return typeof output?.error === "string" && output.error
      ? [{ seq: e.seq, tool: e.metadata.tool, error: output.error }]
      : [];
  });
  const purpose = {};
  const emptyGroup = () => ({
    calls: 0,
    responses: 0,
    input: 0,
    output: 0,
    cached: 0,
    missing_usage: 0,
    peak_input: null,
    peak_guard: null,
  });
  for (const request of requests) {
    const group = (purpose[request.content] ||= emptyGroup());
    group.calls++;
    const response = responses.get(request.id),
      usage = response?.metadata.usage;
    if (response) group.responses++;
    if (
      !response ||
      response.metadata.status === "partial" ||
      !known(usage?.input_tokens) ||
      !known(usage?.output_tokens)
    )
      group.missing_usage++;
    if (known(usage?.input_tokens)) {
      group.input += usage.input_tokens;
      group.peak_input = Math.max(group.peak_input || 0, usage.input_tokens);
    }
    if (known(usage?.output_tokens)) group.output += usage.output_tokens;
    // Exported provider input is already normalized; cache is a subset, never added again.
    group.cached +=
      usage?.input_tokens_details?.cached_tokens ??
      usage?.cache_read_input_tokens ??
      0;
    const m = request.metadata;
    if (
      known(m.estimated_input_units) &&
      known(m.output_reserve) &&
      known(m.input_budget) &&
      m.input_budget > 0
    ) {
      const ratio =
        (m.estimated_input_units + m.output_reserve) / m.input_budget;
      if (!group.peak_guard || ratio > group.peak_guard.ratio)
        group.peak_guard = {
          seq: request.seq,
          request_id: request.id,
          ratio,
          bytes: m.estimated_input_units,
          reserve: m.output_reserve,
          budget: m.input_budget,
        };
    }
  }
  // Legacy title generation is logged separately from inference_request.
  // Count it explicitly rather than silently adding its usage to answer cost.
  for (const event of events.filter(
    (e) =>
      e.kind === "conversation_title" &&
      e.metadata.generated &&
      !e.metadata.request_id,
  )) {
    const group = (purpose["title (separately logged)"] ||= emptyGroup()),
      usage = event.metadata.usage;
    group.calls++;
    group.responses++;
    if (!known(usage?.input_tokens) || !known(usage?.output_tokens))
      group.missing_usage++;
    if (known(usage?.input_tokens)) {
      group.input += usage.input_tokens;
      group.peak_input = Math.max(group.peak_input || 0, usage.input_tokens);
    }
    if (known(usage?.output_tokens)) group.output += usage.output_tokens;
    group.cached +=
      usage?.input_tokens_details?.cached_tokens ??
      usage?.cache_read_input_tokens ??
      0;
  }
  const completedWithErrors = completed.filter((e) => {
    const user =
      users.find((u) => u.id === e.metadata.user_event_id) ||
      users.findLast((u) => u.seq < e.seq);
    return (
      user && errors.some((error) => error.seq > user.seq && error.seq < e.seq)
    );
  }).length;
  const checkpoints = new Map();
  for (const e of events)
    if (e.kind === "agent_checkpoint")
      checkpoints.set(e.metadata.state.run_id, e.metadata.state.status);
  const groups = Object.values(purpose);
  return {
    id: record.conversation_id || layer.conversation_id,
    title:
      record.title ||
      events.findLast((e) => e.kind === "conversation_title")?.content ||
      events.find((e) => e.kind === "conversation")?.content ||
      "Untitled",
    exported_at: record.exported_at || layer.exported_at || "",
    events: events.length,
    turns: users.length,
    completed: completed.length,
    failed: failures.length,
    completed_with_tool_errors: completedWithErrors,
    calls: requests.length,
    title_calls: purpose["title (separately logged)"]?.calls || 0,
    input: sum(groups, "input"),
    output: sum(groups, "output"),
    cached: sum(groups, "cached"),
    missing_usage: sum(groups, "missing_usage"),
    management_input: sum(
      Object.entries(purpose)
        .filter(([name]) =>
          ["compaction", "attention-selection"].includes(name),
        )
        .map(([, group]) => group),
      "input",
    ),
    purpose,
    tool_errors: errors,
    failures: failures.map((e) => ({
      seq: e.seq,
      error: e.metadata.error || e.content,
    })),
    agent_stops: Object.fromEntries(
      [...checkpoints.values()].map((status) => [
        status,
        [...checkpoints.values()].filter((s) => s === status).length,
      ]),
    ),
    final_revision: layer.context?.revision ?? null,
    final_segments: layer.context?.segments?.length ?? null,
  };
}

export function latestExports(records) {
  const latest = new Map();
  for (const item of records) {
    const record = item.record || item,
      layer = record.context_layer || record;
    if (!Array.isArray(layer.events) || !record.conversation_id) continue;
    const previous = latest.get(record.conversation_id);
    const timestamp = record.exported_at || layer.exported_at || "";
    const older = previous?.record || previous,
      oldLayer = older?.context_layer || older;
    if (
      !previous ||
      timestamp > (older.exported_at || oldLayer.exported_at || "") ||
      (timestamp === (older.exported_at || oldLayer.exported_at || "") &&
        layer.events.length > oldLayer.events.length)
    )
      latest.set(record.conversation_id, item);
  }
  return [...latest.values()];
}

export function renderConversation(report, source) {
  const rows = Object.entries(report.purpose).map(
    ([name, p]) =>
      `| ${safe(name)} | ${p.calls} | ${number(p.input)} / ${number(p.output)} | ${number(p.cached)} | ${p.missing_usage} | ${number(p.peak_input)} | ${p.peak_guard ? (p.peak_guard.ratio * 100).toFixed(1) + "%" : "unknown"} |`,
  );
  const guardDetails = Object.entries(report.purpose)
    .filter(([, p]) => p.peak_guard)
    .map(([name, p]) => {
      const g = p.peak_guard;
      return `- ${name}: seq ${g.seq}, (${number(g.bytes)} serialized bytes + ${number(g.reserve)} output-token reserve) / ${number(g.budget)} = ${(g.ratio * 100).toFixed(1)}%. This is the application's mixed-unit guard.`;
    });
  return `# ${report.title}\n\nSource: [canonical export](${source.replaceAll("\\", "/")}). Exported ${report.exported_at}.\n\n${report.turns} user turns; ${report.completed} completions; ${report.failed} turn-failure records; ${report.completed_with_tool_errors} completed turns contain tool errors. ${report.calls} inference requests; ${report.tool_errors.length} top-level tool errors. Final revision ${report.final_revision ?? "unknown"}, ${report.final_segments ?? "unknown"} active segments.\n\n| Request purpose | Calls | Known input / output tokens | Cached input subset | Missing/partial usage calls | Peak reported input | Peak guard use |\n|---|---:|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n\n${guardDetails.join("\n")}\n\nAgent terminal checkpoints: ${
    Object.entries(report.agent_stops)
      .map(([status, n]) => `${status}: ${n}`)
      .join("; ") || "none"
  }. Completed means the model finished, not that every tool operation succeeded.\n\n## Recorded tool errors\n\n${report.tool_errors.map((e) => `- Seq ${e.seq}, ${e.tool || "unknown tool"}: ${safe(e.error)}`).join("\n") || "None."}\n\n## Recorded turn failures\n\n${report.failures.map((e) => `- Seq ${e.seq}: ${safe(e.error)}`).join("\n") || "None."}\n\nKnown token totals omit unavailable counters; missing/partial calls are identified above. Source IDs, input payloads and snapshots remain in the canonical export. No claim of semantic correctness or counterfactual savings is made.\n`;
}

export function generateReports(directory) {
  directory = resolve(directory);
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".json")) {
        const record = JSON.parse(readFileSync(path, "utf8"));
        files.push({ record, path });
      }
    }
  };
  visit(directory);
  const selected = latestExports(files),
    reports = selected.map(({ record }) => analyzeConversation(record));
  mkdirSync(join(directory, "Report"), { recursive: true });
  for (let n = 0; n < reports.length; n++)
    writeFileSync(
      join(directory, "Report", reports[n].id + ".md"),
      renderConversation(
        reports[n],
        relative(join(directory, "Report"), selected[n].path),
      ),
    );
  const values = (key) => sum(reports, key);
  const rows = reports.map(
    (r) =>
      `| [${safe(r.title)}](Report/${r.id}.md) | ${r.turns} | ${r.completed} | ${r.failed} | ${r.completed_with_tool_errors} | ${r.calls} | ${number(r.input)} | ${r.tool_errors.length} | ${r.missing_usage} |`,
  );
  const text = `# Conclave master report\n\nRegenerated from ${selected.length} distinct conversations. Where multiple exports exist, the latest export timestamp wins (event count breaks ties). Latest included export: ${reports
    .map((r) => r.exported_at)
    .sort()
    .at(
      -1,
    )}.\n\n${values("turns")} user turns; ${values("completed")} completions; ${values("failed")} turn-failure records; ${values("completed_with_tool_errors")} completed turns contain tool errors. ${values("calls")} inference requests plus ${values("title_calls")} separately logged title generations; ${reports.reduce((n, r) => n + r.tool_errors.length, 0)} top-level tool errors.\n\nKnown input / output: **${number(values("input"))} / ${number(values("output"))} tokens**. Cached input subset: ${number(values("cached"))}. Management input (selection and compaction): ${number(values("management_input"))}. Missing or partial usage: ${values("missing_usage")} calls in ${reports.filter((r) => r.missing_usage).length} conversations. Unknown usage is not zero; totals are known subtotals.\n\n| Conversation | User turns | Completed | Failure records | Completed with tool errors | Calls | Known input | Tool errors | Missing/partial usage |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n\n## Reading these measurements\n\n- Each conversation report separates answer, selector, compaction and title requests. Peak guard use is calculated against that request's own budget. A selector's 8,000-unit guard is not the answer model's context capacity.\n- Serialized bytes plus output-token reserve form the historical application's mixed-unit guard; its percentage is not context-window occupancy. Reported provider tokens, stored local tokenizer estimates and preflight counts have different scopes. Cached input remains part of input and is not added twice.\n- Tool failures are parsed only from top-level tool-result errors. Nested audit text containing historical errors is not a new failure. A completed turn can contain unsuccessful optimizations. Agent stop status and turn failures remain separately listed.\n- These exports record historical app versions. Old Claude continuation/effort failures do not prove a current regression; use current regression tests and a deployed rerun to establish that.\n- Earlier full-history savings estimates are not carried forward: they mixed approximations and do not establish fidelity or net benefit. Compare complete request costs and preservation on controlled workloads before claiming savings.\n\nReproduce with \`node scripts/report-conversations.js docs/conversations\`. This generator reads canonical JSON and writes only master/per-conversation Markdown reports.\n`;
  writeFileSync(join(directory, "master_report.md"), text);
  return reports;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const reports = generateReports(process.argv[2] || "docs/conversations");
  console.log(
    `Wrote master report and ${reports.length} conversation reports.`,
  );
}
