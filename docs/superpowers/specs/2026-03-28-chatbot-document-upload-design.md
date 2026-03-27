# Chatbot Document Upload Design

## Summary

Add document upload to both chatbot modes (`web` and `crm`) so users can attach a file to the current chat session, receive an immediate analysis summary in-chat, and continue asking follow-up questions about that uploaded file during the same session.

Version 1 supports:

- `PDF`
- Excel workbooks (`.xls`, `.xlsx`)

Version 1 constraints:

- Files are available only for the current chat session
- One uploaded file is active per session at a time
- Re-uploading replaces the previous file context for that session

## Goals

- Let users upload a `PDF` or Excel file directly from the existing chatbot UI
- Return an automatic first-pass analysis in the assistant response immediately after upload
- Preserve normalized document context for follow-up questions in the same chat session
- Support the feature in both `web` and `crm` modes without introducing a separate analysis workflow

## Non-Goals

- Multi-file session management
- Long-term document persistence
- Cross-session document recall
- Deep Excel formula evaluation or workbook auditing
- A standalone document analysis page outside chat

## User Experience

### Upload Flow

1. User opens either chatbot mode.
2. User selects a `PDF` or Excel file in the composer.
3. User may optionally add a prompt with the upload.
4. User sends the message.
5. The assistant responds in chat with:
   - a short summary of the uploaded file
   - important extracted fields, tables, or sheet highlights
   - notable issues, anomalies, or missing information when detected
   - an invitation to ask follow-up questions about the file

### Follow-Up Flow

1. After a successful upload, the file is treated as the active document for the current chat session.
2. Later user messages in that same session automatically include the normalized document context in backend prompt construction.
3. If the user uploads another file, the new file replaces the previous session document context.

### Failure Flow

- Unsupported file types are rejected with a clear assistant-safe message.
- Empty files are rejected.
- Oversized files are rejected.
- Parse or analysis failures return a user-readable error and do not overwrite the current session context.
- If session-scoped context is lost due to cache eviction or restart, the assistant asks the user to upload the file again.

## Architecture

### UI

Update [ChatClient](C:\Users\risha\OneDrive\Desktop\agent\agent\src\components\ChatClient.tsx) to:

- add a file input to the existing composer
- show the selected filename before send
- submit either plain JSON or `multipart/form-data` depending on whether a file is attached
- show upload/analysis loading state

The existing chat page and mode toggle remain unchanged.

### API Integration

Keep the existing route split:

- [web chat route](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\chat\web\route.ts) or the route it delegates to
- [CRM assistant route](C:\Users\risha\OneDrive\Desktop\agent\agent\src\app\api\crm-assistant\route.ts)

Each mode should support two request shapes:

- existing JSON chat requests when no file is attached
- `multipart/form-data` requests when a file is attached

The upload-capable flow should:

1. validate file type and size
2. parse the file into normalized analysis data
3. build a compact session document context
4. store that context under the current chat session ID
5. generate an assistant summary response using the uploaded content

### Session Storage

Store uploaded document context in session-scoped cache keyed by session ID and mode.

The stored structure should contain:

- file metadata:
  - name
  - mime type
  - uploaded timestamp
- normalized content:
  - PDF analysis output or workbook summary
- prompt-ready compact context string used for follow-up questions

Session storage should be ephemeral and aligned with the existing chat caching/session strategy. Mongo persistence is not required for this feature.

## File Processing

### PDF

Reuse [document analyser](C:\Users\risha\OneDrive\Desktop\agent\agent\src\lib\documentAnalyser.ts) where possible for PDF analysis, then normalize the returned content into:

- summary-ready extracted findings
- issues/anomalies
- compact prompt context for later Q&A

The existing analyzer is oriented toward lending documents. The integration should keep that specialization where useful, but the session context builder must produce stable output even when a PDF does not cleanly match the predefined checklist workflow.

### Excel

Add a workbook parser that converts Excel content into normalized chat context instead of treating the raw binary as model input.

For each workbook:

- enumerate sheet names
- capture per-sheet row counts and column headers
- include a bounded preview of representative rows
- detect obviously empty sheets or malformed tabular structure

The normalized result should then be summarized into:

- workbook overview
- sheet-level highlights
- notable irregularities
- compact prompt context for follow-up Q&A

The implementation should explicitly bound how much worksheet content is retained for prompting so uploads do not create unbounded token growth.

## Prompting and Follow-Up Q&A

After a successful upload:

- the immediate assistant response summarizes the uploaded file
- later user prompts in the same session automatically include the active document context

Follow-up behavior:

- if a session document exists, document context is injected ahead of the user message
- if no session document exists, chat falls back to current behavior without document awareness

The prompt should clearly separate:

- chat mode context (`web` or `crm`)
- normalized document context
- current user question

This reduces ambiguity and keeps later Q&A grounded in the uploaded file.

## Error Handling

Validation and runtime errors must return assistant-safe responses rather than raw stack traces.

Handled cases:

- unsupported MIME type or extension
- empty file
- file above configured size limit
- parsing failure
- analysis failure
- missing session document on follow-up after cache loss

When upload processing fails:

- do not replace the existing active session document
- return a user-facing error message
- keep normal chat available

## Testing Strategy

Follow TDD for implementation.

Required tests:

- PDF upload request produces an immediate analysis response
- Excel upload request produces an immediate analysis response
- follow-up message uses stored session document context
- unsupported file type is rejected
- empty upload is rejected
- parsing failure does not overwrite prior session document context

Testing focus should be on:

- parser/normalizer behavior
- route behavior for upload requests
- session context storage and follow-up retrieval

Client tests are only needed for non-trivial UI logic such as attachment state transitions. Most feature coverage should stay in server and library tests.

## Implementation Notes

- Keep the first version to one active file per session
- Prefer extending existing chat infrastructure over introducing a separate upload subsystem
- Keep UI changes minimal and aligned with the existing chat composer
- Bound retained Excel content to avoid oversized prompts
- Ensure the feature works for both anonymous/public web chat and authenticated CRM chat within their current authorization rules

## Risks and Trade-Offs

- Session-only storage is simpler and matches the requirement, but document context can disappear on restart or cache loss
- Direct route extension is the smallest change, but it mixes file parsing and chat concerns in the request layer
- Excel normalization is useful for summarization and Q&A, but it will not support full spreadsheet semantics in v1

## Recommended Approach

Implement document upload directly in the existing chatbot flow, use session-scoped cache for active document context, reuse the current PDF analyzer, and add bounded Excel normalization for workbook summarization and follow-up Q&A.
