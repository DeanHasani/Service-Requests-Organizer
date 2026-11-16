# Architecture

## Overview

DESKFLOW is a single-page React app talking to an Express REST API over JSON. The API owns every business rule and permission check and persists to SQLite through Prisma. A small `shared` package holds the Zod schemas, enums, lifecycle rules and permission helpers, so the client and server validate and decide the same way.

```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>React Router, TanStack Query,<br/>React Hook Form + Zod]
  end
  subgraph Server["Node.js process"]
    MW[Express middleware<br/>helmet, JSON parser, cookies,<br/>rate limit, requireAuth, requireCsrf]
    R[routes.ts<br/>REST endpoints]
    S[services<br/>requests.ts, users.ts]
    E[error handler]
    P[(Prisma Client)]
  end
  DB[(SQLite file<br/>dev.db)]
  SH[[shared<br/>schemas, enums,<br/>canWorkOn / canAssign /<br/>canTransition]]

  UI -- "fetch /api/*<br/>cookie + X-CSRF-Token" --> MW --> R --> S --> P --> DB
  R --> E
  SH -. imported by .-> UI
  SH -. imported by .-> R
  SH -. imported by .-> S
```

In development Vite serves the client on `:5173` and proxies `/api` to the API on `:4000`, so the browser sees one origin. In production the API serves the built client from `client/dist`, again one origin. No CORS is needed in either case.

## Frontend and backend communication

- Every endpoint is under `/api` and returns either `{ "data": ... }` or `{ "error": { "code", "message", "details?" } }`.
- Status codes: `400` validation, `401` not signed in or session expired, `403` not allowed or bad CSRF token, `404` missing, `409` stale version or duplicate, `422` business-rule violation (invalid transition, inactive assignee, resolved request), `429` too many sign-in attempts.
- The client wraps `fetch` in `client/src/lib/api.ts`. It adds the CSRF header on writes and turns errors into `ApiError`. Any `401` clears the cache and sends the user to sign-in with a `?next=` return path.
- TanStack Query caches reads. After a write, the affected lists, the request, its notes and activity, the dashboard and the team counts are refetched.
- List screens keep their filters in the URL. Search, filtering, sorting and pagination all run on the server.

### Endpoints

| Method | Path                           | Who                                               |
| ------ | ------------------------------ | ------------------------------------------------- |
| POST   | `/api/auth/login`              | anyone (rate limited)                             |
| POST   | `/api/auth/logout`             | signed in                                         |
| GET    | `/api/auth/me`                 | signed in                                         |
| GET    | `/api/users`, `/api/users/:id` | signed in                                         |
| POST   | `/api/users`                   | manager                                           |
| PATCH  | `/api/users/:id` (`isActive`)  | manager                                           |
| GET    | `/api/requests`                | signed in                                         |
| GET    | `/api/requests/:id`            | signed in                                         |
| POST   | `/api/requests`                | signed in                                         |
| PATCH  | `/api/requests/:id`            | manager or assignee                               |
| PATCH  | `/api/requests/:id/status`     | manager or assignee                               |
| PATCH  | `/api/requests/:id/assignment` | manager; employee may claim an unassigned request |
| GET    | `/api/requests/:id/notes`      | signed in                                         |
| POST   | `/api/requests/:id/notes`      | manager or assignee                               |
| GET    | `/api/requests/:id/activity`   | signed in                                         |
| GET    | `/api/activity?limit=`         | signed in                                         |
| GET    | `/api/dashboard`               | signed in                                         |
| GET    | `/api/health`                  | anyone                                            |

`GET /api/requests` accepts `q`, `status`, `priority`, `source`, `assignee` (`me`, `none` or a user id), `sort` (`createdAt`, `updatedAt`, `priority`, `referenceNumber`, `title`), `order`, `page` and `pageSize` (max 100).

## Authentication flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant D as SQLite
  B->>A: POST /api/auth/login {email, password}
  A->>D: find user by email
  A->>A: bcrypt.compare (dummy hash if email unknown)
  A->>D: insert Session {id: sha256(token), csrfToken, expiresAt}
  A-->>B: Set-Cookie deskflow_sid=token (HttpOnly, SameSite=Strict, Secure in prod)<br/>body: {user, csrfToken}
  B->>A: PATCH /api/requests/7/status + cookie + X-CSRF-Token
  A->>D: load session by sha256(cookie), check expiry and user.isActive
  A->>A: compare CSRF token (constant time), check permission
  A->>D: transaction: update request (version check) + insert activity
  A-->>B: 200 {data: request}
