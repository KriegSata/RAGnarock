# Implementation Plan: Local-First Personal RAG Assistant

**Date**: 2026-10-22 | **Spec**: User goal and MVP decisions captured in chat

## Summary

Build RAGnarock into a personal knowledge assistant that lets one person
ingest private information, ask natural-language questions, and receive an
understandable answer with source citations, similar to a personal Jarvis-like
assistant. The target is a local-first desktop assistant with text and voice
interaction, persistent conversation, permissioned tools, desktop actions,
calendar/tasks, web research, developer workflows, and n8n-compatible
automation. It will use a file-based knowledge workspace, deterministic local
retrieval, and a local HTTP model API configured for the user's Gemma 4 31B
model with a 256k-token context window. The model remains on the user's
machine; RAGnarock calls its local API and must remain useful when no model API
is available.

## Technical Context

**Language/Version**: TypeScript on Node.js 20+
**Primary Dependencies**: Node HTTP server, TypeScript, `pdf-parse`,
`mammoth`, and a local HTTP inference API serving Gemma 4 31B. The API base
URL, request format, model identifier, and authentication behavior must be
configurable; Ollama may be supported as one compatible adapter, not as a
hard dependency.
**Storage**: Files under `data/knowledge`; serialized index under
`data/index.json`; no remote database in the MVP
**Testing**: TypeScript build, unit tests for extraction/retrieval, API smoke
tests, and browser smoke test
**Target Platform**: Local Windows desktop application with a companion local
HTTP API; a browser UI may remain as a development/admin surface
**Performance Goals**: Reindex a small personal library in one operation;
return retrieval results without requiring a model; use the 256k context window
efficiently without sending the entire index for every question; avoid
uploading source documents
**Constraints**: Local-first privacy, explicit source citations, Gemma 4 31B
as the primary synthesis model, a configurable context budget below the
256k-token model maximum, graceful operation without the local model API, no
secrets in the repository, no assumption that the inference server is
provider-specific, explicit risk-based approvals for side effects, auditable
tool execution, and an incremental architecture for new skills and
automation providers

## Constitution Check

No project constitution artifact exists yet. The plan adopts these provisional
principles:

- **Privacy first** — PASS: source files and index remain local; cloud calls
  are not required.
- **Useful without AI infrastructure** — PASS: extractive retrieval is the
  fallback answer path.
- **Traceable answers** — PASS: every generated answer is paired with retrieved
  passage identifiers.
- **Small, replaceable components** — PASS: ingestion, retrieval, and answer
  generation are separate boundaries.
- **Validate before expanding scope** — PASS: each phase has a runnable
  acceptance check.

## Applied Guidelines

No migration or framework-transformation guidelines apply. The implementation
will follow the repository's existing TypeScript/Node conventions and keep
optional integrations behind explicit adapters.

## Implementation Steps

### Step 1: [Cross-cutting] Establish project foundation
- **Requirements**: REQ-001, REQ-002
- **Description**: Keep the TypeScript build, runtime scripts, local
  directories, environment configuration, and safe error handling
  reproducible on a clean Node.js 20 installation.

Tasks:
- [ ] T001 [Plan:1.1] Verify `package.json`, `tsconfig.json`, and Node.js 20+ build configuration; add a clean-build check.
- [ ] T002 [P] [Plan:1.1] Add repository-safe data handling and ignore rules for `data/index.json`, local documents, and environment files.

### Step 2: [Cross-cutting] Create the document ingestion pipeline
- **Requirements**: REQ-001, REQ-003
- **Description**: Implement a connector boundary that discovers supported
  files, extracts text, normalizes content, splits it into stable passages,
  records source metadata, and reports unsupported or failed files explicitly.
  Initial connectors cover Markdown/text, HTML, JSON/CSV, chat exports, PDF,
  and DOCX.

Tasks:
- [ ] T003 [P] [US1] [Plan:2.1] Define typed document and passage models in `src/types.ts`.
- [ ] T004 [US1] [Plan:2.1] Extract and normalize Markdown, text, HTML, JSON, CSV, and chat-export content in `src/ingestion/text-extractor.ts`.
- [ ] T005 [US1] [Plan:2.1] Add PDF and DOCX extraction adapters in `src/ingestion/binary-extractor.ts`.
- [ ] T006 [US1] [Plan:2.2] Implement recursive knowledge-folder discovery and passage chunking in `src/ingestion/indexer.ts`.
- [ ] T007 [US1] [Plan:2.2] Persist the index atomically and surface per-file extraction errors in `src/ingestion/index-store.ts`.

