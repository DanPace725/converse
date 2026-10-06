// Conversation-local handles are derived from immutable first appearances.
// They never enter canonical snapshots, so hashes and old exports stay valid.
export function referenceIndex(snapshots, events) {
  const segments = new Map(),
    sources = new Map();
  for (const snapshot of snapshots)
    for (const item of snapshot.segments) {
      if (!segments.has(item.id))
        segments.set(item.id, `S${segments.size + 1}`);
    }
  for (const event of events)
    if (
      ["user", "assistant", "document", "image", "reasoning", "tool_result"].includes(
        event.kind,
      )
    ) {
      if (!sources.has(event.id)) sources.set(event.id, `E${sources.size + 1}`);
    }
  return { segments, sources };
}

export function resolveHandle(index, value, type = "segments") {
  const prefix = type === "segments" ? "S" : "E";
  if (!new RegExp(`^${prefix}[1-9][0-9]*$`, "i").test(value)) return value;
  const canonical = [...index[type]].find(
    ([, ref]) => ref === value.toUpperCase(),
  )?.[0];
  if (!canonical)
    throw Error(
      `Unknown ${prefix === "S" ? "segment" : "source"} reference ${value}; references belong to this conversation. Refresh its context.`,
    );
  return canonical;
}
