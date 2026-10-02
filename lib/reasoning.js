// Readable provider summaries are evidence of reported rationale, not raw thoughts.
// Opaque continuation material stays in native_output and never enters this projection.
export function reasoningSettings(
  provider,
  model,
  output = 4096,
  enabled = true,
) {
  if (!enabled) return {};
  if (
    ["GPT", "openai"].includes(provider) &&
    !/chat|o3-mini/.test(model) &&
    /^(gpt-[56](?:[.-]|$)|o[34](?:-|$))/.test(model)
  )
    return {
      reasoning: { summary: "auto" },
      include: ["reasoning.encrypted_content"],
    };
  if (["Claude", "anthropic"].includes(provider)) {
    if (
      /claude-(?:fable|mythos)|claude-(?:opus|sonnet)-(?:5|4-[6789])/.test(
        model,
      )
    )
      return { thinking: { type: "adaptive", display: "summarized" } };
    if (/claude-(?:opus|sonnet|haiku)-4/.test(model) && output > 1024)
      return {
        thinking: {
          type: "enabled",
          budget_tokens: Math.min(2048, output - 1),
        },
      };
  }
  if (
    ["Gemini", "gemini"].includes(provider) &&
    /^gemini-(?:2\.5|[3-9])/.test(model)
  )
    return { thinkingConfig: { includeThoughts: true } };
  return {};
}

export function reasoningSummary(provider, response) {
  const parts = [],
    native =
      response?.output ||
      response?.content ||
      response?.candidates?.[0]?.content?.parts ||
      [];
  let opaque = false;
  const summaries = [];
  for (const [index, item] of native.entries()) {
    if (!item) continue;
    if (item.type === "reasoning") {
      for (const [summaryIndex, part] of (item.summary || []).entries())
        if (part.text) {
          parts.push(part.text);
          summaries.push({
            index,
            item_id: item.id || null,
            summary_index: summaryIndex,
            text: part.text,
          });
        }
      if (item.encrypted_content) opaque = true;
    }
    const block = item.anthropic_content || item;
    if (block.type === "thinking" && block.thinking) {
      parts.push(block.thinking);
      summaries.push({ index, text: block.thinking });
    }
    if (
      block.signature ||
      block.type === "redacted_thinking" ||
      block.thoughtSignature
    )
      opaque = true;
    if (block.thought && block.text) {
      parts.push(block.text);
      summaries.push({ index, text: block.text });
    }
  }
  return {
    provider,
    text: parts.join("\n\n"),
    summaries,
    opaque_available: opaque,
    label: "Provider reasoning summary",
    status: response?.status || "completed",
  };
}

// Includes legacy records without rewriting their history.
export function reasoningRecords(events) {
  const requests = new Map(
    events.filter((e) => e.kind === "inference_request").map((e) => [e.id, e]),
  );
  return events
    .filter(
      (e) =>
        e.kind === "inference_response" ||
        (e.kind === "reasoning" && e.metadata.status === "partial"),
    )
    .flatMap((e) => {
      if (e.kind === "reasoning" && e.metadata.response_event_id) return [];
      const request = requests.get(e.metadata.request_id);
      if (!request || request.content !== "answer") return [];
      const summary =
        e.kind === "reasoning"
          ? { ...e.metadata, text: e.content }
          : reasoningSummary(request.metadata.provider, e.metadata);
      if (!summary.text && !summary.opaque_available) return [];
      const user = events.findLast(
        (v) =>
          v.seq < request.seq &&
          v.kind === "user" &&
          !v.metadata.purpose?.startsWith("manual-"),
      );
      return [
        {
          ...summary,
          request_id: request.id,
          response_event_id: e.id,
          user_event_id: request.metadata.user_event_id || user?.id || null,
          run_id: request.metadata.run_id || null,
          model: e.metadata.model || request.metadata.payload.model,
          requested_model: request.metadata.payload.model,
        },
      ];
    });
}
