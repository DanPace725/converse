"""Conclave conversation reports.

Run with no arguments:

    python conclave_report.py

It reads every Converse export (*.json) in the conversations folder and in its
Processed/ subfolder, writes one Markdown report per conversation to
conclave-reports/, writes conclave_master_report.md alongside them, then moves
newly added exports into Processed/. The lead measure is how much smaller the
working context is than the full append-only conversation; cost follows. Everything is recalculated from the exports on every run, so
improvements to this script apply to old conversations too.

Use --dir to point at a different conversations folder. For read-only automation,
use --files, --output-dir, --json and --skip-costs; --files preserves originals.
"""
import argparse
import json
import shutil
import sys
import subprocess
import re
import os
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "docs" / "conversations"
# Distinct from converse/scripts/report-conversations.js outputs (master_report.md, Report/) so neither overwrites the other.
MASTER_NAME = "conclave_master_report.md"
REPORT_DIR_NAME = "conclave-reports"

# Append mode sends every one of these events in full on each call (see harness.js input()).
APPEND_KINDS = {"user", "assistant", "document", "reasoning"}
# Rough per-event bytes for the "[Source ...; source_attribution=...]" header and message wrapper.
SOURCE_OVERHEAD_BYTES = 250
COMPACTION_TRIGGER = 0.75
CONVERSATION_KINDS = {"user", "assistant"}
MANAGEMENT_PURPOSES = {"attention-selection", "compaction", "retrieval-reranking", "ingress-classification", "memory-extraction"}


def parsed(value, default=None):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return default
    return value if value is not None else default


def automated_audit(layer):
    """Evidence-only diagnostics. No quality or savings inferred from priorities."""
    events = layer["events"]
    requests = {e["id"]: e for e in events if e["kind"] == "inference_request"}
    responses = {e["metadata"].get("request_id"): e for e in events if e["kind"] == "inference_response"}
    jev = defaultdict(lambda: {"attempts": 0, "responses": 0, "input": 0, "output": 0, "latency_ms": 0})
    ratios, cache_reads, cache_writes, cache_known = [], 0, 0, 0
    for rid, request in requests.items():
        md = request.get("metadata") or {}
        response = responses.get(rid)
        rm = (response or {}).get("metadata") or {}
        usage = rm.get("usage") or {}
        if md.get("provider") == "typesafe" or str((md.get("payload") or {}).get("model", "")).startswith("jev"):
            bucket = jev[request["content"]]
            bucket["attempts"] += 1
            bucket["responses"] += int(response is not None)
            bucket["input"] += usage.get("input_tokens") or 0
            bucket["output"] += usage.get("output_tokens") or 0
            bucket["latency_ms"] += rm.get("elapsed_ms") or rm.get("latency_ms") or 0
        if request["content"] == "answer" and usage:
            local = (md.get("input_size") or {}).get("tokenizer_tokens")
            if local and usage.get("input_tokens") is not None:
                ratios.append(usage["input_tokens"] / local)
            read = usage.get("cache_read_input_tokens", (usage.get("input_tokens_details") or {}).get("cached_tokens"))
            write = usage.get("cache_creation_input_tokens", (usage.get("input_tokens_details") or {}).get("cache_write_tokens"))
            cache_reads += read or 0
            cache_writes += write or 0
            cache_known += int(read is not None)
    captures = [e for e in events if e["kind"] == "memory_capture"]
    activations = [e for e in events if e["kind"] == "memory_activation"]
    economics = [e for e in events if e["kind"] == "context_economics"]
    retrieval = [e for e in events if e["kind"] == "retrieval_decision"]
    assessments = [e for e in retrieval if e["metadata"].get("assessment")]
    decisions = [d for e in assessments for d in e["metadata"]["assessment"].get("decisions", [])]
    repeated = Counter()
    fresh_omissions, fresh_pages = [], []
    for pos, event in enumerate(events):
        if event["kind"] != "tool_result" or event["metadata"].get("tool") != "retrieve_event":
            continue
        result = parsed(event.get("content"), {})
        if not isinstance(result, dict) or not isinstance(result.get("content"), str) or len(result["content"]) <= 2000:
            continue
        following = next((e for e in events[pos + 1:] if e["kind"] == "inference_request" and e["content"] == "answer"), None)
        if following is None:
            continue
        inputs = (following["metadata"].get("payload") or {}).get("input", [])
        call_id = event["metadata"].get("call_id")
        supplied = [parsed(i.get("output"), {}) for i in inputs if i.get("type") == "function_call_output" and i.get("call_id") == call_id]
        for item in inputs:
            marker = "\nCONCLAVE_CONTINUATION_OBSERVATIONS\n"
            text = item.get("content", "")
            if item.get("role") == "user" and isinstance(text, str) and marker in text:
                handoff = parsed(text.partition(marker)[2], {})
                if isinstance(handoff, dict):
                    supplied.extend(r.get("result", {}) for r in handoff.get("fresh_tool_results", []) if isinstance(r, dict) and r.get("call_id") == call_id)
        # Exact prefix delivery, including byte-guard pages, is an observation.
        # A bare pointer, an empty output or the old 800-character receipt summary is not.
        pages = [p for p in supplied if isinstance(p, dict) and isinstance(p.get("content"), str)
                 and p["content"] and result["content"].startswith(p["content"])
                 and p.get("offset", 0) == result.get("offset", 0)]
        if pages:
            delivered = max(pages, key=lambda p: len(p["content"]))
            if len(delivered["content"]) < len(result["content"]):
                fresh_pages.append({"receipt_seq": event["seq"], "next_request_seq": following["seq"],
                    "supplied_characters": len(delivered["content"]), "receipt_characters": len(result["content"]),
                    "offset": delivered.get("offset", 0), "next_offset": delivered.get("next_offset")})
        else:
            fresh_omissions.append({"receipt_seq": event["seq"], "next_request_seq": following["seq"],
                "source_ref": result.get("sourceRef"), "characters": len(result["content"]),
                "handoff": any("preceding tool exchange is archived" in str(i.get("content", "")) for i in inputs)})
    for e in events:
        if e["kind"] == "tool_call" and e["content"] in {"retrieve_event", "search_history", "search_source", "retrieve_range"}:
            args = parsed((e.get("metadata") or {}).get("arguments"), {})
            repeated[(e["content"], json.dumps(args, sort_keys=True, ensure_ascii=False))] += 1
    memory = layer.get("memory") or {}
    results = {
        "policy": "conversation-audit-v2", "event_kinds": dict(Counter(e["kind"] for e in events)),
        "memory": {"automatic_entries": len(memory.get("entries", [])), "automatic_records": len(memory.get("records", [])),
            "named_entries": len((layer.get("state") or {}).get("entries", [])),
            "capture_status": dict(Counter(e["metadata"].get("status", "unknown") for e in captures)),
            "capture_elapsed_ms": sum(e["metadata"].get("elapsed_ms") or 0 for e in captures),
            "activation_calls": len(activations), "empty_activations": sum(not e["metadata"].get("memory_ids") for e in activations),
            "capture_issues": memory.get("capture_issue_count", 0),
            "extraction_attempts": sum(e["content"] == "memory-extraction" for e in requests.values())},
        "jev": dict(jev),
        "retrieval": {"evaluations": len(retrieval), "assessed": len(assessments),
            "fallbacks": sum(bool(e["metadata"]["assessment"].get("fallback")) for e in assessments),
            "changed_order": sum(e["metadata"].get("baseline_event_ids") != e["metadata"].get("selected_event_ids") for e in retrieval),
            "cache_hits": sum(bool(e["metadata"].get("cache_hit")) for e in retrieval),
            "uncertain_decisions": sum(bool(d.get("uncertain")) for d in decisions), "total_decisions": len(decisions),
            "selection_sources": dict(Counter(e["metadata"].get("selection_source", "unknown") for e in retrieval)),
            "fresh_large_outputs_missing_from_next_request": fresh_omissions,
            "fresh_large_outputs_paged": fresh_pages,
            "skip_reasons": dict(Counter(e["metadata"].get("reason", "unknown") for e in retrieval if e["metadata"].get("outcome") == "skipped")),
            "repeated_calls": [{"tool": t, "arguments": parsed(a), "count": n} for (t, a), n in repeated.most_common() if n > 1]},
        "embeddings": {"failures": sum(e["kind"] == "embedding_failure" for e in events),
            "reported": (layer.get("metrics") or {}).get("embeddings", {})},
        "economics": {"evaluations": len(economics),
            "status": dict(Counter(e["metadata"].get("evaluation_status", "unknown") for e in economics)),
            "failed_stages": dict(Counter((e["metadata"].get("profile") or {}).get("failed_stage") or "unknown" for e in economics if e["metadata"].get("evaluation_status") == "unavailable")),
            "elapsed_ms": sum(e["metadata"].get("elapsed_ms") or 0 for e in economics),
            "review_results": dict(Counter(e["metadata"].get("result", "unknown") for e in events if e["kind"] == "context_review")),
            "reconciliations": sum(e["kind"] == "context_cost_reconciliation" for e in events),
            "comparable_reconciliations": sum(bool(e["metadata"].get("comparable")) for e in events if e["kind"] == "context_cost_reconciliation")},
        "request_counts": {"reported_to_local_ratio_min": min(ratios, default=None), "reported_to_local_ratio_max": max(ratios, default=None),
            "cache_read_tokens": cache_reads, "cache_write_tokens": cache_writes, "cache_read_known_calls": cache_known},
        "record_sizes": {"compact_utf8_bytes_by_section": {k: jbytes(v) for k, v in layer.items()},
            "note": "Serialized audit size, not transmitted model input or token savings."},
    }
    findings = []
    if captures and not memory.get("entries"):
        findings.append({"code": "empty-automatic-memory", "text": "Capture completed without automatic entries; named state is a separate store. Empty capture is not proof of failed extraction."})
    if results["embeddings"]["failures"]:
        findings.append({"code": "embedding-fallback", "text": f"{results['embeddings']['failures']} embedding failures; semantic retrieval is not demonstrated."})
    if assessments and not results["retrieval"]["changed_order"]:
        findings.append({"code": "jev-no-observed-order-change", "text": "Paid reranking produced no logged change from the deterministic shortlist; quality benefit is unmeasured."})
    if results["economics"]["status"].get("unavailable"):
        findings.append({"code": "shadow-unavailable", "text": "Some shadow evaluations exceeded allowances or were unavailable; fail-open answers do not demonstrate working cost optimization."})
    if any(n >= 3 for n in repeated.values()):
        findings.append({"code": "repeated-retrieval", "text": "Identical retrieval arguments occurred at least three times. Inspect per-turn requests to distinguish necessary revisits from loops."})
    if fresh_omissions:
        findings.append({"code": "fresh-retrieval-handoff", "text": f"{len(fresh_omissions)} newly retrieved large outputs lack their direct tool output in the next answer request. Handoff excerpts are not equivalent to complete source delivery."})
    results["findings"] = findings
    return results


