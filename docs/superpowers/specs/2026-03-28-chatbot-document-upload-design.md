# Chatbot Knowledge Engine Design

## Summary

Build a shared knowledge engine for both chatbot surfaces in this repo:

- `myra-web`: public landing-page loan advisor
- `myra-crm`: owner-facing CRM copilot

The chatbot must stop behaving like a prompt-only assistant and instead answer from grounded evidence:

- structured facts from PostgreSQL
- uploaded PDF and Excel knowledge sources
- explicit citations showing where each answer came from

The system should support two knowledge scopes:

- `global` knowledge base for the public web chatbot
- `owner` knowledge bases for CRM tenants, with strict access control

This design intentionally uses retrieval-first architecture rather than model fine-tuning. In this product, "train on uploaded files" means parse, index, embed, retrieve, and cite. Fine-tuning is not the primary knowledge mechanism.

## Why This Change Is Needed

The current repo already has separate web and CRM chat paths, but the answer quality is limited by the existing architecture:

- [src/app/api/chat/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\route.ts) is mainly intent classification plus light knowledge injection
- [src/lib/knowledgeBase.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\lib\knowledgeBase.ts) is product-search oriented and Mongo-based, not a generalized cited retrieval layer
- [src/app/api/chat/web/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\web\route.ts) and [src/app/api/chat/crm/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\crm\route.ts) split the agents correctly, but they do not share a document intelligence pipeline

The main failure mode is generic answers. That happens when the model is not forced to reason over exact evidence and instead relies on broad prompting.

## Goals

- Support uploading `PDF`, `XLS`, `XLSX`, and `CSV` knowledge sources
- Make uploaded files searchable and citable in chatbot answers
- Use a single shared ingestion and retrieval core for both web and CRM assistants
- Answer landing-page loan questions using:
  - structured PostgreSQL product and policy data
  - approved global knowledge documents
- Answer CRM owner questions using:
  - PostgreSQL CRM/dashboard data
  - owner-scoped uploaded knowledge
  - optionally approved global knowledge where useful
- Return citations showing exact file and source location
- Reduce hallucinations by blocking unsupported answers when evidence is weak
- Preserve CRM action workflows such as WhatsApp follow-ups, daily briefs, and to-do generation

## Non-Goals

- Fine-tuning a foundation model on uploaded documents in v1
- Replacing CRM action tools with free-form model behavior
- Full spreadsheet calculation engine or workbook auditing
- Multi-tenant public sharing beyond the explicit `global` scope
- Trusting unreviewed global uploads in public answers

## Product Decomposition

This initiative must be built as three related sub-projects rather than one vague "AI chatbot" feature:

1. `Knowledge ingestion and retrieval core`
2. `Web loan advisor grounding`
3. `CRM copilot grounding and actions`

The implementation order should follow that dependency chain. Both chat surfaces depend on the shared knowledge engine.

## User Experience

### Web Chatbot

The landing-page chatbot should answer questions about:

- loan products
- eligibility
- lender requirements
- process and timelines
- document requirements
- policy nuances contained in uploaded files

The answer must be based on:

- PostgreSQL facts where a structured answer exists
- approved global uploaded documents when policy/process context is needed

The UI should display citations alongside the answer, including file and page or sheet references.

### CRM Copilot

The CRM assistant should act as an owner's operational co-worker. It should:

- answer questions about dashboard state and business performance
- answer process or policy questions from owner-scoped or approved global knowledge
- generate daily briefs and owner to-dos
- trigger follow-up actions such as WhatsApp reminders through explicit tools

The CRM assistant must keep a hard distinction between:

- answering from knowledge
- performing an operational action

An answer can be grounded in uploaded files, but an action must go through a verified tool path with auth and auditability.

## Recommended Architecture

Use classic grounded retrieval architecture with hybrid search and scoped tools:

- PostgreSQL as the primary system of record
- `pgvector` for semantic embeddings
- object storage for raw uploaded files
- a document ingestion pipeline for PDFs and spreadsheets
- a shared retrieval service that enforces scope
- an answer grounding layer that forces citations

This replaces the current mixed prompt-and-search behavior with a knowledge engine that can support both chatbots coherently.

### Rejected Alternatives

#### Prompt-only knowledge injection

Rejected because it does not scale, produces generic answers, and cannot reliably support citations.

#### Fine-tuning on uploaded files as the primary mechanism

