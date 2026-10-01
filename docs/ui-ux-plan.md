# Converse UI/UX plan

Reviewed 2026-10-01 on a local build at desktop (1440×900) and phone (390×844) sizes. **Status:** phases 1–6 implemented the same day (see `public/ui.js`); light theme and per-provider model pickers in the composer remain ideas for later.

## What gets in the way today

1. **The mode is invisible.** Converse has three different behaviours: multi-model chat saved on this device, GPT context chat saved on the server, and Agent Mode. They're controlled by a checkbox buried inside the collapsed "Context layer" panel plus a separate "Agent Mode" checkbox. Nothing on screen tells you which one you're in or where your chat is saved.
2. **You can't see who will reply.** Recipients are chosen with `@mentions`, and without a mention "the last selection replies". That state isn't shown anywhere (the placeholder always says `@GPT`).
3. **Saved chats are hard to find.** Server chats live in a `<select>` inside the Context layer panel. Local chats can't be saved at all: **New chat permanently erases the current one** after a confirm() dialog.
4. **The composer is crowded.** It has five buttons (Upload, Export MD, Export JSON, Watch context, Send), two status lines ("Ready" twice) and a 35dvh settings panel stacked above the text box. On a phone, Send wraps onto a second row and the controls take up about 40% of the screen.
5. **The Models panel floats over the content.** On a phone it covers the title and chat. On desktop it's a detached card. It's always open on wide screens even though you rarely change models.
6. **Messages are hard to scan.** You and the models use the same style, there's no colour per provider, and every reply has a full-width "Copy" button. Attachments get dumped inline as raw fenced text.
7. **The stylesheet has grown in layers.** `main` is redefined four times and media queries override each other. Without design tokens, every change risks a regression.

## Direction

A familiar chat layout: a sidebar holding your chats, a slim top bar, the conversation, and a compact composer that always shows **mode, recipients and destination**.

### Phase 1: Shell and navigation
- **Sidebar** (always visible at ≥ 900px, a slide-in drawer with a ☰ button on phones) holds:
  - Brand and **New chat**.
  - **Chats**: saved context chats from the server, plus previous local chats "on this device".
  - **Models**: the three model pickers, collapsed by default.
- **Top bar** shows the current chat title and a mode badge. A **⋯ menu** holds Export Markdown, Export JSON, Context garden and Install app.
- Move the explanatory paragraph out of the header and into the empty state.

### Phase 2: Composer
- A **mode switch** with three options:
  - `Chat` (GPT, Claude and Gemini; saved on this device)
  - `Context` (GPT; saved on the server)
  - `Agent` (GPT with tools)
- The mode is locked once a chat has messages, with a hint saying "start a new chat to switch". Server-only modes hide when the server doesn't support them.
- **Recipient chips** (GPT / Claude / Gemini) toggle who replies and show the short model name. Typing `@mentions` updates the chips. In Context/Agent mode there's a single GPT chip.
- A single row: 📎 attach, an auto-growing textarea, and **Send**. The attachment appears as a removable pill.
- A **⚙ settings** button opens a sheet with reasoning, Jev, budgets/limits, working context, remembered state and the agent audit. It replaces the inline Context layer panel.
- One status line. While an agent run is going, a run strip with progress, Stop and Resume appears above the composer.

### Phase 3: Messages
- Your messages appear as right-aligned bubbles. Model replies are full width, with a provider colour dot, name and model.
- A compact action row (Copy) on each reply, plus a copy button on every code block.
- An animated typing indicator replaces "Thinking…".
- Attachments render as collapsible file cards. The underlying record and exports stay the same.
- A **Jump to latest** button appears when you've scrolled up during a reply.

### Phase 4: Empty state
- A short explanation of the current mode and where the chat is saved.
- Starter prompts you can tap to fill the composer, such as "@GPT @Claude compare…".

### Phase 5: Local chat history
- **New chat** archives the current local chat instead of erasing it. Up to 20 are kept on this device and listed in the sidebar, where you can reopen or delete them. This removes the destructive confirm().
- The `converse-chat` storage key and record format stay unchanged, so existing data and exports keep working.

### Phase 6: Foundation and polish
- Rewrite `styles.css` around design tokens (colours, spacing, radii) with one coherent responsive layout.
- Keep 44px touch targets, visible focus, aria labels/live regions, reduced-motion support and safe-area insets.
- Bump the service worker cache so installed PWAs pick up the new shell.
- Update the Playwright specs for the new structure and run desktop and phone projects, the agent specs and the unit tests.

## Guardrails
- Frontend only (`public/`, browser tests). No API, schema or provider changes.
- Keep all existing behaviour: streaming, Markdown sanitising, provenance records, exports, unlock, offline shell, agent run/stop/resume, context garden.
- Each phase ships as its own commit to `main` so Vercel deploys incrementally and is easy to revert.