def jbytes(value):
    """UTF-8 bytes of a value once JSON-serialized, matching how request units are counted."""
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def usage_numbers(usage, native_anthropic=False):
    """Normalize OpenAI / Anthropic / Jev usage into (input, output, cached, reasoning)."""
    if not usage:
        return None
    cache_read = usage.get("cache_read_input_tokens") or 0
    # These are canonical Conclave inference exports: the provider adapter has
    # already included Claude cache reads/writes in input_tokens.
    inp = usage.get("input_tokens") or 0
    if native_anthropic:
        inp += cache_read + (usage.get("cache_creation_input_tokens") or 0)
    cached = (usage.get("input_tokens_details") or {}).get("cached_tokens") or cache_read
    details = usage.get("output_tokens_details") or {}
    reasoning = details.get("reasoning_tokens") or details.get("thinking_tokens") or 0
    return inp, usage.get("output_tokens") or 0, cached, reasoning


HISTORY_LABELS = {"user": "User messages", "assistant": "Assistant replies",
                  "document": "Documents and workspace files", "reasoning": "Reasoning summaries"}
PLACEMENT_LABELS = {"verbatim": "Still in working context word for word",
                    "condensed": "Represented by a summary, state entry or excerpt",
                    "pointer": "Represented only by a retrieval pointer",
                    "absent": "Not in working context (kept in history, retrievable)"}