### Step 3: [Cross-cutting] Implement retrieval and Gemma answer generation
- **Requirements**: REQ-002, REQ-004
- **Description**: Provide deterministic lexical retrieval for the offline
  path, define a replaceable retriever interface for future embeddings, and
  add a local HTTP model adapter configured for Gemma 4 31B. The adapter must
  isolate provider-specific request/response mapping, pack selected passages
  into a configurable context budget rather than blindly filling the model's
  256k window, enforce loopback/local endpoint policy by default, and expose
  connection errors explicitly. The fallback must clearly say when the index
  does not contain an answer.

Tasks:
- [ ] T008 [P] [US2] [Plan:3.1] Implement tokenization, stop-word filtering, scoring, and configurable top-k passage retrieval in `src/retrieval/lexical-retriever.ts`.
- [ ] T009 [US2] [Plan:3.1] Define the retriever and answer-generator interfaces in `src/retrieval/contracts.ts`.
- [ ] T010 [US2] [Plan:3.2] Implement the extractive fallback answer generator in `src/answers/extractive-answer.ts`.
- [ ] T011 [US2] [Plan:3.2] Implement the local HTTP Gemma 4 31B answer adapter with configurable API base URL, provider request/response mapping, model identifier, context budget, prompt-token reservation, timeout, and explicit fallback behavior in `src/answers/local-model-api.ts`.
- [ ] T012 [US2] [Plan:3.2] Add context packing and approximate token-budget enforcement so retrieved passages, conversation turns, instructions, and answer space stay within the configured budget in `src/answers/context-budget.ts`.
- [ ] T013 [US2] [Plan:3.3] Add citation formatting and source metadata validation in `src/answers/citations.ts`.

### Step 4: [Cross-cutting] Expose a stable local API
- **Requirements**: REQ-002, REQ-003, REQ-004
- **Description**: Keep the HTTP API small and typed: index the knowledge
  folder, ask a question, list indexed documents, and return structured
  errors. Prevent path traversal and avoid logging document contents.

Tasks:
- [ ] T014 [US2] [Plan:4.1] Add `POST /api/index`, `POST /api/ask`, and `GET /api/documents` routes in `src/server.ts`.
- [ ] T015 [US2] [Plan:4.1] Add request validation, response types, path containment checks, and consistent error responses in `src/server.ts`.
- [ ] T016 [US2] [Plan:4.2] Add API smoke tests covering empty questions, empty indexes, citations, reindexing, context-budget limits, and model-unavailable fallback in `tests/api.test.ts`.

### Step 5: [Cross-cutting] Build the usable web interface
- **Requirements**: REQ-002, REQ-003, REQ-004
- **Description**: Provide a clear local UI for reindexing, asking questions,
  reading answers, and inspecting cited passages. Make model availability and
  indexing state visible without exposing document contents to third parties.

Tasks:
- [ ] T017 [P] [US2] [Plan:5.1] Implement the question form, loading state, answer display, and error state in `public/index.html`.
- [ ] T018 [P] [US1] [Plan:5.1] Implement reindex controls and indexed-document status in `public/index.html`.
- [ ] T019 [US2] [Plan:5.2] Render citations as accessible source links/details and preserve the raw source identifier in the UI.
- [ ] T020 [US2] [Plan:5.3] Add a browser smoke test for reindex, ask, answer, and citation display in `tests/browser.smoke.ts`.

### Step 6: [Cross-cutting] Harden privacy, reliability, and documentation
- **Requirements**: REQ-001, REQ-005
- **Description**: Document the privacy boundary, configure local model
  settings, add operational safeguards, and prepare the architecture for
  future connectors, embeddings, conversation memory, and permissions.

