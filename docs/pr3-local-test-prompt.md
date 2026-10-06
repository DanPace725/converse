You are testing whether Jev, a cheap typed-decision model (TypeSafe API), can make Conclave's automatic memory-selection decision as well as the chat model does today. The code is in two PRs on branch `ccr-573c3268-raip8k`: DanPace725/conclave#3 (engine and evaluation) and DanPace725/converse#22 (the same engine synced into Converse, plus the Workspace panel). Work locally in the `conclave` and `converse` checkouts.

## What we are trying to learn

Today, automatic memory extraction asks the selected chat model to choose which numbered paragraphs of a turn to save, and as which kind (preference, claim or question). PR #3 makes Jev judge the same paragraphs alongside it, in shadow. Jev's picks are recorded as a `memory_shadow` event and never saved. The question:

**On hand-labeled paragraphs, does Jev pick memories about as well as the chat model, at much lower cost and latency, and how often is it unsure enough to need a chat-model fallback?**

"Jev agreed with the chat model" is not the answer. Both selectors are graded against labels. Overall answer quality and whole-task token savings are out of scope here.

## Setup

1. Check out `ccr-573c3268-raip8k` in both repos and run `npm install`. Node must be 22.13 or newer.
2. Baseline checks:
   - In Conclave: `node scripts/test.js` and `node scripts/check.js`. Expect 250 to pass, with 1 optional test skipped.
   - In Converse: `npm test`. Expect 188 to pass, with 1 skipped.
   - Then, from Conclave: `node scripts/sync-converse.js --check --target ../converse` must pass.
   - If any of these fail, stop and report.
3. Credentials come from environment variables: `TYPESAFE_API_KEY` or `JEV_API_KEY`, and `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`. Never print, log, commit or paste key values.
4. Read these files before starting:
   - `docs/AUTOMATIC_MEMORY.md`, especially "Jev memory-selection shadow"
   - `src/jev.js` (`selectMemory`)
   - `src/memory-controller.js` (`captureMemory`, `shadowMemory`)
   - `src/memory-evaluation.js`
   - `scripts/evaluate-memory-selection.js`
5. Total spend cap: US$3 across all live calls. Track it from the scoring reports' `usd` fields and the provider usage. Stop and report if you are about to exceed it.

## Step 1: Check that the live Jev API accepts the request format

The new memory-selection request has never been sent to the real API; only fakes were used. Build a tiny label file by hand: `version: "memory-labels-v1"` and 2 items with 3 to 4 short synthetic paragraphs each, labeled. Run:

`node scripts/evaluate-memory-selection.js score tiny.json --jev --out tiny-report.json`

Confirm there are no errors, and that each paragraph got a decision with a confidence and probabilities.

If the API rejects the request, record the exact error. Do not paste server response bodies, which could contain credentials. Then make the smallest fix in `src/jev.js` that matches the request shape already proven by `assess()` / `select()`, rerun the tests, and note the fix in your report. Do not change anything else in the engine.

## Step 2: Gather real material

Get 3 or more real conversations (ideally 5 to 10) that include completed assistant research answers and some human turns stating preferences, constraints or decisions.

- **Preferred:** existing canonical exports. These are JSON files with `context_layer.events` or top-level `events`, for example the "Pain" conversation export Dan has used for replays. Ask Dan where they are if you can't find them.
- **Also:** create at least one new conversation through the service path, which enables both memory extraction and Jev. Use the Converse app, or the Conclave service commands (see `src/service-cli.js` and `node src/cli.js --help`). Plain `cli.js chat` does not enable memory extraction.

  To make extraction run:
  - include human turns containing words like "preference", "budget", "constraint", "requirement" or "decided";
  - and/or have an assistant research turn with 3 or more source reads (`web_fetch`, `workspace_read` or `retrieve_event`), followed by another human turn.

  Then export the conversation (the `export` service method, or `node src/cli.js export PATH --conversation ID`).

  In that live conversation, confirm the following:
  - `memory_shadow` events exist with `applied: false`;
  - saved memories match only the chat model's picks (`llm.records`), never extra Jev picks;
  - a `memory-selection` request appears with provider `typesafe`;
  - Jev telemetry shows `memory_shadows`.

  If you run it in Converse, also confirm that the Workspace Jev panel shows the "Memory shadow" row and the per-capture lines.

