# DESKFLOW: final implementation report

## Summary

DESKFLOW is a full-stack service request tracker for a small internal IT support team. Staff register requests that came in by phone, email or message, give each one an owner, move it through Open, In progress and Resolved, and leave internal notes. Every change is recorded with who made it and when. All requirements in the brief are implemented, together with the approved additional scope (smart assignment, workload balance and manager insights; deadline & escalation intelligence, below). 240 automated tests pass, and lint, strict typecheck and formatting are clean.

## Completed features

| Area                                                                                                                                                   | What works                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                                                                                                                                         | Email and password sign-in, bcrypt hashes, server-side sessions with sliding 8-hour expiry, HTTP-only `SameSite=Strict` cookie (`Secure` in production), CSRF token, sign-in rate limit, sign-out, expired sessions sent back to sign-in with a return path |
| Roles                                                                                                                                                  | Manager and Employee, enforced on the server for every endpoint; the UI hides what the user cannot do                                                                                                                                                       |
| Dashboard                                                                                                                                              | Totals by status, unassigned count, your workload, urgent and high counts, status split bar, recently updated requests, recent activity, quick create                                                                                                       |
| All requests                                                                                                                                           | Search (title, requester, contact, description, reference), filters (status, priority, source, assignee), sortable columns, server-side pagination, clear filters, row navigation, loading, error and empty states, filters kept in the URL                 |
| Create request                                                                                                                                         | Fields checked when you leave them (minimum lengths, contact with a phone, email or extension picker that filters what can be typed), double-submit protection (disabled button plus server idempotency key), success toast, opens the new request          |
| Request page                                                                                                                                           | Every field, lifecycle rail with Start work, Resolve and Reopen, edit dialog, assign, reassign and unassign (with confirmation), inline priority, resolution details, internal notes, activity history                                                      |
| My requests                                                                                                                                            | Your assigned requests with search, status and priority filters, and an empty state                                                                                                                                                                         |
| To review                                                                                                                                              | Open requests with no owner, most urgent first; managers set priority, deadline and owner in one step                                                                                                                                                       |
| Team                                                                                                                                                   | Members, roles, account status, active and resolved counts with a workload bar; managers add members and deactivate or reactivate accounts                                                                                                                  |
| Errors and loading                                                                                                                                     | Separate pages for page not found, request not found, no access, server error, server unreachable and crashes; errors inside one panel stay in that panel; skeletons shaped like each page while data loads                                                 |
|  PostgreSQL (Supabase) via Prisma with migrations, foreign keys, unique constraints, indexes, transactions, optimistic concurrency, an idempotent seed |
| Audit                                                                                                                                                  | Created, edited (per field), priority changed, assigned, reassigned, unassigned, status changed, resolved and reopened events, each with actor, old value, new value and time, saved in the same transaction as the change                                  |

## Additional scope: smart assignment, workload balance and manager insights