def history_vs_context(events, segments):
    """Compare the append-only conversation text with a working-context projection, in characters."""
    sources = {e["id"]: e for e in events if e["kind"] in APPEND_KINDS}
    history = Counter()
    for e in sources.values():
        history[e["kind"]] += len(e.get("content") or "")

    rank = {"verbatim": 3, "condensed": 2, "pointer": 1}
    placement, context = {}, Counter()
    for seg in segments:
        content = seg.get("content") or ""
        ids = seg.get("source_event_ids") or []
        if seg.get("type") == "reference":
            kind, bucket = "pointer", "Retrieval pointers"
        elif len(ids) == 1 and ids[0] in sources and content.strip() == (sources[ids[0]].get("content") or "").strip():
            kind, bucket = "verbatim", "Verbatim messages and files"
        else:
            kind = "condensed"
            bucket = "Named state entries" if seg.get("state_key") else "Summaries, edits and excerpts"
        context[bucket] += len(content)
        for source_id in ids:
            if rank[kind] > rank.get(placement.get(source_id), 0):
                placement[source_id] = kind

    where = {k: Counter() for k in PLACEMENT_LABELS}
    for source_id, e in sources.items():
        bucket = where[placement.get(source_id, "absent")]
        bucket["items"] += 1
        bucket["chars"] += len(e.get("content") or "")
    return history, context, where


def approx_tokens(chars):
    return round(chars / 4)


def pct(part, whole):
    return part / whole * 100 if whole else 0.0


def fmt_pct(value, signed=False):
    return "n/a" if value is None else (f"{value:+.1f}%" if signed else f"{value:.1f}%")


def short(text, limit=110):
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def md_cell(text):
    return str(text).replace("|", "\\|")


# --------------------------------------------------------------------------- analysis