Rejected because the corpus needs freshness, spreadsheet changes are frequent, and citations are required. Even if fine-tuning is added later for tone or classification, retrieval remains the main knowledge mechanism.

## System Components

### 1. Upload and Ingestion Service

Responsible for:

- accepting uploads from admin and owner interfaces
- validating file type and size
- storing raw files in object storage
- creating asynchronous ingestion jobs
- exposing processing status and failure reasons

Supported file types in v1:

- `pdf`
- `xls`
- `xlsx`
- `csv`

### 2. Document Parser Layer

Responsible for turning raw files into normalized content units.

For PDFs:

- extract page text
- preserve page numbers
- preserve section or heading context where possible
- optionally use specialized parsing for lending documents when it adds value

For Excel and CSV:

- enumerate workbook and sheet names
- extract headers
- preserve row ranges
- normalize row blocks into bounded text/table segments
- retain enough structure for citations such as sheet name and row intervals

### 3. Chunking and Embedding Layer

Responsible for:

- chunking normalized content into retrieval-friendly units
- preserving citation metadata for every chunk
- generating embeddings
- storing chunk records in PostgreSQL with vector data

Each chunk must keep source references such as:

- file ID and file name
- page number for PDFs
- sheet name for Excel
- row start and row end for tabular blocks
- section heading where available

### 4. Knowledge Retrieval Service

Responsible for:

- semantic retrieval by embedding similarity
- keyword retrieval for exact term matches
- metadata filtering by scope, product, lender, category, and status
- reranking the final evidence set

Scope rules:

- web chatbot: `global` documents only
- CRM chatbot: current owner's documents, plus optionally approved global documents
- owner A must never retrieve owner B's knowledge

### 5. Answer Grounding Service

Responsible for building the model evidence pack from:

- structured PostgreSQL facts
- retrieved knowledge chunks
- source citation metadata

The model prompt should instruct the assistant to:

- answer only from provided evidence
- cite the source(s) used
- clearly state when evidence is insufficient
- avoid inventing unsupported product or policy details

If evidence is weak or contradictory, the assistant should answer conservatively instead of improvising.

### 6. CRM Action Layer

The existing CRM tool architecture should remain, but be extended to consume grounded knowledge where needed.

Examples:

- follow-up reminder recommendations using client data plus uploaded policy/process docs
- daily brief generation using dashboard facts plus recent owner knowledge
- to-do generation grounded in pipeline state and reminders

Free-form generation must not be allowed to send WhatsApp messages or update CRM state without explicit tool execution.

## Data Architecture

### PostgreSQL as Primary Store

PostgreSQL should become the primary knowledge and CRM store. This simplifies the architecture relative to the current split between Mongo-based knowledge and other storage patterns.

Use PostgreSQL for:

- structured product tables
- CRM entities
- document metadata
- ingestion jobs
- knowledge chunks
- embeddings via `pgvector`
- answer trace logs

### Object Storage

Use object storage for:

- original uploaded files
- optional rendered previews or extraction artifacts

Object storage should not be queried directly by the model. All retrieval should go through indexed metadata and chunks.

## Proposed Database Additions

Add tables roughly like the following:

### `knowledge_sources`

One row per uploaded file.

Fields should include:

- `id`
- `scope` with values such as `global` or `owner`
- `owner_id` or `partner_id` where relevant
- `storage_key`
- `mime_type`
- `display_name`
- `status` with values such as `uploaded`, `processing`, `ready`, `failed`, `archived`, `needs_review`
- `created_at`
- `updated_at`

### `knowledge_source_versions`

Tracks re-uploads and reprocessing.

Fields should include:

- `knowledge_source_id`
- `checksum`
- `parser_version`
- `embedding_version`
- `status`
- `created_at`

### `knowledge_chunks`

Stores chunk text and citation metadata.

Fields should include:

- `id`
- `knowledge_source_version_id`
- `chunk_text`
- `embedding`
- `page_number`
- `sheet_name`
- `row_start`
- `row_end`
- `section_title`
- `metadata_json`

### `knowledge_tags`

Supports admin review and filtering.

Fields should include:

- `knowledge_source_id`
- `tag_type`
- `tag_value`

### `knowledge_ingestion_jobs`

Stores async processing state.

Fields should include:

- `id`
- `knowledge_source_version_id`
- `job_type`
- `status`
- `retry_count`
- `error_message`
- `started_at`
- `finished_at`

### `answer_traces`

