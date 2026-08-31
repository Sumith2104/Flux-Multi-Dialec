# Fluxbase — Remaining TODOs

> Last updated: 2026-08-28 15:44

---

## A. Wiring & Polish (backend)

| # | Task | Status |
|---|------|--------|
| A1 | Wire `config-validator.ts` into startup | [x] |
| A2 | Wire `shutdown.ts` into startup | [x] |
| A3 | Wire `tracing.ts` into startup | [x] |
| A4 | Rate limiting module | [x] |
| A5 | CSP + security headers | [x] |
| A6 | Refactor `SqlEngine` to use `DatabaseAdapter` | [ ] |
| A7 | Fix `MySqlAdapter` param style (`$1` → `?`) | [ ] |

## B. UI Fixes

| # | Task | Status |
|---|------|--------|
| B1 | Add viewport/OG/theme-color meta tags to root layout | [x] |
| B2 | Root layout title template for auth pages | [x] |
| B3 | Fix `navigator.clipboard.writeText` missing `.catch()` | [x] |
| B4 | Fix stray `console.error` in settings/page.tsx | [x] |
| B5 | Add error boundary around app layout | [x] |

## C. Testing (manual)

| # | Task | Status |
|---|------|--------|
| C1 | Integration test: refresh token flow | [ ] |
| C2 | Integration test: auto-REST CRUD | [ ] |
| C3 | Integration test: CORS origin checking | [ ] |
| C4 | Integration test: scope enforcement | [ ] |

---

## What's left

Only **A6-A7** (SqlEngine adapter refactor + MySQL param fix) and **C1-C4** (integration tests) remain. A6 is a 2-3 hour internal refactor with no user-visible change. A7 is 15 min. C1-C4 need a running test database.