def analyze(data):
    layer = data["context_layer"]
    events = sorted(layer["events"], key=lambda e: e["seq"])
    metrics = layer.get("metrics") or {}
    snapshot_chars = {s["revision"]: sum(len(seg.get("content") or "") for seg in s.get("segments", []))
                      for s in layer.get("snapshots", [])}
    requests = {e["id"]: e for e in events if e["kind"] == "inference_request"}

    first_user = next((e["content"] for e in events if e["kind"] == "user"), "")
    a = {
        "id": data.get("conversation_id") or layer.get("conversation_id"),
        "title": data.get("title") or short(first_user, 60) or "Untitled",
        "created": (data.get("created_at") or "")[:16].replace("T", " "),
        "exported": (data.get("exported_at") or "")[:16].replace("T", " "),
        "mode": metrics.get("mode", "unknown"),
        "usage_complete": metrics.get("usage_complete", True),
    }

    turns, turn_by_user = [], {}
    calls = []                      # every request with its usage
    call_by_id = {}
    by_purpose = defaultdict(lambda: Counter())
    by_model = defaultdict(lambda: Counter())
    selection_models = defaultdict(lambda: Counter())
    settings = {}
    hist_bytes = hist_chars = conv_chars = 0
    current_revision = 0
    tools = Counter()
    transforms = Counter()
    state_errors = Counter()
    state_calls = manual_state = 0
    compaction = Counter()
    pending_compaction = False
    skip_reasons = Counter()
    failures = []
    jev_turns = 0
    proposals = {"jev": Counter(), "other": Counter()}
    gated = 0
    decision_rejections = []
    peak_pressure = 0.0
    budget = None
    recoveries = restarts = tool_projections = 0
    title_calls = 0

    for e in events:
        kind, md = e["kind"], e.get("metadata") or {}
        content = e.get("content") or ""

        if kind in APPEND_KINDS:
            hist_bytes += jbytes(content) + SOURCE_OVERHEAD_BYTES
            hist_chars += len(content)
        if kind in CONVERSATION_KINDS:
            conv_chars += len(content)

        if kind == "user":
            if md.get("purpose") == "manual-state":
                manual_state += 1
                continue
            ws = md.get("web_settings") or {}
            if ws:
                settings = ws
            if ws.get("jev"):
                jev_turns += 1
            turn = {"n": len(turns) + 1, "text": content, "calls": 0, "peak_in": 0, "full_est": 0,
                    "outcome": "no answer", "ctx_chars": None, "hist_chars": None}
            turns.append(turn)
            turn_by_user[e["id"]] = turn

        elif kind == "context_transform":
            current_revision = md.get("revision", current_revision)
            if content not in ("add user", "add assistant"):
                transforms[content] += 1
            if pending_compaction:
                compaction["committed"] += 1
                pending_compaction = False

        elif kind == "inference_request":
            units = md.get("estimated_input_units") or 0
            if content == "answer" and md.get("input_budget"):
                pressure = (units + (md.get("output_reserve") or 0)) / md["input_budget"]
                if pressure > peak_pressure:
                    peak_pressure, budget = pressure, md["input_budget"]
            # Memory can precede context; settled prefix and recent tail are separate messages.
            projections = [i.get("content") for i in (md.get("payload") or {}).get("input", [])
                           if isinstance(i, dict) and isinstance(i.get("content"), str)
                           and i["content"].startswith(("Working context:", "Recent context tail:"))]
            proj_bytes = sum(jbytes(p) for p in projections) if projections else None
            calls.append({"id": e["id"], "purpose": content, "provider": md.get("provider"), "units": units,
                          "proj_bytes": proj_bytes, "hist_bytes": hist_bytes,
                          "turn": turn_by_user.get(md.get("user_event_id")) or (turns[-1] if turns else None), "usage": None, "model": None})
            call_by_id[e["id"]] = calls[-1]

        elif kind == "inference_response":
            req = call_by_id.get(md.get("request_id"))
            nums = usage_numbers(md.get("usage"))
            if req is None or nums is None:
                continue
            req["usage"], req["model"] = nums, md.get("model")
            inp, out, cached, reasoning = nums
            buckets = [by_purpose[content], by_model[(req["provider"], md.get("model"))]]
            if content == "attention-selection":
                buckets.append(selection_models[(req["provider"], md.get("model"))])
            for bucket in buckets:
                bucket.update(calls=1, input=inp, output=out, cached=cached, reasoning=reasoning)
            turn = req["turn"]
            if turn is not None:
                turn["calls"] += 1
                if content == "answer":
                    turn["peak_in"] = max(turn["peak_in"], inp)
            if content == "compaction":
                pending_compaction = True

        elif kind == "conversation_title":
            title_calls += 1
            nums = usage_numbers(md.get("usage"), native_anthropic="cache_read_input_tokens" in (md.get("usage") or {}))
            if nums:
                by_purpose["title"].update(calls=1, input=nums[0], output=nums[1], cached=nums[2], reasoning=nums[3])

        elif kind == "context_skip":
            skip_reasons[short(content, 70)] += 1
            if pending_compaction:
                compaction["paid_then_discarded"] += 1
                pending_compaction = False
            else:
                compaction["skipped_before_paying"] += 1

        elif kind == "context_rejection":
            if pending_compaction:
                compaction["paid_then_rejected"] += 1
                pending_compaction = False
            failures.append(("context_rejection", content))

        elif kind in ("turn_complete", "turn_failure"):
            turn = turn_by_user.get(md.get("user_event_id")) or (turns[-1] if turns else None)
            if turn is not None:
                turn["outcome"] = "ok" if kind == "turn_complete" else "FAILED"
                turn["ctx_chars"] = snapshot_chars.get(current_revision)
                turn["hist_chars"] = hist_chars
            if kind == "turn_failure":
                failures.append(("turn_failure", content))

        elif kind == "inference_failure":
            req = requests.get(md.get("request_id"))
            failures.append((f"inference_failure ({req['content'] if req else '?'})", content))
            if req is not None and req["content"] == "compaction":
                compaction["call_failed"] += 1

        elif kind == "agent_checkpoint" and (md.get("state") or {}).get("status") == "stopped":
            turn = turn_by_user.get(md["state"].get("user_event_id"))
            if turn is not None:
                turn["outcome"] = "stopped"
                turn["ctx_chars"] = snapshot_chars.get(current_revision)
                turn["hist_chars"] = hist_chars

        elif kind == "tool_call":
            tools[content] += 1
            if content == "update_state":
                state_calls += 1

        elif kind == "tool_result" and md.get("tool") == "update_state":
            try:
                err = parsed(content, {}).get("error")
            except (ValueError, AttributeError):
                err = None
            if err:
                state_errors[short(err.split(":")[0], 60)] += 1

        elif kind == "decision_proposal":
            key = "jev" if str(md.get("decision_model") or "").startswith("jev") else "other"
            for entry in md.get("entries", []):
                proposals[key][entry.get("action")] += 1
                if key == "jev" and entry.get("action") == "escalate" and "Uncertain" in (entry.get("reason") or ""):
                    gated += 1

        elif kind == "decision_rejection":
            decision_rejections.append(content)
        elif kind == "budget_recovery":
            recoveries += 1
        elif kind == "continuation_restart":
            restarts += 1
        elif kind == "tool_projection":
            tool_projections += 1

    # ---- token totals
    totals = Counter()
    for bucket in by_purpose.values():
        totals.update(bucket)
    mgmt_in = sum(b["input"] for p, b in by_purpose.items() if p in MANAGEMENT_PURPOSES)
    mgmt_out = sum(b["output"] for p, b in by_purpose.items() if p in MANAGEMENT_PURPOSES)

    # ---- estimated savings vs. append mode (same request, full history instead of working context)
    actual = full = 0
    measured = 0
    for c in calls:
        if c["purpose"] != "answer" or not c["usage"] or not c["proj_bytes"] or not c["units"]:
            continue
        inp = c["usage"][0]
        bytes_per_token = c["units"] / inp if inp else None
        if not bytes_per_token:
            continue
        full_tokens = (c["units"] - c["proj_bytes"] + c["hist_bytes"]) / bytes_per_token
        actual += inp
        full += full_tokens
        measured += 1
        if c["turn"] is not None:
            c["turn"]["full_est"] = max(c["turn"]["full_est"], round(full_tokens))
    gross = full - actual
    net = gross - mgmt_in

    answer_calls = [c for c in calls if c["purpose"] == "answer" and c["usage"]]
    peak_call = max(answer_calls, key=lambda c: c["usage"][0], default=None)

    final_segments = (layer.get("context") or {}).get("segments", [])
    state = layer.get("state") or {}
    history, context, where = history_vs_context(events, final_segments)
    final_ctx = sum(len(s.get("content") or "") for s in final_segments)

    a.update({
        "history_by_kind": history, "context_by_bucket": context, "placement": where,
        "peak_ctx_chars": max(snapshot_chars.values(), default=0),
        "reduction_pct": pct(hist_chars - final_ctx, hist_chars) if hist_chars else None,
        "turns": turns,
        "turns_ok": sum(t["outcome"] == "ok" for t in turns),
        "turns_failed": sum(t["outcome"] == "FAILED" for t in turns),
        "calls": len(calls) + title_calls, "inference_calls": len(calls), "title_calls": title_calls,
        "latency_s": (metrics.get("latency_ms") or 0) / 1000,
        "settings": settings,
        "by_purpose": dict(by_purpose),
        "by_model": dict(by_model),
        "totals": totals,
        "mgmt_in": mgmt_in, "mgmt_out": mgmt_out,
        "mgmt_share": pct(mgmt_in, totals["input"]),
        "peak_in": peak_call["usage"][0] if peak_call else 0,
        "peak_model": peak_call["model"] if peak_call else None,
        "last_in": answer_calls[-1]["usage"][0] if answer_calls else 0,
        "budget": budget, "peak_pressure": peak_pressure,
        "final_ctx_chars": final_ctx,
        "history_chars": hist_chars, "conv_chars": conv_chars,
        "est_actual": actual, "est_full": full, "est_calls": measured,
        "gross_pct": pct(gross, full) if full else None,
        "net_pct": pct(net, full) if full else None,
        "transforms": transforms, "compaction": compaction, "skip_reasons": skip_reasons,
        "recoveries": recoveries, "restarts": restarts, "tool_projections": tool_projections,
        "offloads": metrics.get("offloads", 0), "retrievals": metrics.get("retrievals", 0),
        "workspace_reads": metrics.get("workspace_readbacks", 0),
        "state_calls": state_calls, "state_errors": state_errors, "manual_state": manual_state,
        "state_entries": state.get("entries", []), "state_conflicts": len(state.get("conflicts", [])),
        "pins": sum(1 for s in final_segments if s.get("pinned")),
        "verbatim": sum(1 for s in final_segments if s.get("verbatim_required")),
        "jev_turns": jev_turns,
        "selection": dict(selection_models),
        "selection_calls": sum(b["calls"] for b in selection_models.values()),
        "proposals": proposals, "gated": gated, "decision_rejections": decision_rejections,
        "failures": failures, "tools": tools,
        "documents": sum(1 for e in events if e["kind"] == "document"),
    })
    a["audit"] = automated_audit(layer)
    a["flags"] = review_flags(a) + [f["text"] for f in a["audit"]["findings"]]
    return a