Optional but recommended audit table.

Fields should include:

- `id`
- `chat_surface`
- `scope`
- `actor_id`
- `question`
- `retrieved_chunk_ids`
- `citation_payload`
- `answer_text`
- `confidence_flags`
- `created_at`

## Source-of-Truth Rules

When evidence conflicts:

- live operational CRM facts from PostgreSQL win over documents
- structured product records in PostgreSQL win over stale uploaded spreadsheets
- documents are still valid for policy, process, and contextual guidance when they do not conflict with current structured facts

This keeps the chatbot from citing an old sheet over a live dashboard fact.

## Approval and Publishing Rules

### Global Knowledge

Global knowledge should require review before public use.

Recommended flow:

1. upload
2. process
3. review citations and extracted structure
4. mark as approved
5. publish to web retrieval

### Owner Knowledge

Owner-scoped CRM knowledge can become searchable immediately after successful processing, but should still support:

- status flags
- reprocessing
- archive and delete
- visibility into parser failures

## Error Handling

Handled failure cases must include:

- unsupported file type
- empty or unreadable file
- oversized file
- parse failure
- embedding failure
- retrieval returns insufficient evidence
- scope violation attempts
- CRM action requested without auth or explicit tool path

Rules:

- failed uploads never become retrievable
- parsing or embedding failures show clear status in UI
- low-confidence retrieval produces a conservative answer
- unsupported questions should return "I could not verify that from available sources"

## Security and Access Control

- web chatbot can read only approved `global` knowledge
- CRM chatbot can read only the authenticated owner's scoped data plus allowed global knowledge
- owner-scoped document retrieval must be enforced in retrieval code, not just prompt instructions
- raw file access should be server-controlled
- action tools must keep existing auth boundaries

This is especially important because the CRM assistant will act as a co-worker and may handle sensitive customer and business data.

## Testing Strategy

The implementation should be test-driven and grouped around the shared knowledge engine first.

Required test categories:

### Parser Tests

- PDF extraction preserves page references
- Excel extraction preserves sheet names and row ranges
- malformed files fail safely

### Chunking and Metadata Tests

- chunks retain citation metadata
- oversized sheets are bounded correctly
- chunk boundaries do not lose section context

### Retrieval Tests

- web retrieves only approved global knowledge
- CRM retrieves owner knowledge and never crosses tenant boundary
- hybrid retrieval surfaces relevant exact-match spreadsheet cells and semantic PDF passages

### Grounding Tests

- answers include citations
- unsupported questions are answered conservatively
- conflicting evidence follows source-of-truth rules

### CRM Tooling Tests

- WhatsApp actions require explicit tool invocation
- daily briefs use structured dashboard context
- task generation uses owner-scoped state

## Rollout Order

Recommended milestone sequence:

1. shared ingestion and retrieval core
2. web chatbot grounding with citations
3. CRM read-only copilot over dashboard and documents
4. CRM actions: WhatsApp reminders, daily briefs, and owner to-dos
5. review tooling, analytics, and operational controls

This order ensures the intelligence layer is correct before adding automation on top.

## Impact on Current Repo

The design should evolve the current repo rather than replace it.

Likely impact areas:

- [src/app/api/chat/web/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\web\route.ts)
- [src/app/api/chat/crm/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\crm\route.ts)
- [src/lib/knowledgeBase.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\lib\knowledgeBase.ts)
- [src/server/crm-assistant/service.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\server\crm-assistant\service.ts)
- [db/crm_assistant_schema.sql](C:\Users\risha\OneDrive\Desktop\agent\agent\db\crm_assistant_schema.sql)

The existing route split is already useful. The main architectural change is introducing a shared knowledge engine and moving the knowledge source of truth toward PostgreSQL plus `pgvector`.

## Risks and Trade-Offs

- ingestion and retrieval add operational complexity compared with prompt-only chat
- spreadsheet parsing quality must be bounded and predictable
- public global knowledge needs review workflow to avoid bad or stale answers
- migrating away from Mongo-based knowledge search will require careful staged adoption

These trade-offs are acceptable because they directly address the current failure mode: generic, weakly grounded answers.

## Recommended Direction

Build a shared knowledge engine first, grounded in PostgreSQL and `pgvector`, with explicit document ingestion, scoped retrieval, and mandatory citations. Then adapt the web chatbot and CRM copilot to consume that engine. Keep CRM actions tool-driven and audited.
