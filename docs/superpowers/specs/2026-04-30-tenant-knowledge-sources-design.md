# Tenant Knowledge Sources Design

## Summary

Build a shared tenant knowledge source system that replaces the current free-text dashboard knowledge field with managed uploads and OAuth-backed connectors. The system must support both chatbot surfaces in this repo:

- the public web advisor
- the CRM assistant

The knowledge subsystem should:

- accept tenant-scoped uploads for `PDF`, `DOCX`, `CSV`, `HTML`, and plain text
- parse and normalize each format into plain text plus source metadata
- ingest connector data through a generic OAuth-capable framework
- process uploads and connector syncs asynchronously
- chunk and index normalized content for retrieval
- expose source status and management controls in the dashboard
- let both assistants retrieve from the same tenant knowledge plane with audience-specific prompt handling

This is a retrieval-first system. "Adding knowledge" means storing source metadata, extracting content, chunking it, indexing it, and retrieving it at answer time. It does not mean prompt stuffing or model fine-tuning.

## Why This Change Is Needed

The current implementation is too limited for tenant-managed knowledge:

- [src/components/DashboardClient.tsx](C:\Users\risha\OneDrive\Desktop\agent\agent\src\components\DashboardClient.tsx) exposes a single textarea for `knowledge`
- [src/app/api/settings/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\settings\route.ts) persists that free-text value directly on `Settings`
- [src/app/api/chat/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\route.ts) reads `setting.knowledge` directly instead of retrieving from a managed document index

That architecture breaks down once the tenant needs:

- multiple sources
- large documents
- non-text formats
- connector-driven data
- visibility into processing failures
- shared use across both assistants
- future retrieval quality improvements

The new feature needs explicit source records, async ingestion, and retrieval over indexed chunks rather than a single free-text field embedded into prompts.

## Goals

- Replace the dashboard free-text knowledge base field with source management UI
- Support file uploads for `PDF`, `DOCX`, `CSV`, `HTML`, and `TXT`
- Parse each file type into normalized text
- Support tenant connector installation through a generic OAuth framework
- Ingest uploads and connector payloads asynchronously
- Chunk and index extracted content for retrieval
- Share one tenant knowledge substrate across both the web advisor and CRM assistant
- Preserve audience visibility controls so a source can be enabled for `web`, `crm`, or both
- Show operational state such as `pending`, `processing`, `ready`, and `failed`
- Preserve a migration-safe fallback path from legacy `settings.knowledge`

## Non-Goals

- Fine-tuning a model on uploaded or synced content
- Building vendor-specific connector suites beyond the generic framework in the first pass
- Real-time in-request document parsing for large files
- Full document previewing, annotation, or approval workflow
- Replacing existing CRM operational tools with free-form model behavior

## Product Decomposition

This work spans multiple concerns, but they should be implemented as one coherent feature set with clear boundaries:

1. `Knowledge source registry and ingestion pipeline`
2. `Dashboard source management UI`
3. `OAuth connector installation and sync framework`
4. `Shared retrieval integration for web and CRM assistants`

The ingestion pipeline is the shared dependency. The dashboard and connector flows feed it, and both assistants consume its indexed output.

## Recommended Architecture

Use an application-local knowledge subsystem built around Mongo-backed source records and indexed chunks, with asynchronous processing and a generic connector contract.

Core layers:

- `Source registry`: tracks uploaded files and connector-backed datasets, source type, status, sync metadata, and visibility
- `Ingestion pipeline`: parses uploaded files or fetches connector content, normalizes it, chunks it, and writes retrievable records
- `Retrieval service`: tenant-aware query path used by both assistants
- `Connector auth layer`: generic OAuth install, callback, token refresh, and sync lifecycle

This keeps the system inside the current Next.js app and existing data patterns while still leaving a clean seam for a future background worker or external vector store.

### Rejected Alternatives

#### Keep the free-text knowledge field and add uploads later

Rejected because it preserves the main limitation: there is still no first-class concept of a source, processing lifecycle, or retrieval unit.

#### Create a separate ingestion service immediately

Rejected for v1 because the current repo does not yet justify the operational cost of a second service. The interfaces should allow that split later, but it is premature now.

#### Store full extracted text only, without chunking and indexing

Rejected because the user requirement is chunked retrieval, and full-text prompt injection would become brittle and expensive as source volume grows.

## User Experience

### Dashboard

The current dashboard knowledge textarea should be replaced with a `Data Sources` section containing:

- `Uploads` panel
- `Connectors` panel

The uploads panel should provide:

- file picker or drag/drop
- supported-format guidance
- list of uploaded sources
- source title, type, audience chips, status badge, updated time
- retry, delete, and audience-edit actions

The connectors panel should provide:

- available connector cards
- OAuth connect action
- installation state
- last sync time
- manual sync
- disconnect action

The UI must make processing status visible. A tenant should be able to see whether a source is still ingesting, ready for retrieval, or failed with an actionable error.