def review_flags(a):
    flags = []
    if a["gross_pct"] is not None and a["gross_pct"] < 0:
        flags.append(f"Layered requests were larger than append mode would have sent (est. {fmt_pct(a['gross_pct'], True)}); "
                     "working-context overhead outweighed what it removed.")
    elif a["net_pct"] is not None and a["net_pct"] < 0:
        flags.append(f"The rough offline input proxy is negative after management input: gross {fmt_pct(a['gross_pct'], True)}, "
                     f"net {fmt_pct(a['net_pct'], True)}. This is not measured cost or token savings.")
    if a["turns_failed"]:
        flags.append(f"{a['turns_failed']} of {len(a['turns'])} turns failed (see Failures).")
    unanswered = sum(t["outcome"] == "no answer" for t in a["turns"])
    if unanswered:
        flags.append(f"{unanswered} user message(s) have no recorded answer or failure (interrupted or resubmitted?).")
    if not a["usage_complete"]:
        flags.append("Usage is incomplete in this export; token totals are lower bounds.")
    if a["jev_turns"] and not a["audit"]["jev"]:
        flags.append(f"Jev was enabled with no recorded calls (peak answer request reached {a['peak_pressure']:.0%} of the byte guard). "
                     "Transient tool-output pressure is separate from selection eligibility; benefit remains unmeasured.")
    if a["state_errors"]:
        n = sum(a["state_errors"].values())
        flags.append(f"{n} of {a['state_calls']} update_state calls were rejected "
                     f"({', '.join(f'{k} x{v}' for k, v in a['state_errors'].items())}).")
    paid_waste = a["compaction"]["paid_then_discarded"] + a["compaction"]["paid_then_rejected"]
    if paid_waste:
        flags.append(f"{paid_waste} paid compaction call(s) were discarded or rejected.")
    if a["peak_pressure"] > 0.9:
        flags.append(f"Peak request used {a['peak_pressure']:.0%} of the byte budget.")
    if len(a["turns"]) >= 5 and not a["state_entries"] and not a["pins"] and not a["audit"]["memory"]["automatic_entries"]:
        flags.append("No named state or pins in a multi-turn conversation; everything relies on unprotected context.")
    if a["gated"] and a["proposals"]["jev"]:
        total = sum(a["proposals"]["jev"].values())
        flags.append(f"{a['gated']} of {total} Jev assessments were escalated by the confidence gate.")
    return flags


# --------------------------------------------------------------------------- per-conversation report

def table(headers, rows, align=None):
    align = align or ["---"] + ["---:"] * (len(headers) - 1)
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(align) + "|"]
    lines += ["| " + " | ".join(md_cell(c) for c in row) + " |" for row in rows]
    return lines


