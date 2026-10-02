export function protection(
  item,
  { protectedIds = [], recentIds = [], currentUserIds = [] } = {},
) {
  const reasons = [];
  const add = (code, label, lifetime) =>
    reasons.push({ code, label, lifetime });
  if (item.pinned) add("pin", "Pinned by user", "until unpinned");
  if (item.verbatim_required)
    add("verbatim", "Exact text required", "until requirement removed");
  if (item.state_key)
    add(
      "state",
      "Named state; use update_state",
      "while this state version is active",
    );
  if (currentUserIds.includes(item.id))
    add("current_request", "Current user request", "current turn");
  else if (protectedIds.includes(item.id))
    add("request_guard", "Explicit request safeguard", "current request");
  if (recentIds.includes(item.id))
    add("recent", "Recent context window", "until outside recent window");
  const blocked = reasons.length > 0;
  return {
    protected: blocked,
    reasons,
    can_edit: !blocked,
    can_offload: !blocked && item.type !== "reference",
  };
}

export function eligibility(segments, options) {
  return segments.map((item) => ({
    id: item.id,
    ...protection(item, options),
  }));
}
