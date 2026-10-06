// Text UI over authoritative conversation storage. Drafts belong to this tab.
(() => {
  const el = (id) => document.getElementById(id),
    panel = el("workspace-editor");
  let view = null,
    tab = "documents",
    contextView = "pieces",
    memoryView = "graph",
    selected = null,
    editing = false,
    preview = false,
    saving = false,
    timer,
    loading = false;
  let drafts = {},
    listSignature = "",
    inspection = 0,
    saveError = "";
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("converse-editor-drafts") || "{}",
    );
    if (saved && typeof saved === "object" && !Array.isArray(saved))
      drafts = saved;
  } catch {}
  const keyOf = (item) =>
    view.conversation_id + ":" + item.kind + ":" + item.id;
  const draft = () => selected && drafts[keyOf(selected)];
  const segmentLabel = (s) =>
    `${s.segmentRef || view?.segment_refs?.[s.id] || "Historical segment"} · ${s.state_key || s.type}`;
  const persist = () => {
    try {
      sessionStorage.setItem("converse-editor-drafts", JSON.stringify(drafts));
    } catch {
      el("editor-feedback").textContent =
        "Draft remains in this page; browser storage is full. Download it before reloading.";
    }
  };
  function documents() {
    return [
      ...(view?.workspace || []).map((f) => ({
        kind: "document",
        id: f.path,
        title: f.path,
        content: f.content,
        token: f.source_event_id,
        path: f.path,
        author: f.source_attribution,
      })),
      ...(view?.attachments || []).map((f) => ({
        kind: "source",
        id: f.source_event_id,
        title: f.name + " (original)",
        content: f.content,
        token: f.source_event_id,
        name: f.name,
      })),
    ];
  }
  function segments(kind) {
    const list =
      kind === "state"
        ? view.state.entries
        : view.context.segments.filter((s) => !s.state_key);
    const result = list.map((s) => ({
      kind,
      id: kind === "state" ? s.state_key : s.id,
      title: segmentLabel(s),
      content: s.content,
      token: s.id,
      section: s,
      protected: !!(
        s.pinned ||
        s.verbatim_required ||
        (kind === "context" && s.type === "reference")
      ),
    }));
    return kind === 'state' ? result.concat((view.memory?.entries || []).map(r => memoryItem(r))) : result;
  }
  function memoryItem(r, historical = false) {
    return { kind: 'memory', id: r.memory_id, token: r.memory_id,
      title: `Automatic · ${r.kind} · ${r.memory_id.slice(0, 12)} · ${r.content.slice(0, 55)}`,
      content: r.content, historical, protected: ['suppressed', 'invalidated', 'superseded'].includes(r.lifecycle),
      section: { ...r, id: r.memory_id, type: r.kind, source_event_ids: r.source_refs.map(s => s.event_id), parent_bundle_ids: [],
        relations: { supersedes: r.supersedes || [] } } };
  }
  function items() {
    if (!view) return [];
    if (tab === 'jev') return [];
    return tab === "documents" ? documents() : segments(tab);
  }
  function latest(item = selected) {
    if (!item || !view) return null;
    // Saved historical text has no newer version to follow.
    if (item.historical) return item;
    if (item.kind === 'memory') {
      const r = view.memory?.records.find(r => r.memory_id === item.id);
      return r ? memoryItem(r) : null;
    }
    if (item.kind === "document" || item.kind === "source")
      return (
        documents().find((i) => i.kind === item.kind && i.id === item.id) || null
      );
    const s = (
      item.kind === "state" ? view.state.entries : view.context.segments
    ).find((s) =>
      item.kind === "state" ? s.state_key === item.id : s.id === item.id,
    );
    return s
      ? {
          ...item,
          content: s.content,
          token: s.id,
          title: segmentLabel(s),
          section: s,
          protected: !!(
            s.pinned ||
            s.verbatim_required ||
            (item.kind === "context" && s.type === "reference")
          ),
        }
      : null;
  }
  function stale() {
    const d = draft();
    if (!d) return false;
    if (selected.kind === 'memory') return view.memory?.revision !== d.memoryRevision || !latest();
    if (selected.newEntry) return view.context.revision !== d.revision;
    const current = latest();
    return (
      !current ||
      current.token !== d.token ||
      (["context", "state"].includes(selected.kind) &&
        view.context.revision !== d.revision)
    );
  }
  function syncControls() {
    const blocked =
      busy || saving || !view || view.busy || view.agent?.status === "running";
    for (const field of panel.querySelectorAll(
      "textarea, input, select, #editor-items button, #editor-memory-proposals button, #memory-views button, #editor-memory-connections button, #editor-tabs button, #editor-history button, #editor-reference, #editor-edit, #editor-discard, #editor-latest, #editor-new-state, #editor-back, #context-views button, .breakdown-item",
    ))
      field.disabled = saving;
    window.memoryGraph?.setDisabled(saving);
    el("editor-state-key").disabled = saving || !selected?.newEntry;
    el("editor-save").disabled = blocked || stale();
    el('editor-memory-suppress').disabled = blocked || editing;
    el("editor-upload").disabled = busy || saving || view?.busy || view?.agent?.status === "running";
    el("editor-use").disabled = blocked;
    el('editor-remove').disabled = blocked || editing;
    el('editor-token-count').disabled = blocked || counting;
    for (const button of el('editor-removed').querySelectorAll('button')) button.disabled = blocked;
    el("editor-feedback").classList.toggle("error", stale() || !!saveError);
    if (editing && !saving)
      el("editor-feedback").textContent =
        saveError ||
        (stale()
          ? "The saved version changed. Your draft is preserved. Download it or copy your changes, then load the latest version."
          : blocked
            ? "You can edit a draft while the model works. Stop the agent or wait for the reply before saving."
            : "Unsaved draft · Save records a new version without a model call.");
    el("editor-latest").hidden = !stale();
  }
  function renderPreview(text) {
    const target = el("editor-preview");
    if (['context', 'state', 'memory'].includes(selected?.kind)) {
      target.className = "plain-text";
      target.textContent = text;
      return;
    }
    renderReply(target, text);
  }
  // Files show their list above the open file. Context and Memory drill in:
  // the list gives way to one piece, and the garden stays above it.
  function layout() {
    const context = tab === "context",
      detail = tab !== "documents" && !!selected,
      activity = context && contextView === "activity";
    panel.toggleAttribute("data-detail", detail);
    el("request-breakdown").hidden = !context || detail;
    el("context-views").hidden = !context || detail || !view;
    el("editor-telemetry").hidden = !activity || detail || !view;
    el('editor-jev').hidden = tab !== 'jev' || detail;
    el("editor-note").hidden = detail || activity || tab === 'jev';
    el("editor-items").hidden = detail || activity || tab === 'jev' || (tab === 'state' && memoryView === 'graph');
    el('memory-views').hidden = tab !== 'state' || detail || !view;
    el('memory-graph').hidden = tab !== 'state' || detail || !view || memoryView !== 'graph';
    el('editor-memory-proposals').hidden = tab !== 'state' || detail || !view;
    for (const button of el('memory-views').querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.dataset.view === memoryView));
    el("editor-new-state").hidden = tab !== "state" || detail || !view;
    el('editor-memory-copy').hidden = tab !== 'state' || detail || !view;
    el('editor-memory-issues').hidden = tab !== 'state' || !view?.memory?.capture_issue_count;
    el("editor-upload-controls").hidden = tab !== "documents";
    el("editor-upload-status").hidden = tab !== "documents";
    el("editor-back").hidden = !detail;
    el("editor-back").textContent =
      tab === "state" ? "← All memory" : tab === 'jev' ? '← Jev activity' : "← All pieces";
    for (const button of el("context-views").querySelectorAll("button"))
      button.setAttribute("aria-pressed", String(button.dataset.view === contextView));
    window.contextGarden?.setVisible(!panel.hidden && context);
    window.contextGarden?.mark(context && selected ? selected.token : null);
  }
  function renderList() {
    renderJev();
    renderTelemetry();
    renderRemoved();
    layout();
    const container = el("editor-items");
    const rows = items();
    if (tab === 'state') window.memoryGraph?.render(view, (id) => {
      const record = view?.memory?.records.find(r => r.memory_id === id);
      if (record) select(memoryItem(record));
    }, (id) => {
      const item = segments('state').find(item => item.kind === 'state' && item.id === id);
      if (item) select(item);
    });
    for (const d of Object.values(drafts).filter(
      (d) =>
        d.conversation === view?.conversation_id &&
        (tab === "documents"
          ? ["document", "source"].includes(d.item.kind)
          : d.item.kind === tab),
    )) {
      if (!rows.some((i) => i.kind === d.item.kind && i.id === d.item.id))
        rows.push({ ...d.item, detached: true });
    }
    const signature = JSON.stringify([
      view?.conversation_id,
      tab,
      memoryView,
      view?.context.revision,
      view?.memory?.revision,
      view?.memory?.capture_issues,
      view?.memory?.capture_summary,
      view?.memory?.suppression_proposals,
      selected?.kind,
      selected?.id,
      rows.map((i) => [i.kind, i.id, i.token, !!drafts[keyOf(i)]]),
    ]);
    if (signature === listSignature) return;
    listSignature = signature;
    const issues = view?.memory?.capture_issues || [];
    el('editor-memory-issues-title').textContent = `${view?.memory?.capture_issue_count || 0} memory capture issue${view?.memory?.capture_issue_count === 1 ? '' : 's'}`;
    el('editor-memory-issues-list').replaceChildren(...issues.map(issue => {
      const row = document.createElement('p'), button = document.createElement('button');
      const retry = issue.retry_disposition === 'configuration-change-required' ? 'Automatic retry stopped; configuration needs attention.'
        : issue.retry_disposition === 'attempts-exhausted' ? 'Automatic retry limit reached.' : 'Capture will retry on later activity.';
      row.append(`${issue.status === 'pending' ? 'Pending' : 'Capture incomplete'}: ${issue.error || 'Not yet captured.'} ${retry} `);
      button.type = 'button'; button.textContent = 'Open source ' + (view.source_refs?.[issue.source_event_id] || issue.source_event_id);
      button.onclick = () => inspect({id:issue.source_event_id}, true, true); row.append(button); return row;
    }));
    container.replaceChildren();
    const proposals = el('editor-memory-proposals');
    proposals.replaceChildren();
    if (tab === 'state') for (const proposal of view?.memory?.suppression_proposals || []) {
      if (proposal.applied) continue;
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = `Proposed cleanup: ${proposal.key} · ${proposal.targets.length} entries`; details.append(summary);
      for (const target of proposal.targets) {
        const line = document.createElement('p'); line.textContent = `${target.id} · ${target.snippet}`; details.append(line);
      }
      const approve = document.createElement('button'); approve.type = 'button';
      approve.textContent = proposal.targets.length === 1 ? 'Suppress this entry' : `Suppress these ${proposal.targets.length} entries`;
      approve.disabled = busy || saving;
      approve.onclick = async () => {
        if (busy || saving) return;
        saving = true; approve.disabled = true; syncControls();
        try {
          view = await window.contextLayer.saveEdit('approve_memory_suppression', { proposal_key: proposal.key,
            proposal_event_id: proposal.event_id, expected_memory_revision: view.memory.revision, expected_revision: view.context.revision });
          listSignature = ''; renderList(); show();
          el('editor-feedback').textContent = 'Approved entries suppressed · original history retained · no model call.';
        } catch (error) { await refresh(); el('editor-feedback').textContent = error.message; }
        finally { saving = false; approve.disabled = busy; syncControls(); }
      };
      details.append(approve); proposals.append(details);
    }
    for (const item of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      const hasDraft = !!drafts[keyOf(item)];
      button.textContent = item.title + (hasDraft ? " · draft" : "");
      button.dataset.item = item.id;
      if (selected?.id === item.id && selected.kind === item.kind)
        button.setAttribute("aria-current", "true");
      button.onclick = () => select(item);
      if (tab !== "documents" && !item.detached) {
        // One click opens a piece; the row previews its start and size.
        const preview = document.createElement("small");
        preview.textContent =
          item.content.length.toLocaleString() +
          " characters · " +
          item.content.slice(0, 140).replace(/\s+/g, " ");
        button.append(preview);
      }
      container.append(button);
    }
    el("editor-note").textContent = !view
      ? "Upload a Markdown or plain text document to start a saved workspace. Up to 100 KB per file."
      : tab === "documents"
        ? rows.length
          ? "Original uploads and current workspace files. Edited originals save as workspace copies."
          : "Upload Markdown or plain text here without sending a message. Up to 100 KB per file."
        : tab === "context"
          ? "Working context · revision " +
            view.context.revision +
            ". References and pinned text are protected."
          : memoryView === 'graph' ? 'Saved memories and named details. Select a memory to inspect or edit it.'
          : "Memory · revision " +
            view.state.revision +
            ". Automatic entries keep their sources and correction history. Edit an entry or add a named detail.";
    if (tab === 'state' && memoryView === 'list' && view?.memory?.capture_summary) {
      const capture = view.memory.capture_summary;
      el('editor-note').textContent += ` ${capture.admitted} automatic entries admitted; ${capture.completed_empty} completed checks admitted none${capture.unknown_counts ? `; ${capture.unknown_counts} older checks have unknown counts` : ''}.`;
    }
  }
  let jevPage = null, jevSignature = '';
  function renderJev() {
    if (tab !== 'jev') return;
    const data = view?.jev, container = el('jev-records');
    if (!data) {
      el('jev-status').textContent = view ? 'Jev telemetry is unavailable from this server.' : 'Open a saved conversation to inspect Jev activity.';
      el('jev-summary').replaceChildren(); container.replaceChildren(); el('jev-usage').textContent = ''; el('jev-earlier').hidden = true;
      return;
    }
    if (jevPage?.conversation !== view.conversation_id || jevPage.revision !== data.revision)
      jevPage = { ...data, conversation: view.conversation_id };
    const signature = JSON.stringify([view.conversation_id, data.revision, jevPage.records.length]);
    if (signature === jevSignature) return;
    jevSignature = signature;
    el('jev-feedback').textContent = '';
    el('jev-status').textContent = `${data.enabled ? 'Enabled' : 'Disabled for this conversation'} · ${data.available ? 'Provider available' : 'Provider unavailable'}. Saved activity remains inspectable.`;
    const s = data.summary, facts = [ ['Calls', `${s.attempts} attempted · ${s.completed} completed · ${s.failed} failed · ${s.missing_responses} without a response`],
      ['Retrieval', `${s.changed_selections} selections changed · ${s.confirmed_baselines || 0} baselines confirmed · ${s.fallbacks} fallbacks · ${s.skipped} skipped`],
      ['Reuse', `${s.cache_hits} cached decisions`],
      ['Local checks', `${s.capture_checks || 0} captures considered · ${s.capture_without_calls || 0} without calls · ${s.local_reviews || 0} context reviews`],
      ...(s.memory_jev_selections ? [['Jev memory', `${s.memory_jev_applied || 0} captures applied · ${s.memory_comparisons || 0} optional task-model comparisons · ${s.memory_comparison_failures || 0} comparison failures`]] : []),
      ...(s.memory_shadows ? [['Memory shadow', `${s.memory_shadows} compared, not applied · ${s.memory_shadow_failures} failed${s.memory_shadow_mean_jaccard == null ? '' : ` · mean overlap ${(s.memory_shadow_mean_jaccard * 100).toFixed(0)}%`}`]] : []),
      ['Latency', `${(s.known_elapsed_ms / 1000).toFixed(2)} s reported${s.unknown_latency_calls ? ` · ${s.unknown_latency_calls} unknown` : ''}`] ];
    el('jev-summary').replaceChildren(...facts.flatMap(([label, value]) => {
      const term = document.createElement('dt'), detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; return [term, detail];
    }));
    el('jev-usage').textContent = `Reported usage: ${s.known_input_tokens.toLocaleString()} input / ${s.known_output_tokens.toLocaleString()} output tokens${s.unknown_usage_calls ? ` · usage unknown for ${s.unknown_usage_calls} call(s)` : ''}.`;
    const openIds = new Set([...container.querySelectorAll('details[open]')].map(d => d.dataset.event));
    container.replaceChildren();
    for (const record of jevPage.records) {
      const detail = document.createElement('details'), summary = document.createElement('summary');
      detail.dataset.event = record.event_id; detail.open = openIds.has(record.event_id);
      summary.textContent = `${record.purpose} · ${record.outcome}${record.cache_hit ? ' · cached' : ''}`;
      detail.append(summary);
      const line = text => { const p = document.createElement('p'); p.className = 'note'; p.textContent = text; detail.append(p); };
      line(new Date(record.timestamp).toLocaleString() + ` · event ${record.seq}`);
      if (record.query) line('Query: ' + record.query);
      if (record.reason || record.error) line(record.error || record.reason);
      if (record.kind === 'call') {
        line(`${record.provider} · ${record.model || 'model unknown'} · ${record.elapsed_ms == null ? 'latency unknown' : record.elapsed_ms + ' ms'}`);
        line(record.usage ? `Usage: ${record.usage.input_tokens ?? 'unknown'} input / ${record.usage.output_tokens ?? 'unknown'} output tokens` : 'Usage unknown');
        if (record.answers) {
          const raw = document.createElement('pre'); raw.textContent = JSON.stringify(record.answers, null, 2); detail.append(raw);
        }
      }
      const labels = ids => ids.map(id => view.source_refs?.[id] || 'historical source').join(', ') || 'none recorded';
      if (record.baseline?.length || record.selected?.length) line(`Baseline: ${labels(record.baseline)} → Selected: ${labels(record.selected)}`);
      if (record.assessment?.threshold != null) line('Confidence threshold: ' + record.assessment.threshold);
      if (record.kind === 'memory_shadow' || record.kind === 'memory_comparison') {
        const picks = list => list ? list.map(r => `¶${r.passage_id} ${r.kind}`).join(', ') || 'none' : 'unavailable';
        line(`Task model: ${picks(record.llm_selection)} · Jev: ${picks(record.jev_selection)}`);
        if (record.comparison) line(`${record.comparison.both} shared · ${record.comparison.kind_matches} same kind · overlap ${(record.comparison.jaccard * 100).toFixed(0)}%`);
      }
      if (record.deferred_passage_ids?.length) line('Uncertain or oversized passages left for review: ' + record.deferred_passage_ids.map(id => `¶${id}`).join(', '));
      if (record.economics) line(`Delegation gate: ${record.economics.allowed ? 'eligible' : 'skipped'} · ${record.economics.reason}. ${record.economics_basis}`);
      for (const candidate of record.candidates || record.supplied_candidates || []) {
        const decision = record.assessment?.decisions?.find(d => d.id === candidate.id);
        const source = candidate.source;
        line(`${candidate.kind || candidate.type || 'candidate'}${source ? ` · characters ${source.offset}–${source.end_offset}` : ''}${decision ? ` · ${decision.category} · confidence ${decision.confidence ?? 'unknown'}${decision.uncertain ? ' (uncertain)' : ''}` : ''}`);
        const excerpt = document.createElement('blockquote'); excerpt.textContent = candidate.excerpt || candidate.passage || ''; detail.append(excerpt);
        if (candidate.id && view.source_refs?.[candidate.id]) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button';
          button.textContent = 'Open ' + (source?.title || source?.sourceRef || view.source_refs[candidate.id]);
          button.onclick = () => inspect({ id: candidate.id }, true, true); detail.append(button);
        }
      }
      for (const entry of record.entries || []) line(`${entry.action} · priority ${entry.priority ?? 'unknown'} · ${entry.reason || ''}`);
      container.append(detail);
    }
    if (!jevPage.records.length) container.textContent = 'No Jev calls or retrieval decisions recorded yet.';
    el('jev-earlier').hidden = !jevPage.has_more;
  }
  el('jev-earlier').onclick = async () => {
    const conversation = view?.conversation_id, revision = jevPage?.revision, cursor = jevPage?.before_cursor;
    if (!conversation || !cursor) return;
    el('jev-earlier').disabled = true;
    try {
      const page = await window.contextLayer.readJevAudit(cursor);
      if (view?.conversation_id !== conversation || jevPage?.revision !== revision) return;
      jevPage.records.push(...page.records); jevPage.before_cursor = page.before_cursor; jevPage.has_more = page.has_more;
      renderJev();
    } catch (error) { el('jev-feedback').textContent = error.message; }
    finally { el('jev-earlier').disabled = false; }
  };
  function show() {
    if (!selected) {
      el("editor-document").hidden = true;
      return;
    }
    const d = draft();
    el("editor-document").hidden = false;
    el("editor-use").hidden = selected.kind !== "document";
    const removable = ['document', 'source'].includes(selected.kind) && !selected.historical && !selected.detached;
    el('editor-remove').hidden = !removable;
    el('editor-removal-note').hidden = !removable;
    const automatic = selected.kind === 'memory';
    el('editor-memory-suppress').hidden = !automatic || selected.historical || ['invalidated', 'superseded'].includes(selected.section?.lifecycle);
    el('editor-memory-suppress').textContent = selected.section?.lifecycle === 'suppressed' ? 'Use this again' : "Don't use this";
    el('editor-memory-note').hidden = !automatic;
    el('editor-memory-note').textContent = 'Suppression excludes this memory and its source passages from model lookup. History and exports retain the original. Editing records your correction without a model call.';
    el('editor-memory-sources').hidden = !automatic;
    el('editor-memory-sources').replaceChildren(...(automatic ? selected.section.source_refs.map(ref => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = 'Open source ' + (view.source_refs?.[ref.event_id] || ref.event_id);
      button.onclick = () => inspect({ id: ref.event_id }, true, true); return button;
    }) : []));
    const connections = ['memory', 'state'].includes(selected.kind)
      ? window.memoryGraph?.connections(selected.kind, selected.id) || [] : [];
    el('editor-memory-connections').hidden = !connections.length;
    el('editor-memory-connections').replaceChildren(...connections.map(connection => {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${connection.label}: ${connection.target.content.slice(0, 65)}`;
      button.title = connection.target.id + ' · ' + connection.target.status;
      button.onclick = () => window.memoryGraph.open(connection.target);
      return button;
    }));
    el("editor-title").textContent = selected.title;
    el("editor-meta").textContent = selected.historical
      ? "Saved historical text · read only"
      : selected.kind === "document"
        ? "Workspace file · source " +
          (view.source_refs?.[selected.token] || "historical")
        : selected.kind === "source"
          ? "Original source · preserved in history. Edit creates a workspace copy."
          : "Source-linked " +
            (selected.kind === "state" ? "memory entry" : "context piece") +
            (selected.protected ? " · protected" : "");
    if (selected.kind === 'state' && selected.section)
      el('editor-meta').textContent += ` · ${selected.section.effective_status || selected.section.status} · ${selected.section.resolution?.status || 'unresolved'} · confidence unknown`;
    if (automatic) el('editor-meta').textContent += ` · ${selected.id} · ${selected.section.lifecycle} · ${selected.section.projection_tier || 'archive'} in last projection`;
    if (automatic && selected.section.retention) el('editor-memory-note').textContent += ` Retention: ${selected.section.retention.reason}; ${selected.section.retention.interpretation ? 'controller inference' : 'human action'}.`;
    if (selected.kind === 'document' && selected.author) {
      const author = selected.author;
      const who = author.actor === 'human' ? 'You' :
        (author.provider === 'anthropic' ? 'Claude' : author.provider === 'openai' ? 'GPT' : author.actor) +
          ' · ' + (author.model || 'model unknown');
      el('editor-meta').textContent += ' · Last edit by ' + who;
    }
    if (selected.section?.type === 'evidence' && selected.section.source_event_ids.length === 1) {
      const file = view.workspace?.find(f => f.source_event_id === selected.section.source_event_ids[0]);
      if (file && selected.content === `Workspace ${file.path}; source ${file.source_event_id}.\n${file.content.slice(0, 2000)}` && file.content.length > 2000)
        el('editor-meta').textContent += ` · Partial excerpt: first 2000 characters; ${file.content.length - 2000} more characters. Open the file in Files for full text.`;
    }
    const section = selected.section,
      identifiers = el("editor-identifiers");
    identifiers.hidden = !section && selected.kind !== "source";
    el("editor-identifiers-text").textContent = section
      ? [
          `${section.segmentRef || view.segment_refs?.[section.id] || "Historical segment"} · canonical: ${section.id}`,
          "References are local to this conversation; new versions receive new segment references.",
          ...(
            section.sourceRefs ||
            section.source_event_ids.map((id) => ({
              id,
              sourceRef: view.source_refs?.[id],
            }))
          ).map(
            (s) => `Source ${s.sourceRef || "historical"} · canonical: ${s.id}`,
          ),
          ...(section.parentRefs || []).map(
            (s) => `Derived from ${s.segmentRef} · canonical: ${s.id}`,
          ),
          ...(section.protection?.reasons || []).map(
            (r) => `Model protection: ${r.label} (${r.lifetime})`,
          ),
          section.protection?.advisory
            ? `Selector advice: ${section.protection.advisory.action}; this advice is not a run lock.`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : `Source ${view.source_refs?.[selected.id] || "historical"} · canonical: ${selected.id}`;
    if (automatic) {
      const authority = { user_committed: 'Your instruction', user_reported: 'Your report', model_proposed: 'Model proposal', externally_reported: 'External report' }[section.authority] || section.authority;
      el('editor-meta').textContent = `${authority} · ${section.resolution} · ${section.lifecycle} · ${section.active ? 'active in last selection' : 'outside last selection'} · scope: ${section.scope.objective_id ? 'Agent objective' : 'this conversation'} · confidence unknown`;
    }
    const history = el('editor-history'), revisions = selected.section?.relations?.supersedes || [];
    history.hidden = !['state', 'memory'].includes(selected.kind) || !revisions.length;
    el("editor-history-items").replaceChildren(
      ...revisions.map((id) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent =
          "Open previous revision · " +
          (view.segment_refs?.[id] || "historical segment");
        button.onclick = () => {
          if (automatic) {
            const old = view.memory.records.find(r => r.memory_id === id);
            if (old) select(memoryItem(old, true));
          } else inspect({ id, state_key: selected.section.state_key }, false, true);
        };
        return button;
      }),
    );
    el('editor-reference').hidden = !selected.section?.ref_bundle_id;
    el("editor-reference").textContent =
      "Open original context " + (selected.section?.referenceRef || "");
    el('editor-reference').onclick = () => inspect({ id: selected.section.ref_bundle_id }, false, true);
    el("editor-edit").hidden =
      editing || !!selected.protected || !!selected.historical;
    el("editor-preview-toggle").hidden = !editing;
    el("editor-preview-toggle").textContent = preview ? "Text" : "Preview";
    el("editor-discard").hidden = !d;
    el("editor-save").hidden = !editing;
    el("editor-save").textContent =
      selected.kind === "source" ? "Save workspace copy" : "Save";
    el("editor-path-row").hidden = !editing || selected.kind !== "source";
    el("editor-state-fields").hidden = !editing || selected.kind !== "state";
    el('editor-memory-kind-row').hidden = !editing || !automatic;
    el("editor-text").hidden = !editing || preview;
    el("editor-preview").hidden = editing && !preview;
    if (d) {
      el("editor-text").value = d.text;
      el("editor-path").value = d.path || "";
      el("editor-state-key").value = d.stateKey || "";
      el("editor-state-key").disabled = !selected.newEntry;
      el("editor-state-type").value = d.type || "constraint";
      el("editor-state-status").value = d.status || "active";
      el('editor-memory-kind').value = d.memoryKind || 'claim';
    }
    renderPreview(d?.text ?? selected.content);
    el("editor-feedback").textContent = selected.protected
      ? "This text is protected from direct editing."
      : "";
    syncControls();
  }
  function select(item) {
    inspection++;
    saveError = "";
    selected = item;
    editing = !!draft();
    preview = false;
    renderList();
    show();
    if (item && tab !== "documents") el("editor-pane").scrollTop = 0;
  }
  function setTab(value) {
    inspection++;
    saveError = "";
    tab = value;
    panel.dataset.tab = tab;
    selected = null;
    editing = false;
    for (const button of el("editor-tabs").querySelectorAll("button")) {
      const active = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    el("editor-pane").setAttribute("aria-labelledby", "tab-" + tab);
    renderList();
    const pending = Object.values(drafts).find(
      (d) =>
        d.conversation === view?.conversation_id &&
        (tab === "documents"
          ? ["document", "source"].includes(d.item.kind)
          : d.item.kind === tab),
    );
    select(pending?.item || (tab === "documents" && items()[0]) || null);
  }
  function adopt(data) {
    if (data?.view_kind === 'transcript') {
      // A transcript carries no editable context. Clear the previous chat's
      // editor, then read authoritative details only if Workspace is visible.
      adopt(null);
      if (!panel.hidden) refresh();
      return;
    }
    const changed = view?.conversation_id !== data?.conversation_id;
    if (
      !changed &&
      data &&
      view &&
      data.context.revision < view.context.revision
    )
      return;
    if (changed) inspection++;
    if (changed && !saving) el("editor-upload-status").textContent = "";
    view = data;
    if (changed) {
      auditPage = null;
      auditGeneration++;
      el("editor-audit-kind").value = "context";
      setTab(tab);
      return;
    }
    if (selected && !draft()) selected = latest() || null;
    renderList();
    show();
  }
  async function refresh() {
    if (loading || !window.contextLayer?.currentId()) return;
    const id = window.contextLayer.currentId();
    loading = true;
    try {
      const data = await window.contextLayer.refreshView();
      if (id === window.contextLayer.currentId()) adopt(data);
    } catch (error) {
      el("editor-feedback").textContent =
        error.message + " Your draft is preserved.";
    } finally {
      loading = false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!panel.hidden && !document.hidden)
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, 2500);
  }
  function open(next) {
    if (panel.hidden) {
      panel.hidden = false;
      document.body.classList.add("workspace-visible");
      el("workspace-open").setAttribute("aria-expanded", "true");
      if (window.contextLayer?.editorView())
        adopt(window.contextLayer.editorView());
      refresh();
      schedule();
      el("editor-close").focus();
    }
    if (next && next !== tab) setTab(next);
    layout();
  }
  function close() {
    inspection++;
    panel.hidden = true;
    document.body.classList.remove("workspace-visible");
    clearTimeout(timer);
    el("workspace-open").setAttribute("aria-expanded", "false");
    layout();
  }
  function beginEdit() {
    if (!selected || selected.protected || selected.historical) return;
    const path =
      (selected.name || "document.md")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/^[^a-zA-Z0-9_-]+/, "") || "document.md";
    drafts[keyOf(selected)] = {
      conversation: view.conversation_id,
      item: selected,
      text: selected.content,
      token: selected.token,
      revision: view.context.revision,
      memoryRevision: view.memory?.revision,
      memoryKind: selected.section?.kind,
      path: selected.kind === "document" ? selected.path : path,
      stateKey: selected.section?.state_key || "",
      type: selected.section?.type || "constraint",
      status: selected.section?.status || "active",
    };
    editing = true;
    preview = false;
    persist();
    renderList();
    show();
    el("editor-text").focus();
  }
  function capture() {
    const d = draft();
    if (!d) return;
    saveError = "";
    Object.assign(d, {
      text: el("editor-text").value,
      path: el("editor-path").value,
      stateKey: el("editor-state-key").value,
      type: el("editor-state-type").value,
      status: el("editor-state-status").value,
      memoryKind: el('editor-memory-kind').value,
    });
    persist();
    syncControls();
  }
  async function save() {
    const d = draft();
    if (!d || saving || busy || stale()) return;
    capture();
    saving = true;
    syncControls();
    const original = selected,
      originalKey = keyOf(selected);
    try {
      const input =
        selected.kind === "document" || selected.kind === "source"
          ? {
              path: selected.kind === "document" ? selected.path : d.path,
              content: d.text,
              expected_source_event_id:
                selected.kind === "document" ? d.token : null,
              ...(selected.kind === "source"
                ? { copied_from_source_event_id: selected.token }
                : {}),
            }
          : selected.kind === 'memory'
            ? { memory_id: selected.id, content: d.text, kind: d.memoryKind, expected_memory_revision: d.memoryRevision }
          : selected.kind === "context"
            ? {
                bundle_id: selected.id,
                content: d.text,
                expected_revision: d.revision,
              }
            : {
                key: d.stateKey,
                type: d.type,
                status: d.status,
                content: d.text,
                expected_revision: d.revision,
                expected_bundle_id: d.token,
              };
      const action = ["document", "source"].includes(selected.kind)
        ? "document_save"
        : selected.kind === 'memory' ? 'memory_save'
        : selected.kind === "context"
          ? "context_save"
          : "state_save";
      const data = await window.contextLayer.saveEdit(action, input);
      delete drafts[originalKey];
      persist();
      view = data;
      if (original.kind === 'memory') {
        const replacement = data.memory.records.find(r => r.supersedes.includes(original.id));
        selected = replacement ? memoryItem(replacement) : null;
      }
      if (original.kind === "source") {
        tab = "documents";
        selected = documents().find(
          (i) => i.kind === "document" && i.path === input.path,
        );
      } else if (original.kind === "context") {
        const section = data.context.segments.find((s) =>
          s.parent_bundle_ids.includes(original.id),
        );
        selected = section
          ? {
              kind: "context",
              id: section.id,
              token: section.id,
              title: segmentLabel(section),
              content: section.content,
              section,
            }
          : null;
      } else if (original.newEntry)
        selected = { kind: "state", id: d.stateKey, title: d.stateKey };
      if (selected) selected = latest(selected) || selected;
      editing = false;
      preview = false;
      renderList();
      show();
      el("editor-feedback").textContent =
        "Saved · new version recorded · no model call.";
    } catch (error) {
      await refresh();
      saveError = error.message + " Your draft is preserved.";
    } finally {
      saving = false;
      syncControls();
    }
  }
  // `stay` opens the piece where the reader already is, whatever its kind, so
  // the garden and the way back remain in view.
  async function inspect(item, source, stay = false) {
    const id = window.contextLayer?.currentId();
    if (!id) return;
    const target = stay
      ? panel.hidden || tab === "documents" ? "context" : tab
      : source ? "documents" : item.state_key ? "state" : "context";
    open();
    if (!stay || tab !== target) setTab(target);
    if (stay) contextView = "pieces";
    const generation = ++inspection;
    // Request breakdowns name pieces by their S reference.
    if (!item.id && item.ref)
      item = { ...item, id: Object.keys(view?.segment_refs || {}).find((key) => view.segment_refs[key] === item.ref) || item.ref };
    const pool = !view ? [] : stay ? [...documents(), ...segments("context"), ...segments("state")] : items();
    const current = pool.find((i) => i.token === item.id);
    if (current) {
      select(current);
      return;
    }
    try {
      const data = await window.contextLayer.readItem(
        source ? "source" : "context",
        item.id,
      );
      if (id !== window.contextLayer.currentId() || generation !== inspection)
        return;
      select(
        source
          ? {
              kind: "source",
              id: data.id,
              token: data.id,
              title: `${data.sourceRef || "Historical source"} · ${data.metadata?.filename || "Saved " + data.kind}`,
              content: data.content,
              historical: true,
            }
          : {
              kind: item.state_key ? "state" : "context",
              id: data.id,
              token: data.id,
              title: segmentLabel(data),
              content: data.content,
              historical: true,
              section: data,
            },
      );
    } catch (error) {
      if (generation === inspection)
        el("editor-feedback").textContent = error.message;
    }
  }
  el("workspace-open").onclick = () => (panel.hidden ? open() : close());
  el("editor-close").onclick = () => {
    close();
    el("workspace-open").focus();
  };
  el("editor-back").onclick = () => {
    const from = selected;
    select(null);
    if (tab === 'state' && memoryView === 'graph') {
      window.memoryGraph?.focus(from?.kind, from?.id);
      return;
    }
    [...el("editor-items").querySelectorAll("button")]
      .find((button) => button.dataset.item === from?.id)
      ?.focus();
  };
  el('memory-views').onclick = event => {
    const button = event.target.closest('[data-view]');
    if (!button || saving) return;
    memoryView = button.dataset.view;
    renderList(); syncControls();
  };
  el("context-views").onclick = (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    contextView = button.dataset.view;
    renderList();
  };
  el("editor-upload").onclick = () => el("editor-upload-file").click();
  el("editor-upload-file").onchange = async () => {
    const input = el("editor-upload-file"), file = input.files[0];
    input.value = "";
    if (!file || saving || busy) return;
    const id = window.contextLayer.currentId(), generation = sessionGeneration;
    const status = el("editor-upload-status");
    saving = true;
    status.classList.remove("error");
    status.textContent = "Uploading " + file.name + "…";
    syncControls();
    try {
      if (!/\.(md|markdown|txt)$/i.test(file.name) || file.size > 100000)
        throw Error("Choose a Markdown or plain text document (.md, .markdown, .txt) up to 100 KB.");
      const bytes = await file.arrayBuffer();
      let content;
      try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw Error("The document must be UTF-8 text. Export it as Markdown or plain text and try again."); }
      if (id !== window.contextLayer.currentId() || generation !== sessionGeneration)
        throw Error("The active chat changed. Upload again in the intended workspace.");
      const previous = new Set((view?.workspace || []).map(f => f.source_event_id));
      const data = await window.contextLayer.uploadDocument({ name: file.name, content });
      view = data;
      setTab("documents");
      const fileItem = documents().find(item => item.kind === "document" && !previous.has(item.token));
      if (fileItem) select(fileItem);
      status.textContent = "Uploaded " + (fileItem?.path || file.name) + " · reference it in chat when ready.";
    } catch (error) {
      status.classList.add("error");
      status.textContent = error.message;
    } finally {
      saving = false;
      syncControls();
    }
  };
  el("editor-use").onclick = () => {
    if (selected?.kind !== "document" || busy || saving) return;
    const composer = document.querySelector("#composer textarea");
    const reference = 'Workspace document: "' + selected.path + '"';
    composer.value = composer.value.trimEnd() + (composer.value.trim() ? "\n" : "") + reference;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    composer.focus();
  };
  el("editor-edit").onclick = beginEdit;
  let counting = false,
    telemetrySignature = "",
    countedFingerprint = null,
    auditPage = null,
    auditGeneration = 0;
  async function loadAudit(before = 0) {
    if (!view) return;
    const id = view.conversation_id,
      generation = ++auditGeneration,
      kind = el("editor-audit-kind").value;
    el("editor-audit-status").textContent = "Loading activity…";
    try {
      const page = await window.contextLayer.readAudit(kind, before);
      if (id !== view?.conversation_id || generation !== auditGeneration)
        return;
      if (kind === 'context' && !before) {
        auditPage = null;
        if (page.cursor >= (view.context_audit?.cursor || 0)) view.context_audit = page;
      } else auditPage = { ...page, historical: !!before, kind };
      telemetrySignature = "";
      renderTelemetry();
    } catch (error) {
      if (generation === auditGeneration)
        el("editor-audit-status").textContent = error.message;
    }
  }
  el("editor-audit-kind").onchange = () => loadAudit();
  el("editor-audit-earlier").onclick = () =>
    loadAudit((auditPage || view?.context_audit)?.before_cursor || 0);
  el("editor-audit-latest").onclick = () => {
    auditPage = null;
    loadAudit();
  };
  const countLabel = method => method === 'openai-input-token-count' ? 'OpenAI preflight count'
    : method === 'anthropic-preflight-estimate' ? 'Anthropic preflight estimate' : 'local tokenizer estimate · o200k_base';
  const tokenFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  function renderTelemetry() {
    // The top-bar shortcut carries the size of the last request sent.
    const sentTokens = view?.model_input?.latest?.input_tokens;
    el("context-watch-label").textContent =
      "Context" + (sentTokens == null ? "" : " · " + tokenFormat.format(sentTokens));
    el("context-watch").title = sentTokens == null
      ? "See what the model was sent"
      : `Last request: ${sentTokens.toLocaleString()} input tokens. See what filled it.`;
    if (!view) return;
    const m = view.model_input, next = m?.next;
    if (countedFingerprint && countedFingerprint !== next?.fingerprint) {
      el('editor-count-status').textContent = 'The saved request changed. Its previous provider count no longer applies.';
      countedFingerprint = null;
    }
    const facts = next ? [
      [next.continuation_included ? "Running" : "Saved", `${next.model} · ${next.provider_count == null || next.provider === "anthropic" ? "~" : ""}${next.estimated_tokens.toLocaleString()} input tokens · ${countLabel(next.method)} · ${next.continuation_included ? "pending tool continuation included" : "no pending tool continuation"}`],
      ["Last sent", `${m.latest?.input_tokens?.toLocaleString() ?? "unknown"} reported input tokens · ${m.latest?.tokenizer_tokens?.toLocaleString() ?? "unknown"} local estimate with continuation · revision ${m.latest?.revision ?? "?"}`],
      ["Limits", `Byte guard ${m.byte_guard.toLocaleString()} · output reserve ${m.output_reserve.toLocaleString()} tokens · unsent draft excluded`],
    ] : [["Saved", "Input count unavailable."]];
    el("editor-token-summary").replaceChildren(...facts.flatMap(([term, value]) => {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      return [dt, dd];
    }));
    const audit = auditPage || view.context_audit;
    el("editor-audit-earlier").disabled = !audit?.has_more;
    el("editor-audit-status").textContent = auditPage?.historical
      ? "Earlier saved activity. Choose Latest to return to current activity."
      : auditPage ? "Saved activity. Choose Latest to refresh this filter." : "Latest saved activity.";
    const signature = JSON.stringify([view.conversation_id, audit]);
    if (signature === telemetrySignature) return;
    telemetrySignature = signature;
    const container = el('editor-audit');
    container.replaceChildren();
    const records = audit?.records || [];
    if (!records.length) { container.textContent = 'No context-management activity recorded yet.'; return; }
    for (const record of records.slice().reverse()) {
      const detail = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('p');
      summary.textContent = `${record.outcome} · ${record.label} · ${new Date(record.timestamp).toLocaleString()}`;
      text.className = 'note';
      text.textContent = [
        record.trigger,
        record.selection_source,
        record.model,
        record.reason,
        record.selection_outcome,
        record.cache_hit ? "saved decision reused; no selector call" : null,
        record.request_id ? "Request " + record.request_id : null,
        record.revision == null
          ? null
          : `revision ${record.previous_revision ?? "?"} → ${record.revision}`,
        record.before_context_text_tokens == null
          ? null
          : `Context text: ${record.before_context_text_tokens} → ${record.after_context_text_tokens} o200k_base tokens (text only)`,
        record.error,
      ]
        .filter(Boolean)
        .join(" · ");
      detail.append(summary, text);
      for (const entry of record.entries || []) {
        const line = document.createElement('p'), button = document.createElement('button');
        line.className = 'note';
        line.textContent = `${entry.protected ? 'Protected' : entry.action} · ${entry.reason || ''}`;
        button.type = 'button';
        button.className = 'link-button';
        button.textContent =
          "Open context " +
          (entry.segmentRef ||
            view.segment_refs?.[entry.bundle_id] ||
            "historical segment");
        button.onclick = () => inspect({ id: entry.bundle_id }, false, true);
        line.append(' ', button);
        detail.append(line);
      }
      if (record.entries_omitted) {
        const omitted = document.createElement("p");
        omitted.className = "note";
        omitted.textContent = `${record.entries_omitted} additional entries; canonical export contains all ${record.entry_count}.`;
        detail.append(omitted);
      }
      for (const item of record.blocked || []) {
        const blocked = document.createElement("p");
        blocked.className = "note";
        blocked.textContent = `${item.segmentRef || "Segment"} blocked: ${item.reasons.map((r) => r.label).join(", ")}.`;
        detail.append(blocked);
      }
      if (record.selected_ids.length || record.offloaded_ids.length || record.retained_ids.length) {
        const actions = document.createElement('p'); actions.className = 'note';
        actions.textContent = `Selected to compact: ${record.selected_ids.length}; selected to offload: ${record.offloaded_ids.length}; retained by selection: ${record.retained_ids.length}. Proposal counts describe intent; applied records establish changes.`;
        detail.append(actions);
      }
      container.append(detail);
    }
  }
  function renderRemoved() {
    const container = el('editor-removed');
    container.hidden = tab !== 'documents' || !view?.removed_documents?.length;
    container.replaceChildren();
    if (container.hidden) return;
    const detail = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'Removed documents · ' + view.removed_documents.length;
    detail.append(summary);
    for (const item of view.removed_documents) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = 'Restore ' + item.name;
      button.disabled = busy || saving || view.busy || view.agent?.status === 'running';
      button.onclick = () => changeDocument({ operation: 'restore', path: item.path, source_event_id: item.source_event_id, expected_change_id: item.change_id });
      detail.append(button);
    }
    container.append(detail);
  }
  async function changeDocument(input) {
    if (saving || busy || view?.agent?.status === 'running') return;
    saving = true; syncControls();
    try {
      const data = await window.contextLayer.saveEdit('document_lifecycle', input);
      adopt(data);
      el('editor-upload-status').textContent = input.operation === 'remove'
        ? 'Removed. Restore it below. Historical content and previous replies remain saved.'
        : 'Restored to Files. Removed context pieces are not automatically reinserted.';
    } catch (error) { el('editor-upload-status').textContent = error.message; }
    finally { saving = false; syncControls(); }
  }
  el('editor-remove').onclick = () => changeDocument({ operation: 'remove',
    path: selected.kind === 'document' ? selected.path : null,
    source_event_id: selected.kind === 'source' ? selected.id : null, expected_source_event_id: selected.token });
  el('editor-token-count').onclick = async () => {
    if (counting || !view) return;
    counting = true; syncControls();
    const id = view.conversation_id;
    el('editor-count-status').textContent = 'Counting the saved request with its provider…';
    try {
      const result = await window.contextLayer.countTokens();
      if (view?.conversation_id === id) el('editor-count-status').textContent = result.count.error ||
        `${result.count.provider_count.toLocaleString()} input tokens · ${countLabel(result.count.method)}. Counted ${new Date(result.count.measured_at).toLocaleString()}.`;
      if (view?.conversation_id === id) countedFingerprint = result.count.fingerprint;
    } catch (error) { if (view?.conversation_id === id) el('editor-count-status').textContent = error.message; }
    finally { counting = false; syncControls(); }
  };
  el("editor-save").onclick = save;
  for (const id of [
    "editor-text",
    "editor-path",
    "editor-state-key",
    "editor-state-type",
    "editor-state-status",
    "editor-memory-kind",
  ])
    el(id).addEventListener("input", capture);
  el("editor-preview-toggle").onclick = () => {
    capture();
    preview = !preview;
    show();
  };
  el("editor-discard").onclick = () => {
    if (!confirm("Discard this unsaved draft?")) return;
    delete drafts[keyOf(selected)];
    persist();
    editing = false;
    selected = selected.newEntry ? null : latest();
    renderList();
    show();
  };
  el("editor-latest").onclick = async () => {
    if (
      !confirm(
        "Replace this draft with the latest saved text? Download or copy your changes first.",
      )
    )
      return;
    const item = selected;
    delete drafts[keyOf(item)];
    persist();
    editing = false;
    await refresh();
    select(latest(item));
  };
  el("editor-download").onclick = () => {
    const text = draft()?.text ?? selected.content;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download =
      draft()?.path ||
      selected.path ||
      selected.name ||
      selected.title.replace(/[^a-zA-Z0-9._-]/g, "_") + ".md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el("editor-new-state").onclick = () => {
    const item = {
      kind: "state",
      id: "new_" + crypto.randomUUID(),
      title: "New memory entry",
      content: "",
      token: null,
      newEntry: true,
    };
    select(item);
    beginEdit();
    el("editor-state-key").focus();
  };
  el('editor-memory-copy').onclick = async () => {
    if (!view) return;
    const snapshot = { inspection_only: true, conversation_id: view.conversation_id,
      memory_revision: view.memory?.revision, state_revision: view.state.revision,
      automatic: (view.memory?.records || []).map(r => ({ memory_id:r.memory_id, kind:r.kind, content:r.content,
        authority:r.authority, binding:r.binding, resolution:r.resolution, lifecycle:r.lifecycle, active:r.active,
        scope:r.scope, source_refs:r.source_refs, supersedes:r.supersedes, conflicts_with:r.conflicts_with })),
      named: view.state.entries.map(s => ({key:s.state_key, type:s.type, content:s.content, status:s.effective_status || s.status,
        resolution:s.resolution, source_event_ids:s.source_event_ids, attribution:s.attribution})),
      capture_issues:view.memory?.capture_issues || [], suppression_note:'Suppression stops reuse; stored history is retained.' };
    const text = 'Memory snapshot for inspection:\n```json\n' + JSON.stringify(snapshot, null, 2) + '\n```';
    try {
      await navigator.clipboard.writeText(text);
      el('editor-memory-copy').textContent = 'Copied memory snapshot';
      setTimeout(() => { el('editor-memory-copy').textContent = 'Copy memory snapshot'; }, 2000);
    } catch {
      const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'})), link = document.createElement('a');
      link.href = url; link.download = 'memory-snapshot.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  el("editor-tabs").onclick = (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) setTab(button.dataset.tab);
  };
  el("editor-tabs").onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = ["documents", "context", "state"],
      index = tabs.indexOf(tab);
    setTab(
      tabs[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3
      ],
    );
    el("tab-" + tab).focus();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      el("workspace-open").focus();
    }
  });
  document.addEventListener("visibilitychange", schedule);
  el('editor-memory-suppress').onclick = async () => {
    if (saving || busy || !selected || selected.kind !== 'memory') return;
    saving = true; syncControls();
    try {
      const original = selected.id;
      const data = await window.contextLayer.saveEdit('memory_lifecycle', {
        memory_id: original, operation: selected.section.lifecycle === 'suppressed' ? 'restore' : 'suppress', expected_memory_revision: view.memory.revision });
      view = data; selected = memoryItem(data.memory.records.find(r => r.memory_id === original));
      renderList(); show();
    } catch (error) { el('editor-feedback').textContent = error.message; }
    finally { saving = false; syncControls(); }
  };
  function openMemory(id) {
    const r = view?.memory?.records.find(r => r.memory_id === id);
    if (!r) return;
    open('state'); select(memoryItem(r));
  }
  window.workspaceEditor = { adopt, syncControls, inspect, close, open, openMemory };
  if (window.contextLayer?.editorView())
    adopt(window.contextLayer.editorView());
})();