def conversation_md(a):
    t = a["totals"]
    s = a["settings"]
    out = [f"# {a['title']}", "",
           f"`{a['id']}` · created {a['created']} · exported {a['exported']} · mode **{a['mode']}**", ""]
    if s:
        out += ["Settings (last turn): " + ", ".join(f"{k}={v}" for k, v in s.items()), ""]

    hist, ctx = a["history_chars"], a["final_ctx_chars"]
    out += ["## Full history vs. working context", "",
            "The full conversation is everything append-only mode would resend every call: user messages, "
            "assistant replies, documents/workspace files and reasoning summaries. The working context is what "
            "Conclave actually keeps in front of the model at the end. Both are measured in characters of text; "
            "tokens are approximate (characters ÷ 4).", ""]
    out += table(["", "Characters", "≈ Tokens"], [
        ["Full conversation history (append-only)", f"{hist:,}", f"{approx_tokens(hist):,}"],
        ["Working context at end", f"{ctx:,}", f"{approx_tokens(ctx):,}"],
        ["**Removed from working context**", f"**{hist - ctx:,}**",
         f"**{fmt_pct(a['reduction_pct'])}** smaller" if a["reduction_pct"] is not None else "n/a"],
        ["Largest working context during the conversation", f"{a['peak_ctx_chars']:,}", f"{approx_tokens(a['peak_ctx_chars']):,}"],
    ], ["---", "---:", "---:"])

    out += ["", "What the full history is made of:", ""]
    out += table(["Source", "Characters", "Share"],
                 [[HISTORY_LABELS[k], f"{v:,}", f"{pct(v, hist):.0f}%"]
                  for k, v in a["history_by_kind"].most_common() if v], ["---", "---:", "---:"])
    out += ["", "What the working context is made of:", ""]
    out += table(["Content", "Characters", "Share"],
                 [[k, f"{v:,}", f"{pct(v, ctx):.0f}%"] for k, v in a["context_by_bucket"].most_common() if v],
                 ["---", "---:", "---:"])
    out += ["", "Where each history item ended up:", ""]
    out += table(["Placement", "Items", "Characters of original text"],
                 [[PLACEMENT_LABELS[k], v["items"], f"{v['chars']:,}"] for k, v in a["placement"].items()],
                 ["---", "---:", "---:"])

    out += ["", "### By turn", ""]
    rows = []
    for turn in a["turns"]:
        reduced = (f"{pct(turn['hist_chars'] - turn['ctx_chars'], turn['hist_chars']):.0f}%"
                   if turn["hist_chars"] and turn["ctx_chars"] is not None else "")
        rows.append([turn["n"], short(turn["text"], 50),
                     f"{turn['hist_chars']:,}" if turn["hist_chars"] is not None else "",
                     f"{turn['ctx_chars']:,}" if turn["ctx_chars"] is not None else "", reduced,
                     f"{turn['peak_in']:,}" if turn["peak_in"] else "", turn["calls"], turn["outcome"]])
    out += table(["#", "User message", "History chars", "Working ctx chars", "Smaller by",
                  "Largest request (billed tokens)", "Calls", "Outcome"], rows,
                 ["---:", "---", "---:", "---:", "---:", "---:", "---:", "---"])
    out += ["", "A negative *Smaller by* means the working context held more than the history: named state and "
                "excerpts are added on top of verbatim messages until something is compacted or offloaded."]

    out += ["", "## Review notes", ""]
    out += [f"- {f}" for f in a["flags"]] or ["- Nothing flagged."]

    out += ["", "## Cost and calls", "",
            "Billed request size includes instructions, tool definitions and tool exchanges on top of the working "
            "context, so it is larger than the working-context figures above.", ""]
    out += table(["Measure", "Value"], [
        ["Turns (ok / failed / total)", f"{a['turns_ok']} / {a['turns_failed']} / {len(a['turns'])}"],
        ["API dispatches (including separately logged titles)", f"{a['calls']:,}"],
        ["Tokens in / out", f"{t['input']:,} / {t['output']:,}" + ("" if a["usage_complete"] else " (incomplete)")],
        ["Cached input (already included above)", f"{t['cached']:,} ({pct(t['cached'], t['input']):.0f}%)"],
        ["Context-management share of input", fmt_pct(a["mgmt_share"])],
        ["Largest answer request", f"{a['peak_in']:,} tokens ({a['peak_model']})"],
        ["Last answer request", f"{a['last_in']:,} tokens"],
        ["Est. answer-input savings vs. append mode (gross, uncached)", fmt_pct(a["gross_pct"], True)],
        ["Est. savings after management cost (net, uncached)", fmt_pct(a["net_pct"], True)],
        ["Peak byte-budget use (request bytes + output reserve)",
         f"{a['peak_pressure']:.0%} of {a['budget']:,}" if a["budget"] else "n/a"],
    ], ["---", "---:"])

    out += ["", "### Tokens by purpose", "", "Answer = the reply loop. Web search and title generation are separate from context management.", ""]
    out += table(["Purpose", "Responses with usage", "Input", "Output", "Cached in", "Reasoning out"],
                 [[p, b["calls"], f"{b['input']:,}", f"{b['output']:,}", f"{b['cached']:,}", f"{b['reasoning']:,}"]
                  for p, b in sorted(a["by_purpose"].items(), key=lambda kv: -kv[1]["input"])])
    out += ["", "### Tokens by provider and model", ""]
    out += table(["Provider", "Model", "Responses with usage", "Input", "Output"],
                 [[p or "?", m or "?", b["calls"], f"{b['input']:,}", f"{b['output']:,}"]
                  for (p, m), b in sorted(a["by_model"].items(), key=lambda kv: -kv[1]["input"])], ["---", "---"] + ["---:"] * 3)

    c = a["compaction"]
    out += ["", "## Context management", ""]
    out += table(["Operation", "Count"], [
        ["Compaction calls committed", c["committed"]],
        ["Compaction calls paid then discarded (<15% reduction)", c["paid_then_discarded"]],
        ["Compaction calls paid then rejected", c["paid_then_rejected"]],
        ["Compaction attempts skipped before paying", c["skipped_before_paying"]],
        ["Offloads to retrieval pointers", a["offloads"]],
        ["Budget recoveries", a["recoveries"]],
        ["Tool-output projections", a["tool_projections"]],
        ["Continuation restarts", a["restarts"]],
        ["Retrievals (model)", a["retrievals"]],
        ["Workspace readbacks", a["workspace_reads"]],
    ], ["---", "---:"])
    if a["transforms"]:
        out += ["", "Applied context changes (excluding ordinary message adds):", ""]
        out += [f"- {k}: {v}" for k, v in a["transforms"].most_common()]
    if a["skip_reasons"]:
        out += ["", "Skip reasons:", ""]
        out += [f"- {k}: {v}" for k, v in a["skip_reasons"].most_common()]

    out += ["", "## Named state and pins", "",
            f"- update_state calls: {a['state_calls']} ({sum(a['state_errors'].values())} rejected); "
            f"manual /remember entries: {a['manual_state']}",
            f"- Final entries: {len(a['state_entries'])}; declared conflicts: {a['state_conflicts']}; "
            f"pinned segments: {a['pins']}; verbatim-required: {a['verbatim']}"]
    if a["state_entries"]:
        out += [""]
        out += table(["Key", "Type", "Status", "Content"],
                     [[e.get("state_key"), e.get("type"), e.get("effective_status") or e.get("status"),
                       short(e.get("content"), 90)] for e in a["state_entries"]], ["---"] * 4)

    out += ["", "## Selector / Jev", "",
            f"- Jev enabled on {a['jev_turns']} of {len(a['turns'])} turns; selection calls: {a['selection_calls']}"]
    audit = a["audit"]
    out += ["", "All Jev purposes (attempts include failed/unanswered calls):", ""]
    out += table(["Purpose", "Attempts", "Responses", "Input", "Output"],
                 [[p, v["attempts"], v["responses"], v["input"], v["output"]] for p, v in audit["jev"].items()])
    r = audit["retrieval"]
    out += ["", f"Retrieval decisions: {r['evaluations']}; assessed: {r['assessed']}; fallback: {r['fallbacks']}; "
            f"changed shortlist order: {r['changed_order']}; cache hits: {r['cache_hits']}. "
            f"Uncertain candidate assessments: {r['uncertain_decisions']}/{r['total_decisions']}. Priority confidence is not truth confidence."]
    out += ["", f"Large fresh retrievals missing their direct output in the next request: {len(r['fresh_large_outputs_missing_from_next_request'])}. "
            "Event/request pairs are retained in analysis.json; structured fresh observations count as delivery.",
            f"Fresh large outputs supplied as exact pages: {len(r['fresh_large_outputs_paged'])}. Remaining text requires paging; delivery does not establish inspection or verification."]
    for (prov, model), b in a["selection"].items():
        out.append(f"- {prov} {model or ''}: {b['calls']} calls, {b['input']:,} in / {b['output']:,} out")
    for key, label in (("jev", "Jev recommendations"), ("other", "Other proposals")):
        if a["proposals"][key]:
            out.append(f"- {label}: " + ", ".join(f"{k} {v}" for k, v in a["proposals"][key].most_common()))
    if a["gated"]:
        out.append(f"- Escalated by the confidence gate: {a['gated']}")
    if a["decision_rejections"]:
        out.append(f"- Selector rejections/fallbacks: {len(a['decision_rejections'])}")

    m, ec = audit["memory"], audit["economics"]
    out += ["", "## Automatic memory and controller health", "",
            f"Automatic entries: {m['automatic_entries']}; named state: {m['named_entries']}; paid extraction attempts: {m['extraction_attempts']}. "
            f"Empty activations: {m['empty_activations']}/{m['activation_calls']}; capture statuses: {m['capture_status']}. "
            "Capture completion alone does not imply useful knowledge was saved.", "",
            f"Embedding failures: {audit['embeddings']['failures']}; reported embedding usage: {audit['embeddings']['reported']}.", "",
            f"Shadow evaluations: {ec['status']}; failed stages: {ec['failed_stages']}; elapsed {ec['elapsed_ms']/1000:.3f}s. "
            f"Local review results: {ec['review_results']}. Comparable reconciliations: {ec['comparable_reconciliations']}/{ec['reconciliations']}. "
            "Shadow choices do not enact cost optimization.", "", "### Repeated retrieval arguments", ""]
    out += table(["Tool", "Count", "Arguments"], [[x['tool'], x['count'], short(json.dumps(x['arguments'], ensure_ascii=False), 180)]
                  for x in r['repeated_calls'][:15]], ["---", "---:", "---"])
    out += ["", "## Failures", ""]
    if a["failures"]:
        grouped = Counter((kind, short(msg, 160)) for kind, msg in a["failures"])
        out += [f"- **{kind}** x{n}: {msg}" for (kind, msg), n in grouped.most_common()]
    else:
        out += ["- None."]

    out += ["", "## Tools", ""]
    out += [f"- {k}: {v}" for k, v in a["tools"].most_common()] or ["- None."]
    out += ["", "---", "", METHOD_NOTE]
    return "\n".join(out) + "\n"