Tasks:
- [ ] T021 [P] [Plan:6.1] Add `.env.example` documenting `MODEL_API_URL`, `MODEL_API_FORMAT`, `MODEL_API_MODEL=gemma4:31b`, `MODEL_CONTEXT_TOKENS`, and `MODEL_RESERVE_TOKENS` without storing credentials or assuming remote access.
- [ ] T022 [P] [Plan:6.1] Add size limits, malformed-input handling, context-budget diagnostics, and actionable extraction/indexing diagnostics.
- [ ] T023 [P] [Plan:6.2] Update `README.md` with installation, supported formats, local Gemma 4 31B API setup, supported API formats, privacy behavior, context-budget configuration, and troubleshooting.
- [ ] T024 [Plan:6.3] Run build, unit, API, and browser validation and record known gaps for unsupported Office formats, semantic retrieval, and approximate token counting.

### Step 7: [Cross-cutting] Add the Jarvis assistant runtime
- **Requirements**: REQ-002, REQ-005, REQ-006, REQ-007
- **Description**: Turn one-shot Q&A into a persistent assistant loop with
  conversation memory, intent/tool selection, bounded planning, action
  execution, result summarization, and an append-only audit trail. The runtime
  must distinguish read-only, reversible, and destructive actions and request
  confirmation according to policy.

Tasks:
- [ ] T025 [P] [US3] [Plan:7.1] Define conversation, message, memory, tool-call, approval, and audit-event types in `src/assistant/types.ts`.
- [ ] T026 [US3] [Plan:7.1] Implement conversation persistence with bounded working memory and long-term memory references in `src/assistant/memory.ts`.
- [ ] T027 [US3] [Plan:7.2] Implement the assistant loop for planning, tool selection, context assembly, answer synthesis, and graceful interruption in `src/assistant/runtime.ts`.
- [ ] T028 [US3] [Plan:7.3] Implement risk classification, confirmation gates, cancellation, and append-only action audit records in `src/assistant/approvals.ts`.
- [ ] T029 [US3] [Plan:7.4] Add desktop tray/overlay lifecycle, push-to-talk, status, and action approval controls in `desktop/`.

### Step 8: [Cross-cutting] Add voice, tools, and automation skills
- **Requirements**: REQ-006, REQ-007, REQ-008
- **Description**: Add replaceable speech adapters and permissioned skills for
  local files, web research, calendar/tasks, desktop control, developer tools,
  and n8n or generic webhook automation. Tool inputs and outputs must be
  schema-validated and scoped to explicit capabilities.

Tasks:
- [ ] T030 [P] [US3] [Plan:8.1] Define speech-to-text, text-to-speech, and wake-word adapter contracts with local-provider configuration in `src/voice/contracts.ts`.
- [ ] T031 [US3] [Plan:8.1] Implement voice session state, interruption/barge-in handling, transcript retention controls, and spoken-response playback in `src/voice/`.
- [ ] T032 [P] [US3] [Plan:8.2] Implement permissioned file, web research, calendar/task, desktop, and developer tool contracts in `src/tools/`.
- [ ] T033 [US3] [Plan:8.3] Implement an n8n/webhook automation connector with allowlisted endpoints, secret references, input/output schemas, retries, and confirmation policy in `src/automation/`.
- [ ] T034 [US3] [Plan:8.4] Add scheduled and event-triggered automation jobs with pause, retry, timeout, and run-history controls in `src/automation/scheduler.ts`.
- [ ] T035 [US3] [Plan:8.5] Add end-to-end tests for voice fallback, approval gates, tool scoping, automation failure, cancellation, and auditability in `tests/assistant.test.ts`.

## Project Structure

```text
RAGnarock/
├── data/
│   └── knowledge/                 # User-owned local source files
├── public/
│   └── index.html                 # Local web UI
├── desktop/                       # Desktop shell, tray, overlay, and permissions UI
├── src/
│   ├── assistant/
│   │   ├── approvals.ts
│   │   ├── memory.ts
│   │   ├── runtime.ts
│   │   └── types.ts
│   ├── automation/
│   │   ├── scheduler.ts
│   │   └── webhook.ts
│   ├── answers/
│   │   ├── citations.ts
│   │   ├── context-budget.ts
│   │   ├── extractive-answer.ts
│   │   └── local-model-api.ts
│   ├── ingestion/
│   │   ├── binary-extractor.ts
│   │   ├── index-store.ts
│   │   ├── indexer.ts
│   │   └── text-extractor.ts
│   ├── retrieval/
│   │   ├── contracts.ts
│   │   └── lexical-retriever.ts
│   ├── server.ts
│   ├── tools/
│   └── voice/
│   └── types.ts
├── tests/
│   ├── api.test.ts
│   ├── assistant.test.ts
│   └── browser.smoke.ts
├── data/index.json              # Generated local index; not committed
├── package.json
├── tsconfig.json
└── README.md
```