```

- The cookie holds a random 256-bit token. The database stores only its SHA-256, so a leaked database cannot be replayed as sessions.
- Sessions last 8 hours and slide forward when less than half the time is left. Expired sessions are rejected with `SESSION_EXPIRED` and purged hourly.
- Deactivating a user deletes their sessions in the same transaction, so they are signed out at once.
- CSRF: a per-session synchronizer token must match the `X-CSRF-Token` header on every non-GET call. The cookie is also `SameSite=Strict`. Login itself only accepts a JSON body, which a cross-site form cannot send.
- Role and identity always come from the session row. The server ignores anything the client says about who it is.

## Main modules

| Module                            | Responsibility                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `shared/src/domain.ts`            | Enums, labels, `TRANSITIONS`, `canTransition`, `canWorkOn`, `canAssign`, `formatReference` |
| `shared/src/schemas.ts`           | Zod schemas for every request body and query, used by both server and forms                |
| `server/src/auth.ts`              | Session create/verify/end, `requireAuth`, `requireCsrf`, `requireRole`                     |
| `server/src/routes.ts`            | HTTP layer: parse, authorize, call a service, shape the response                           |
| `server/src/services/requests.ts` | Lifecycle, assignment, edits, reference numbers, idempotent create, activity logging       |
| `server/src/services/users.ts`    | Team workload, user creation, deactivation (revoke sessions + release work)                |
| `server/src/lib/errors.ts`        | `AppError`, Zod-to-400 mapping, central error handler that never leaks internals           |
| `client/src/lib/*`                | API client, auth context, query hooks, formatting                                          |
| `client/src/components/*`         | Design-system primitives, status/priority badges, lifecycle rail, activity list, app shell |
| `client/src/pages/*`              | One file per screen                                                                        |

## Technical decisions and tradeoffs

| Decision                                                 | Why                                                                                                                                                         | Tradeoff                                                                                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite + Prisma                                          | Real relational DB with migrations, no server to run, one file to back up.                                                                                  | One writer at a time; fine for a small team, not for hundreds of concurrent users. Postgres is a `provider` change plus a migration. |
| Prisma 6                                                 | Prisma 7 requires driver adapters and a new config file. Version 6 is stable and simpler to set up.                                                         | Will need an upgrade eventually.                                                                                                     |
| Custom session table instead of `express-session`        | About 60 lines, typed, stores only token hashes, easy to revoke per user.                                                                                   | Our own code to maintain instead of a library.                                                                                       |
| Server runs TypeScript through `tsx`                     | No build step; the `shared` package is consumed as source by both sides.                                                                                    | Slightly slower cold start than compiled JS.                                                                                         |
| Optimistic concurrency (`version`)                       | Two people editing the same request cannot silently overwrite each other; the loser gets a clear `409` and the screen refreshes.                            | Clients must send the version they read.                                                                                             |
| Idempotency key on create                                | Double-clicks, retries after a timeout and two tabs submitting the same form all produce one request.                                                       | One extra unique column.                                                                                                             |
| Reference numbers from a counter row                     | The counter is incremented inside the create transaction; SQLite serialises writes, so numbers never repeat. A concurrency test creates 8 requests at once. | Numbers are not reused if a create is rolled back. That is fine for a reference.                                                     |
| Business rule + audit write in one transaction           | The activity log can never disagree with the data.                                                                                                          | Slightly longer transactions.                                                                                                        |
| Priority stored with a numeric rank                      | Sorting by priority gives Urgent > High > Normal > Low instead of alphabetical order.                                                                       | One denormalised column, written by the service.                                                                                     |
| Unassigning an in-progress request moves it back to Open | "In progress" requires an owner (brief rule); the alternative would leave an impossible state.                                                              | An extra activity entry explains it.                                                                                                 |
| No hard deletes                                          | History has to stay intact, so foreign keys are `RESTRICT` and users are deactivated with their history kept.                                               | Data only grows; acceptable at this scale.                                                                                           |
| URL-held list filters                                    | Filters survive reloads and can be shared as links.                                                                                                         | None                                                                                                                                 |
| Motion only where it explains a change                   | Lifecycle rail fill on status change, sliding nav indicator, list items entering/leaving, dialogs and drawer. Respects reduced-motion settings.             | None                                                                                                                                 |