METHOD_NOTE = (
    "*Method:* the history vs. working-context comparison counts characters of text only: no metadata, "
    "instructions or tool definitions on either side. It measures how much Conclave keeps in front of the "
    "model, not what the provider billed. Billed token figures are the providers' reported usage (Anthropic cache "
    "reads/writes added to input). Estimated savings are an offline reconstruction, not a paid comparison, and "
    "do not account for prompt-cache discounts: each answer request's working-context "
    "message is replaced by the append-mode history (user, assistant, document and reasoning events, "
    f"plus ~{SOURCE_OVERHEAD_BYTES} bytes of source header each), keeping instructions, tools and tool "
    "exchanges fixed, then converted to tokens using that request's own bytes-per-token ratio. This ratio "
    "is a rough proxy, not a tokenizer replay or matched baseline. Net subtracts "
    "context-management input (selection, compaction, reranking, classification, memory extraction), not web search. It says nothing about answer quality; fidelity "
    "still needs a human read."
)


# --------------------------------------------------------------------------- master report

def master_md(reports, generated):
    t = Counter()
    for a in reports:
        t.update(a["totals"])
    turns = sum(len(a["turns"]) for a in reports)
    failed = sum(a["turns_failed"] for a in reports)
    mgmt = sum(a["mgmt_in"] for a in reports)
    actual = sum(a["est_actual"] for a in reports)
    full = sum(a["est_full"] for a in reports)

    hist = sum(a["history_chars"] for a in reports)
    ctx = sum(a["final_ctx_chars"] for a in reports)
    out = ["# Conclave Master Report", "",
           f"Generated {generated:%Y-%m-%d %H:%M} · {len(reports)} conversations · {turns} turns "
           f"({failed} failed) · {sum(a['calls'] for a in reports):,} API calls", "",
           "## Full history vs. working context", "",
           "*History* = the full append-only conversation text (user, assistant, documents/workspace files, reasoning). "
           "*Working context* = what Conclave keeps in front of the model at the end. Characters of text; "
           "≈ tokens is characters ÷ 4. *Where history items ended up* counts each original message or file as "
           "verbatim / condensed (summary, state entry or excerpt) / pointer only / not in context.", ""]
    place_rows = []
    totals_place = {k: 0 for k in PLACEMENT_LABELS}
    for a in sorted(reports, key=lambda r: r["created"], reverse=True):
        for k in totals_place:
            totals_place[k] += a["placement"][k]["items"]
        place_rows.append([
            f"[{md_cell(short(a['title'], 48))}]({REPORT_DIR_NAME}/{a['id']}.md)", len(a["turns"]),
            f"{a['history_chars']:,}", f"{a['final_ctx_chars']:,}", f"{approx_tokens(a['history_chars'] - a['final_ctx_chars']):,}",
            fmt_pct(a["reduction_pct"]) if a["reduction_pct"] is not None else "n/a",
            " / ".join(str(a["placement"][k]["items"]) for k in PLACEMENT_LABELS)])
    place_rows.append(["**All conversations**", turns, f"**{hist:,}**", f"**{ctx:,}**",
                       f"**{approx_tokens(hist - ctx):,}**", f"**{fmt_pct(pct(hist - ctx, hist))}**",
                       " / ".join(str(v) for v in totals_place.values())])
    out += table(["Conversation", "Turns", "History chars", "Working ctx chars", "≈ Tokens removed", "Smaller by",
                  "Verbatim / condensed / pointer / not in context"], place_rows,
                 ["---"] + ["---:"] * 5 + ["---:"])

    out += ["", "## Cost and calls", ""]
    out += table(["Measure", "Value"], [
        ["Tokens in / out", f"{t['input']:,} / {t['output']:,}"],
        ["Cached input", f"{t['cached']:,}"],
        ["Context-management input", f"{mgmt:,} ({pct(mgmt, t['input']):.1f}% of input)"],
        ["Answer input: actual vs. full-history est.", f"{actual:,.0f} vs. {full:,.0f}"],
        ["Est. savings vs. append mode (gross, uncached)", fmt_pct(pct(full - actual, full) if full else None, True)],
        ["Est. savings after management cost (net, uncached)", fmt_pct(pct(full - actual - mgmt, full) if full else None, True)],
        ["Conversations with incomplete usage", sum(not a["usage_complete"] for a in reports)],
    ], ["---", "---:"])

    out += ["", "*Net* = estimated billed input saved vs. append mode after management cost (before cache discounts).", ""]
    rows = []
    for a in sorted(reports, key=lambda r: r["created"], reverse=True):
        rows.append([f"[{md_cell(short(a['title'], 48))}]({REPORT_DIR_NAME}/{a['id']}.md)", a["created"][:10],
                     f"{a['turns_ok']}/{len(a['turns'])}", a["calls"], f"{a['totals']['input']:,}",
                     f"{pct(a['totals']['cached'], a['totals']['input']):.0f}%", f"{a['peak_in']:,}",
                     fmt_pct(a["net_pct"], True), fmt_pct(a["mgmt_share"]), a["selection_calls"],
                     len(a["flags"])])
    out += table(["Conversation", "Created", "Turns ok", "Calls", "Input tok", "Cached", "Peak req tok",
                  "Net", "Mgmt", "Jev calls", "Flags"], rows,
                 ["---", "---"] + ["---:"] * 9)

    out += ["", "## Recurring failures", ""]
    grouped = defaultdict(lambda: [0, set()])
    for a in reports:
        for kind, msg in a["failures"]:
            key = (kind, short(msg, 140))
            grouped[key][0] += 1
            grouped[key][1].add(short(a["title"], 30))
    if grouped:
        for (kind, msg), (n, titles) in sorted(grouped.items(), key=lambda kv: -kv[1][0]):
            out.append(f"- **{kind}** x{n} in {len(titles)} conversation(s): {msg}")
    else:
        out.append("- None.")

    def used(pred):
        return sum(1 for a in reports if pred(a))
    out += ["", "## Feature coverage", "", f"Conversations (of {len(reports)}) that exercised each capability:", ""]
    out += table(["Capability", "Conversations"], [
        ["Named state (model update_state)", used(lambda a: a["state_calls"])],
        ["Named state (manual /remember)", used(lambda a: a["manual_state"])],
        ["update_state rejections", used(lambda a: a["state_errors"])],
        ["Pins", used(lambda a: a["pins"])],
        ["Documents / workspace files", used(lambda a: a["documents"])],
        ["Retrieval", used(lambda a: a["retrievals"])],
        ["Offload to pointers", used(lambda a: a["offloads"])],
        ["Compaction committed", used(lambda a: a["compaction"]["committed"])],
        ["Paid compaction discarded/rejected", used(lambda a: a["compaction"]["paid_then_discarded"] + a["compaction"]["paid_then_rejected"])],
        ["Budget recovery", used(lambda a: a["recoveries"])],
        ["Jev enabled", used(lambda a: a["jev_turns"])],
        ["Jev actually called", used(lambda a: a["selection_calls"])],
    ], ["---", "---:"])

    out += ["", "## Flags by conversation", ""]
    for a in sorted(reports, key=lambda r: r["created"], reverse=True):
        if a["flags"]:
            out.append(f"**[{md_cell(short(a['title'], 60))}]({REPORT_DIR_NAME}/{a['id']}.md)**")
            out += [f"- {f}" for f in a["flags"]] + [""]
    out += ["---", "", METHOD_NOTE]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- driver

