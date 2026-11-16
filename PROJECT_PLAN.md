# DESKFLOW — Project Plan

Internal service request tracker. One place to register, assign, track and resolve requests that arrive by phone, email or message.

Status legend: `[x]` done, `[ ]` open.

## Architecture decisions

| Decision                                                                         | Why                                                                                                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| npm workspaces monorepo: `shared`, `server`, `client`                            | One install, one set of Zod schemas used by both sides.                                                                             |
| Express 5 + TypeScript, run with `tsx`                                           | No build step for the server, so `shared` TS source works in both server and Vite with no packaging.                                |
| SQLite + Prisma 6                                                                | Persistent, zero-infrastructure, real migrations. Prisma 6 is the last major without mandatory driver adapters.                     |
| Custom session table instead of `express-session`                                | About 60 lines, fully typed, stores only a SHA-256 of the token, and makes "revoke all sessions on deactivation" a one-line delete. |
| Synchronizer CSRF token stored on the session                                    | Sent as `X-CSRF-Token` on every mutating call. Cookie is also `SameSite=Strict`.                                                    |
| Optimistic concurrency via `version` column                                      | Every write sends the version it read. Mismatch returns 409 so two people cannot silently overwrite each other.                     |
| Idempotency key (`clientRequestId`) on create                                    | Double-clicks and retries return the same request instead of a duplicate.                                                           |
| Reference numbers from a `Counter` row incremented inside the create transaction | SQLite serialises writes, so `SR-000001` style numbers can never collide.                                                           |
| Every write and its activity log in one `$transaction`                           | The audit trail can never disagree with the data.                                                                                   |

## Phases

### Phase 1: Planning and inspection

- [x] Inspect repo (empty, git remote connected)
- [x] Read brief (`../README.md`) and master prompt
- [x] Glossary, assumptions, plan

### Phase 2: Foundation

- [x] Workspace, strict TS, ESLint, Prettier
- [x] Shared enums, Zod schemas, DTO types, lifecycle and permission rules
- [x] Prisma schema, first migration, idempotent seed (4 users, 18 requests)

### Phase 3: Backend

- [x] Env config, error handler, response format
- [x] Sessions, login/logout/me, CSRF, login rate limit
- [x] Users: list, detail, workload, create, activate/deactivate (manager)
- [x] Requests: list (search/filter/sort/paginate), detail, create, edit
- [x] Status transitions and resolution metadata
- [x] Assignment, reassignment, unassignment, self-claim
- [x] Notes, activity (per request and global), dashboard summary
- [x] Supertest suite on an isolated DB

### Phase 4: Frontend

- [x] Design tokens, app shell, navy sidebar with sliding active indicator
- [x] Login (validation, password toggle, demo accounts)
- [x] Dashboard
- [x] All requests table (mobile card list below md)
- [x] Create request
- [x] Request details (edit, assign, priority, status, notes, activity)
- [x] My requests, Unassigned, Team (add member, deactivate/reactivate)
- [x] Motion: page entrance, lifecycle rail fill, list enter/exit, dialogs, drawer, toasts; reduced motion respected

### Phase 5: Integration

- [x] Session expiry handling in client (401 → sign-in with return path)
- [x] 409 conflict handling (toast + refetch)
- [x] Production build served by the API (same origin)

### Phase 6: Testing

- [x] Server: auth, creation, management, status, notes, authorization (78 tests)
- [x] Client: forms, states, filters, details, redirect guard (26 tests)
- [x] Playwright: full manager → employee → manager journey (3 tests)
- [x] Persistence after restart

### Phase 7: Security and quality review

- [x] Security review; Medium finding (login timing) and three Low findings fixed with tests
- [x] UI review at desktop and mobile sizes, two fix rounds
- [x] Lint, typecheck, formatting clean

### Phase 8: Documentation

- [x] README, docs/architecture.md, docs/database.md, docs/assumptions.md, docs/testing.md
- [x] FINAL_IMPLEMENTATION_REPORT.md

## Risks

| Risk                        | Impact           | Mitigation                                                               |
| --------------------------- | ---------------- | ------------------------------------------------------------------------ |
| SQLite write contention     | Low (small team) | Serialised writes; short transactions.                                   |
| Session expiry mid-edit     | Med              | Client catches 401 globally and redirects to login with the return path. |
| Concurrent edits            | Med              | `version` check, 409 + refetch.                                          |
| Playwright browser download | Low              | Chromium only.                                                           |

## Remaining work

None for the assignment scope. Possible next steps are listed in FINAL_IMPLEMENTATION_REPORT.md.