## Step 3: Label without seeing the selectors' picks

For each export:

`node scripts/evaluate-memory-selection.js prepare EXPORT.json --out labels-<name>.json`

This also writes `labels-<name>.recorded.json` when shadows exist. **Do not open the recorded file, and do not run any selector, until labeling is finished.**

Label every paragraph with one of:
- `preference`: the human states how they want the work done, or a choice they made.
- `claim`: a specific finding, quantity, sourced fact or reported requirement that would be useful several turns later.
- `question`: a real open issue worth revisiting.
- `keep`: should clearly be saved, but the kind is ambiguous. Selection is graded; kind is not.
- `optional`: a borderline case. It counts neither as a miss nor as a false positive. Use it sparingly, for under about 15% of paragraphs.
- `skip`: greetings, headings, restating the question, generic conclusions, tool or process narration, requests to "save this to memory", and anything not useful later.

Rules:
- Judge each paragraph as it stands. Code stores whole paragraphs, so a paragraph that mixes one useful sentence with filler is still `keep`/`claim`.
- Aim for 150 to 300 labeled paragraphs in total.
- Add a top-level `labeler` field. If Dan can label or review a random 20% sample, record his agreement rate. Otherwise mark `"labeler": "agent"` and say so prominently in the report, because an LLM labeler may favor LLM-like choices.

## Step 4: Score

Run each of these with `--out`:

1. If recorded files exist: `score labels.json --recorded labels.recorded.json`. This is free and covers only events where extraction actually ran.
2. Jev at the default confidence threshold, plus the cheap chat model: `score labels.json --jev --llm openai:gpt-6-luna`. Use `anthropic:claude-haiku-4-5-20251001` if OpenAI isn't available.
3. The model Dan normally chats with, as the quality reference, if the budget allows. For example `--llm anthropic:claude-sonnet-5-5`. Check the model IDs in `src/resources/model-costs-2026-10-02.json`.
4. Jev at `--confidence 0.5` and `--confidence 0.8`.
5. Jev a second time at the default threshold, to check whether results are stable between runs.

## Report

Write `memory-selection-eval/REPORT.md`, with all label files and reports beside it, and give Dan a summary. Include:

- **Main table:** one row per selector, with precision, recall, F1, kind accuracy, events scored and failed, calls, tokens, median and total latency, and US$.
- **Jev fallback rate:** the share of events with at least one uncertain paragraph, at each threshold. Explain what this means: each such event would still need a chat-model call in a hybrid setup.
- **Run-to-run stability** for Jev.
- **Misses and false positives:** 5 to 10 examples for each, each with the paragraph text, the label and what the selector chose. Group them by pattern, for example "drops numeric findings" or "keeps generic summaries".
- **Oversized paragraphs:** any listed under `oversized`, plus any paragraphs excluded by the 4,000-character prefix or the 2,000-character paragraph limit that you judged worth keeping.
- **Step 1 and Step 2 results**, including any fix you made.
- **A recommendation** using these default criteria; state if you think they should change.
  - **Jev is a viable replacement** if:
    - its recall is within 5 points of the reference model's and its precision is no more than 5 points lower;
    - it needs a fallback on under 30% of events;
    - and its cost is under 10% of the chat model's.
  - **A hybrid is viable** if Jev's confident picks have precision of 90% or higher, even when its fallback rate is higher.
  - **Otherwise, not viable yet.** Name the specific failure patterns.
- **Caveats:**
  - the labeler and their possible bias;
  - sample size;
  - that labels grade selection, not factual truth;
  - that this says nothing about answer quality or whole-task cost.

## Boundaries

- Don't change engine code beyond the minimal Step 1 fix, if one is needed. Don't change the scoring code to make numbers look better. If you find a real bug in the scoring, report it and fix it in a clearly separate commit.
-
- Don't treat a selector's agreement with another selector as evidence of quality. Everything is graded against the labels.