### Web Advisor

The public assistant should retrieve only from tenant sources marked visible to the `web` audience and in `ready` state, plus any migration fallback if no ready sources exist.

### CRM Assistant

The CRM assistant should retrieve from tenant sources marked visible to the `crm` audience and in `ready` state. It may also combine that with existing CRM structured data and tool outputs, but operational actions must remain explicit tool calls.

## Source Types

### File Uploads

Supported file types in v1:

- `pdf`
- `docx`
- `csv`
- `html`
- `txt`

### Connector Sources

Connector-backed sources should be represented the same way as files at the source-registry level. The difference is the producer:

- files are produced by uploads
- connector sources are produced by sync jobs

This unifies downstream chunking, indexing, retrieval, status reporting, and deletion behavior.

## Data Model

Add three primary persistence models.

### `KnowledgeSource`

One record per uploaded file or connector-backed dataset.

Fields should include:

- `tenantId`
- `kind` with values `file` or `connector`
- `sourceType` such as `pdf`, `docx`, `csv`, `html`, `text`, or connector key
- `title`
- `status` with values such as `pending`, `processing`, `ready`, `failed`, `deleted`
- `audiences` containing `web`, `crm`, or both
- `storage`
- `checksum`
- `metadata`
- `syncCursor`
- `lastSyncedAt`
- `error`
- timestamps

### `KnowledgeChunk`

One retrieval unit produced from a `KnowledgeSource`.

Fields should include:

- `tenantId`
- `sourceId`
- `chunkIndex`
- `text`
- `tokenCount`
- `embedding` or index payload used by the retrieval implementation
- `keywords`
- `metadata`
- timestamps

Chunk metadata should retain enough context for debugging and future source labeling, such as:

- file name
- section heading
- page number
- row range
- connector object identifiers

### `ConnectorInstallation`

One record per tenant connector install.

Fields should include:

- `tenantId`
- `connectorKey`
- `displayName`
- `authType`
- `scopes`
- encrypted access and refresh tokens
- `expiresAt`
- `status`
- `config`
- `lastSyncAt`
- `lastSyncStatus`
- timestamps

## Ingestion Lifecycle

The system should use asynchronous ingestion and sync processing.

Lifecycle:

1. Upload or connector install creates a `KnowledgeSource` in `pending`
2. Background processing moves it to `processing`
3. Parser or connector fetcher produces normalized content
4. Chunker splits content into retrieval units
5. Index writer replaces prior chunks for that source atomically
6. Source transitions to `ready`
7. Any failure transitions the source to `failed` with a durable error message

Connector re-syncs should re-run the same normalization, chunking, and indexing flow against a fresh snapshot.

### Why Async Processing Is Required

This is the safest default because:

- PDF and DOCX parsing can be slow
- connector fetches can time out or rate-limit
- retrieval should not depend on request-path parsing success
- retries and failure visibility are easier with explicit statuses

The request path should return quickly with a status record instead of trying to finish ingestion inline.

## Parsing and Normalization

Parsing should route by MIME type or extension to dedicated extractors.

Each extractor should return a normalized shape such as:

- `title`
- `plainText`
- `sections`
- `metadata`

### PDF

Requirements:

- extract text
- preserve page context where possible
- retain basic section structure when discoverable

### DOCX

Requirements:

- extract paragraph text
- preserve headings where available
- flatten into normalized sections

### CSV

Requirements:

- preserve header row names
- group rows into bounded blocks
- retain row ranges in metadata

### HTML

Requirements:

- strip markup safely
- preserve heading hierarchy and section boundaries
- omit script and style content

### Plain Text

Requirements:

- preserve raw text
- derive simple paragraph or line-based sections

Normalization should happen before chunking so the chunker has one uniform input contract across all source types.

## Chunking and Indexing

Chunking should happen after normalization and before retrieval indexing.

Requirements:

- use bounded chunk size with overlap
- preserve source metadata on every chunk
- keep chunks small enough for relevance scoring and prompt assembly
- avoid splitting structured boundaries when possible

Format-specific behavior:

- `CSV`: chunk by grouped rows while repeating headers
- `HTML`: chunk by sections and headings when possible
- `PDF` and `DOCX`: chunk by paragraphs or sections with overlap
- `TXT`: chunk by paragraphs or line groups

The retrieval layer should sit behind an abstraction so the app can evolve from a simple indexed Mongo implementation to a dedicated vector store later without changing the assistant-facing API.

## Retrieval Rules

Both assistants should call a shared retrieval function:

- `retrieveTenantKnowledge({ tenantId, audience, query })`

Retrieval rules:

- only `ready` sources are eligible
- audience filter is enforced in code
- retrieval is tenant-scoped
- deleted or failed sources are excluded
- connector-backed and file-backed chunks are treated uniformly

The retrieval service should return both chunk text and source labels so future UI citation rendering remains possible.

## Connector Framework

The first version should support generic OAuth-capable connectors.