## Testing Strategy

- **appType**: Mixed local HTTP API and server-rendered/static HTML
- **Critical user journeys**:
  1. Add supported files and reindex them.
  2. Ask a question with the local model API unavailable and receive a useful
     fallback.
  3. Ask a question with Gemma 4 31B through the local HTTP API and receive a
     cited answer.
  4. Ask a question with no matching content and receive an explicit
     not-found response.
  5. Attempt an unsafe path and receive a rejection.
  6. Speak a request, receive a transcript, and hear a response.
  7. Ask the assistant to perform a safe action and confirm a risky action.
  8. Trigger an n8n automation and inspect its run history.
  9. Pause or cancel an autonomous task and verify no further actions execute.
- **primaryValidationStack**: TypeScript compiler, Node test runner, and
  Playwright browser smoke test
- **fallbackMatrix**:
  - `model-tier`: Gemma 4 31B through the local HTTP API → extractive answer
    generator; semantic answer quality is reduced but the workflow remains
    available.
  - `context-tier`: configured context budget → lower safe budget when the
    requested budget is invalid or exceeds the model's 256k-token maximum.
  - `browser-tier`: Playwright → API smoke tests; visual behavior is not
    validated when a browser is unavailable.
- **Environment requirements**: Node.js 20+; the user's local HTTP inference
  server with Gemma 4 31B for model-path tests; Playwright browser only for
  browser-tier validation; local speech adapters and n8n only for their
  integration tests.
- **knownGaps**: Lexical retrieval misses semantically equivalent wording;
  approximate token counting is conservative rather than tokenizer-exact;
  Office formats beyond DOCX need dedicated parsers; there is no multi-user
  authentication or remote deployment in the MVP; wake-word accuracy depends
  on the selected local speech provider; desktop control must remain
  allowlisted and platform-specific.
- **Test data strategy**: Generate small temporary fixture files per test,
  isolate each index in a temporary directory, and delete fixtures after each
  run.
- **Acceptance criteria**: Every critical journey returns the expected status,
  answer shape, and source identifiers; build passes with strict TypeScript
  checking.
- **Validation review expectations**: Confirm no source file is sent to a
  remote service by default, fallback behavior is explicit, and citations
  refer to actual indexed passages.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
|--------|-------------|------------|------------------------|
| REQ-001 | Keep personal knowledge local and usable on a local machine | 1.1, 2.1, 6.1 | `src/ingestion/*`, `src/server.ts`, `.env.example`, `README.md` |
| REQ-002 | Let the user ask questions and receive understandable answers | 1.1, 3.1, 3.2, 4.1, 5.1 | `src/retrieval/*`, `src/answers/*`, API routes, `public/index.html` |
| REQ-003 | Ingest the user's supported personal information sources | 2.1, 2.2, 4.1, 5.1 | `src/ingestion/*`, reindex route, ingestion controls |
| REQ-004 | Ground answers in retrieved passages with visible citations | 3.1, 3.2, 3.3, 4.1, 5.2 | `src/answers/citations.ts`, API response, citation UI |
| REQ-005 | Build an extensible foundation that can reduce interpretation work over time | 3.2, 6.1, 6.2, 6.3 | Adapter interfaces, context budgeting, diagnostics, documentation, validation evidence |
| REQ-006 | Provide a Jarvis-like conversational desktop assistant with memory and voice interaction | 7.1, 7.2, 7.4, 8.1 | `src/assistant/*`, `src/voice/*`, `desktop/*` |
| REQ-007 | Execute useful local, web, calendar, desktop, developer, and automation actions safely | 7.2, 7.3, 8.2, 8.3, 8.4 | `src/tools/*`, `src/automation/*`, approval and audit records |
| REQ-008 | Support proactive autonomous work with risk-based approval, cancellation, and auditability | 7.3, 8.3, 8.4 | `src/assistant/approvals.ts`, `src/automation/scheduler.ts`, audit log |