| Requirement                                     | Status | How                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request category                                | Done   | Already present (Hardware, Software, Network, Account access, Facilities, General support); required when reporting, editable by managers, validated on the server and in forms. "Access & accounts" and "Other" were relabelled to match the scope's wording; stored values are unchanged                                                                                                                      |
| Rules-based recommendation engine               | Done   | `server/src/recommendations/`: weights in one config file, pure scoring, data from the database only. Documented in [docs/recommendations.md](docs/recommendations.md)                                                                                                                                                                                                                                          |
| Experience, outcomes, speed, workload, fallback | Done   | Saturating experience; reopen-aware success rate smoothed towards the team; speed compared on the same category and priority; workload with an overload penalty; general experience as fallback. Deterministic tie-breaking                                                                                                                                                                                     |
| Thin data handled honestly                      | Done   | Confidence per candidate; rates and times shown only with 3+ resolutions; the panel says when a suggestion rests on workload or limited history                                                                                                                                                                                                                                                                 |
| Manager experience                              | Done   | Smart assignment panel on unassigned requests (best match, score, history, sample sizes, typical time, workload, reasons, alternatives), plus one-line suggestions in To review and the create form. Every assignment needs explicit confirmation; nothing is assigned automatically                                                                                                                            |
| Manager insights dashboard                      | Done   | The Insights page (linked from the manager dashboard): logged, open, in progress, resolved, unassigned, average time; status and priority mix; categories; volume and time to resolve over time; reopened requests; requests inactive 5+ days; per-employee active work and share, resolutions, fixes that held with sample size, average time and main categories. Filters: 7 days, 30 days, 90 days, all time |
| Contextual, not a ranking                       | Done   | Team table in name order, sample sizes on every rate, an explicit "not a ranking" note; no leaderboard                                                                                                                                                                                                                                                                                                          |
| Data integrity                                  | Done   | All numbers aggregated on the server from real records; manager-only endpoints; employee permissions unchanged; empty datasets and new accounts handled                                                                                                                                                                                                                                                         |
| Varied demo data                                | Done   | 160 seeded resolved requests over four months for five employees with clear specialties and weak spots, plus current work that shows deadlines and smart assignment (see [docs/database.md](docs/database.md#seed))                                                                                                                                                                                             |
| Out of scope, not built                         | —      | External AI, automatic assignment, automatic evaluations or rankings, predictions, similar-request search, ML infrastructure                                                                                                                                                                                                                                                                                    |

## Additional scope: deadline & escalation intelligence

| Requirement                  | Status | How                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional due date and time   | Done   | Already present; stored in UTC, set and changed by managers when creating or editing, recorded in the history. No deadline means no escalation                                                                                                                                                          |
| Background monitoring        | Done   | `server/src/deadlines/monitor.ts`: runs at startup and every minute in the API process, independent of any browser; also runs right after each change to a request. All state is in the database, so restarts and repeated runs are safe                                                                |
| Thresholds, short deadlines  | Done   | One config file; default 24-hour warning window. A request with less time left is approaching immediately                                                                                                                                                                                               |
| Scenarios A–D                | Done   | Unassigned (managers, with a Smart Assignment suggestion), assigned but not started (assignee and managers), in progress (assignee and managers, time left), overdue (assignee and managers, history entry, Needs attention). Resolved requests get no new reminders; reopened ones are monitored again |
| Original vs working priority | Done   | `priority` is never changed by the monitor; `escalatedPriority` holds the raised working priority (one step when approaching, two when overdue, capped at Urgent, optional manager minimum). Raises and returns are recorded in the history. This replaces the earlier rule that overwrote the priority |
| Persistent notifications     | Done   | `Notification` table with recipient, request, type, stage, title, message, created and read times. Bell with unread count, list, read and unread, and links to the request. Unique keys per person, request, stage and deadline cycle prevent duplicates                                                |
| Needs attention (managers)   | Done   | On the manager dashboard: unassigned approaching, not started, in progress approaching and overdue, with reference, title, assignee, working priority, time left or overdue duration, next step and a link. Computed live from the database                                                             |
| Employee view                | Done   | "Your deadlines" on the dashboard; deadline badges and countdowns on lists and requests; notifications for assignments and their own deadlines                                                                                                                                                          |
| Deadline status and audit    | Done   | `deadlineState` (on track, approaching, overdue, completed) separate from the lifecycle status; deadline set and changed, approaching, overdue, priority raised and returned, and resolved are all in the history                                                                                       |
| Tests and docs               | Done   | 17 API tests with simulated clocks (including the full eleven-step workflow), 3 frontend tests; [docs/deadlines.md](docs/deadlines.md), architecture, database and testing docs updated                                                                                                                 |

## Architecture

A React single-page app talks to an Express REST API on the same origin. The API owns all business rules and writes to PostgreSQL (Supabase) through Prisma. It is live on Vercel: [docs/deployment.md](docs/deployment.md). A `shared` package holds the Zod schemas, enums, lifecycle transitions and permission checks, and both sides use it. Details and diagrams: [docs/architecture.md](docs/architecture.md) and [docs/database.md](docs/database.md).

## Main technical decisions

- The project started on SQLite and moved to PostgreSQL on Supabase for the live deployment: same Prisma schema, migrations regenerated for Postgres, search made explicitly case-insensitive.
- Sessions live in their own table, which stores only a SHA-256 of the cookie token. Deactivating a user deletes their sessions in the same transaction.
- Each write sends the `version` it read. If someone else changed the request in between, the API answers 409 and the screen reloads with the latest data.
- The create form sends a key generated in the browser, so a double click, a retry or a second open tab still produces one request.
- `SR-000001` style numbers come from a counter row that is incremented inside the create transaction, so two requests can never get the same number.
- Every change is saved in the same transaction as its activity entries.
- Where the brief left room, duties are split cleanly. The manager creates, edits, assigns and tracks; they can reopen resolved work but never start or resolve it and are never an assignee. The assigned employee starts, notes and resolves the work and can reopen it. Unassigning a request that is in progress moves it back to Open. [docs/assumptions.md](docs/assumptions.md) lists each of these.

## Testing results

| Suite                                          | Tests   | Result         |
| ---------------------------------------------- | ------- | -------------- |
| API (Supertest, isolated `test` schema)        | 161     | passed         |
| Frontend (React Testing Library)               | 69      | passed         |
| End-to-end (Playwright, isolated `e2e` schema) | 10      | passed         |
| **Total**                                      | **240** | **all passed** |

Run on 18 November 2026. Smart assignment and manager insights added 16 scoring and endpoint tests, 4 insights API tests and 3 frontend tests. Deadline & escalation added 17 API tests run on simulated clocks (rules, the eleven-step workflow, duplicate prevention across restarts, reopen and deadline changes, time zones, notification and attention permissions) and 3 frontend tests (bell, manager and employee panels); 3 older tests for the replaced priority rule were removed.

The end-to-end run covers the full ten-step journey from the brief, a permission check across employees, persistence through a new server process, and a no-sideways-scroll check of every screen on phone, iPad and desktop sizes. A clean install from an empty folder (`npm ci`, setup, tests) was also verified. Coverage details and known gaps: [docs/testing.md](docs/testing.md).

## Reviews carried out

The security review found no critical or high issues. The one medium issue was that the dummy password hash used a lower bcrypt cost than real hashes, so login response time could reveal which emails have accounts. That is fixed and has a test. Three low issues are fixed and tested as well: the redirect guard rejects `/\host` paths, a non-ASCII CSRF header gets a 403 instead of a 500, and passwords are capped at bcrypt's 72-byte limit.

The UI review went through two rounds of desktop (1440 px) and mobile (390 px) screenshots. The first round raised eight items and the second marked six of them resolved. The last three were fixed afterwards and checked by screenshot. They covered title width in the requests table, the unassigned marker on the dashboard, tabular numerals, the logo on the mobile sign-in page, the workload bar scale and the length of assignee labels.

## Known issues and limitations

- In production the session cookie is `Secure` only when `NODE_ENV=production`. Deploy over HTTPS with that variable set.
- The sign-in rate limit is per IP and trusts only a loopback proxy. Behind another proxy or load balancer, set Express `trust proxy` to match, or every user shares one limit.
- `npm audit` reports advisories in `deepmerge-ts`, pulled in by the Prisma CLI tooling. It is not used at request time and goes away with a future Prisma upgrade.
- The client bundle is about 670 kB before compression (one chunk). Route-level code splitting would reduce first load.
- Demo credentials are documented in the README only, not shown in the app. A real deployment should change the seeded passwords.
- Two places build the navy "New request" link by hand instead of using the shared button component; it looks the same but is duplicated styling.
- Employees see their own and reported requests plus all resolved ones; the team list shows them names and workload only. Dashboard totals for employees are counted over what they can see.

## Unfinished functionality

Everything the brief requires is built. These were left out because the brief does not ask for them: self-service password reset by email (managers reset passwords instead), notifications, attachments, SLA timers, request deletion, editing or deleting notes, and integrations with email, phone or chat.

## Future improvements

- Email or in-app notifications when a request is assigned to you
- SLA targets per priority, with overdue highlighting
- Saved filters and a keyboard command palette
- Attachments (screenshots, logs)
- Postgres and a container image for multi-instance deployment
- Route-level code splitting and an axe accessibility check in CI

## How to run and demonstrate

```bash
npm install
cp server/.env.example server/.env
npm run setup        # migrate + seed
npm run dev          # http://localhost:5173
```

Sign in as `growin@deskflow.test` (manager) or `dean@deskflow.test` (employee). The password for every demo account is `Deskflow!2026`. The step-by-step demo is in [README.md](README.md#demo-walkthrough).
