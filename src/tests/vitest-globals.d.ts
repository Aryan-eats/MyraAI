// Registers Vitest's global test APIs (describe, it, expect, vi, ...) for the
// TypeScript compiler. Vitest injects these at runtime via `globals: true` in
// vitest.config.mjs; this reference makes them known to `tsc`/`next build`.
/// <reference types="vitest/globals" />
