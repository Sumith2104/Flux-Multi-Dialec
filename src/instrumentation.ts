// Fluxbase server instrumentation.
//
// In Next.js 15 + Turbopack, this file is analyzed through the Edge compiler
// which flags Node.js APIs (process.exit, process.once, fs, pg). Importing
// Node-only modules here causes warnings on every request.
//
// All Node.js initialization is handled lazily by the modules themselves:
// - config-validator.ts: called by individual routes on first request
// - tracing.ts: no-ops unless OTEL_EXPORTER_OTLP_ENDPOINT is set
// - shutdown.ts: pg.ts registers its own SIGTERM/SIGINT handlers when the pool is created
//
// This file exists as a hook point for future Edge-safe initialization.

export async function register() {
  // Intentionally empty — see comment above.
}