def main():
    parser = argparse.ArgumentParser(description="Build Markdown reports from Converse/Conclave exports.")
    parser.add_argument("--dir", default=str(DEFAULT_DIR), help=f"conversations folder (default: {DEFAULT_DIR})")
    parser.add_argument("--files", nargs="+", help="Analyze only these exports; implies --no-move")
    parser.add_argument("--output-dir", help="Write reports to this directory instead of the conversations folder")
    parser.add_argument("--no-move", action="store_true", help="Preserve original export paths")
    parser.add_argument("--json", action="store_true", help="Write structured audit results to analysis.json")
    parser.add_argument("--skip-costs", action="store_true", help="Skip the separate shared cost-report batch")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    base = Path(args.dir)
    output_base = Path(args.output_dir) if args.output_dir else base
    output_base.mkdir(parents=True, exist_ok=True)
    processed, report_dir = base / "Processed", output_base / REPORT_DIR_NAME
    if not base.is_dir():
        sys.exit(f"Conversations folder not found: {base}")
    if not args.no_move and not args.files:
        processed.mkdir(exist_ok=True)
    report_dir.mkdir(exist_ok=True)

    new_files = [Path(p).resolve() for p in args.files] if args.files else sorted(base.glob("*.json"))
    latest = {}
    recognized_files = []
    for path in ([] if args.files else sorted(processed.glob("*.json"))) + new_files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as err:
            print(f"Skipping {path.name}: {err}")
            continue
        if not isinstance(data, dict) or "context_layer" not in data:
            print(f"Skipping {path.name}: not a Converse export with a context layer")
            continue
        if path in new_files:
            recognized_files.append(path)
        cid = data.get("conversation_id") or data["context_layer"].get("conversation_id")
        # Keep the newest export of each conversation.
        if cid not in latest or (data.get("exported_at") or "") >= (latest[cid][1].get("exported_at") or ""):
            latest[cid] = (path, data)

    if not latest:
        sys.exit(f"No exports found in {base} or {processed}")

    reports = []
    for cid, (path, data) in latest.items():
        try:
            a = analyze(data)
        except Exception as err:  # keep going; one bad export shouldn't stop the batch
            print(f"Could not analyze {path.name}: {err!r}")
            continue
        (report_dir / f"{a['id']}.md").write_text(conversation_md(a), encoding="utf-8")
        reports.append(a)
        print(f"  {short(a['title'], 50):50}  context {fmt_pct(a['reduction_pct']):>7} smaller than history"
              f"  flags {len(a['flags'])}")

    generated = datetime.now()
    master = output_base / MASTER_NAME
    master.write_text(master_md(reports, generated), encoding="utf-8")
    if args.json:
        machine = {"schema_version": "conversation-audit-v1", "generated_at": generated.isoformat(),
                   "conversations": [{"conversation_id": a["id"], "title": a["title"], "turns": a["turns"],
                       "usage_complete": a["usage_complete"], "by_purpose": a["by_purpose"], "flags": a["flags"],
                       "audit": a["audit"]} for a in reports]}
        (output_base / "analysis.json").write_text(json.dumps(machine, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # All USD arithmetic lives in the shared JavaScript analyzer; this helper
    # retains its context-placement and quality reports without a second price engine.
    cost_script = Path(__file__).resolve().parent / "report-costs.js"
    if not args.skip_costs:
        subprocess.run(["node", str(cost_script), str(base)], check=True)
        with master.open("a", encoding="utf-8") as output:
            cost_link = os.path.relpath(base / 'cost-reports/index.md', output_base).replace('\\', '/')
            output.write(f"\n\nDated rate valuation and per-call coverage: [Shared cost report]({cost_link}).\n")

    for path in ([] if args.no_move or args.files else recognized_files):
        # Preserve older exports even when their original download names collide.
        data = json.loads(path.read_text(encoding="utf-8"))
        stamp = re.sub(r"[^a-zA-Z0-9_-]", "-", data.get("exported_at") or generated.isoformat())
        stem = path.stem if path.stem.endswith("_" + stamp) else f"{path.stem}_{stamp}"
        target = processed / f"{stem}.json"
        version = 1
        while target.exists():
            target = processed / f"{stem}_{version}.json"
            version += 1
        shutil.move(str(path), str(target))

    print(f"\n{len(reports)} conversation reports in {report_dir}")
    print(f"Master report: {master}")
    if recognized_files and not (args.no_move or args.files):
        print(f"Moved {len(recognized_files)} new export(s) to {processed}")


if __name__ == "__main__":
    main()
