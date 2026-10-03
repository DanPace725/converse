# Developing with Conclave principles

Persistent trajectory, mutable context applies to project knowledge as well as model input. Preserve the record; keep a small working view of what matters now.

## Translate the principles

| Conclave principle | Project practice |
|---|---|
| Persistent trajectory | Preserve original plans, experiments, comparisons, and results in dated archives and Git history. |
| Mutable projection | Keep PROJECT_CONTEXT.md current: capabilities, demonstrated results, and unapplied work. Replace superseded entries in place. |
| Bounded attention | Read the context file, the relevant usage doc, and the code involved in the task. Retrieve historical detail when it affects a decision. |
| Lineage and recovery | Link consequential results and decisions to their source report, test, export, or implementation. Keep those sources recoverable. |
| Selection before transformation | First choose what matters. Remove repetition and completed backlog items; rewrite only the material still useful. |
| Multiple representations | Use a short result in active context, a focused excerpt for current work, and the full record in the archive. |
| Explicit state | Separate implemented behavior, observed results, proposals, and open work. Move an item when its status changes. |
| Accountable correction | Update the current conclusion and retain the earlier evidence. A summary carries the source's meaning and decision status. |
| Whole-task economics | Judge a change by useful completion, context capacity, recovery, fidelity, and total cost. Count management, retries, tools, and caching. |

## Working cycle

1. **Orient.** Read PROJECT_CONTEXT.md. Confirm the affected implementation and identify the result the task should improve.
2. **Retrieve.** Open the smallest relevant source set. Follow an archive link for rationale, exact measurements, or an unresolved choice.
3. **Develop.** Implement the authorized change. Shared engine work starts in Conclave; Converse's vendored snapshot has additional hosted/provider/UI adaptations documented in VENDORED.md. Check both copies when changing shared behavior.
4. **Demonstrate.** Check the changed behavior with a focused test or replay. For performance claims, compare completed workloads and actual usage; distinguish saved text, request tokens, cache buckets, and cost.
5. **Compact.** Update capabilities and demonstrated results; remove completed work from the pending list. Archive detailed reports and superseded discussion. Keep operational instructions in the usage docs.
6. **Handoff.** Leave the current result, its evidence, and the remaining work in PROJECT_CONTEXT.md. The next session starts there.

This method manages project documents. Source code remains the implementation and receives normal development and review.