Define a connector contract with methods:

- `getAuthorizationUrl`
- `exchangeCode`
- `refreshToken`
- `fetchDocuments`
- `normalizeDocuments`

Each connector adapter implements that contract. The tenant-specific installation stores tokens and config, while the rest of the ingestion pipeline stays connector-agnostic.

### OAuth Requirements

- install initiation endpoint
- callback endpoint per connector key
- encrypted token storage at rest
- refresh token support
- manual sync endpoint
- install status reporting in dashboard

The system must not couple connector-specific fields into generic dashboard UI state beyond display metadata and configuration primitives.

## API Surface

Add endpoints with the following responsibilities:

### `POST /api/knowledge-sources/upload`

- multipart upload for supported file types
- validates tenant and auth
- stores upload metadata
- creates a pending source
- enqueues ingestion

### `GET /api/knowledge-sources`

- lists tenant sources
- returns type, title, status, audiences, sync metadata, and errors

### `PATCH /api/knowledge-sources/:id`

- rename source
- edit audience visibility
- update source activation state

### `DELETE /api/knowledge-sources/:id`

- soft-delete source
- remove indexed chunks from retrieval eligibility

### `POST /api/connectors/install`

- initiates OAuth install for a connector

### `GET /api/connectors/callback/:connectorKey`

- handles OAuth callback
- stores tokens
- creates or updates installation
- enqueues initial sync

### `GET /api/connectors`

- lists available and installed connectors for the tenant

### `POST /api/connectors/:id/sync`

- triggers manual re-sync

## Integration With Current Repo

This feature should evolve existing code rather than replace it wholesale.

Likely impact areas:

- [src/components/DashboardClient.tsx](C:\Users\risha\OneDrive\Desktop\agent\agent\src\components\DashboardClient.tsx)
- [src/app/api/settings/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\settings\route.ts)
- [src/app/api/settings/get/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\settings\get\route.ts)
- [src/app/api/chat/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\route.ts)
- [src/app/api/chat/web/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\web\route.ts)
- [src/app/api/chat/crm/route.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\crm\route.ts)
- [src/server/crm-assistant/service.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\server\crm-assistant\service.ts)
- [src/model/settings.model.ts](C:\Users\risha\OneDrive\Desktop\agent\agent\src\model\settings.model.ts)

The current `settings.knowledge` field should become a migration fallback rather than the long-term source of truth.

## Migration Plan

Use a staged migration to avoid breaking existing tenants.

### Phase 1

- add source models, connector installation model, routes, and dashboard UI
- keep `settings.knowledge` reads intact as fallback

### Phase 2

- route both assistants through shared retrieval
- prefer indexed chunks
- fall back to `settings.knowledge` only when no ready sources exist

### Phase 3

- remove the dashboard free-text textarea
- optionally backfill legacy free-text content into a synthetic source record

## Error Handling

Handled failure modes must include:

- unsupported file type
- empty or unreadable file
- oversized file
- parse failure
- OAuth callback failure
- token refresh failure
- connector fetch failure
- index write failure
- retrieval with no eligible sources

Rules:

- failed sources never become retrievable
- dashboard shows durable error state
- sync retries do not corrupt existing ready chunks
- low-evidence answers should fail conservatively

## Security and Access Control

- tenant scoping is enforced in retrieval and source management code
- audience visibility is enforced in retrieval code, not prompt text
- OAuth tokens must be encrypted at rest
- raw file access should remain server-controlled
- CRM actions remain tool-gated and audited

This is important because the CRM assistant handles operational and potentially sensitive partner data, while the web advisor is public-facing.

## Testing Strategy

Implementation should be test-driven around the shared ingestion and retrieval core.

Required test categories:

### Parser Tests

- PDF extraction
- DOCX extraction
- CSV normalization
- HTML normalization
- TXT normalization
- malformed file handling

### Ingestion Tests

- source status transitions
- chunk replacement on re-ingestion
- connector sync success and failure paths

### Retrieval Tests

- tenant isolation
- audience filtering
- exclusion of failed or deleted sources
- mixed file and connector retrieval

### API Tests

- upload route
- source listing
- source delete/update
- connector install callback
- manual sync trigger

### UI Tests

- source status badges
- upload workflow
- connector installation state
- removal of dependency on the free-text knowledge field

## Risks and Trade-Offs

- async ingestion adds operational state and retry complexity
- OAuth introduces token lifecycle management and secure storage requirements
- parser quality varies by file type and source quality
- connector data normalization can drift as external APIs evolve

These trade-offs are acceptable because they address the current architectural gap: the repo has no durable, inspectable, retrievable knowledge source model for tenants.

## Recommended Direction

Build one shared tenant knowledge source system with async ingestion, OAuth connector installs, normalized chunk indexing, and dashboard management. Use it as the retrieval substrate for both assistants, keep the existing free-text field only as a migration fallback, and preserve audience and tenant access control in code.
