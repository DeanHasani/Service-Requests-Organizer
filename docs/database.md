# Database

PostgreSQL (Supabase), managed by Prisma. The live site uses the `public` schema; local dev, API tests and e2e tests use the `dev`, `test` and `e2e` schemas ([deployment.md](deployment.md)). Migrations were regenerated for Postgres as one `init` migration when the project moved off SQLite. Schema: [`server/prisma/schema.prisma`](../server/prisma/schema.prisma). Migrations: `server/prisma/migrations/`.

## Entity relationships

```mermaid
erDiagram
  User ||--o{ Request : "assigned (assignedToId)"
  User ||--o{ Request : "created (createdById)"
  User ||--o{ Request : "resolved (resolvedById)"
  User ||--o{ RequestNote : writes
  User ||--o{ ActivityLog : performs
  User ||--o{ Session : has
  User ||--o{ Notification : receives
  Request ||--o{ Notification : about
  Request ||--o{ RequestNote : has
  Request ||--o{ ActivityLog : has

  User {
    int id PK
    string name
    string email UK
    string passwordHash
    enum role "MANAGER | EMPLOYEE"
    boolean isActive
    boolean mustChangePassword "temporary password set"
    datetime deletedAt "account closed; name kept on history"
    int deletedById FK
    datetime createdAt
    datetime updatedAt
  }
  Request {
    int id PK
    string referenceNumber UK "SR-000001"
    string clientRequestId UK "idempotency key"
    string title
    string description
    string requesterName
    string requesterContact
    enum source "PHONE | EMAIL | MESSAGE | OTHER"
    enum category "HARDWARE | SOFTWARE | NETWORK | ACCESS | FACILITIES | OTHER (null = uncategorised)"
    enum priority "LOW | NORMAL | HIGH | URGENT (as chosen; never changed by the monitor)"
    enum escalatedPriority "working priority raised by the deadline monitor, or null"
    enum deadlineState "ON_TRACK | APPROACHING | OVERDUE | COMPLETED, or null without a deadline"
    int deadlineCycle "bumped when the deadline changes or the request is reopened"
    int priorityRank "0..3, for sorting"
    enum status "OPEN | IN_PROGRESS | RESOLVED"
    int version "optimistic concurrency"
    int assignedToId FK "nullable"
    int createdById FK
    int resolvedById FK "nullable"
    datetime resolvedAt "nullable"
    datetime createdAt
    datetime updatedAt
  }
  RequestNote {
    int id PK
    int requestId FK
    int authorId FK
    string content
    datetime createdAt
    datetime updatedAt
  }
  ActivityLog {
    int id PK
    int requestId FK
    int actorId FK
    enum actionType
    string fieldName "nullable"
    string oldValue "nullable"
    string newValue "nullable"
    string description
    datetime createdAt
  }
  Session {
    string id PK "sha256 of cookie token"
    int userId FK
    string csrfToken
    datetime expiresAt
    datetime createdAt
  }
  Counter {
    string name PK
    int value
  }
```

`ActivityLog.actionType` is one of `CREATED`, `UPDATED`, `PRIORITY_CHANGED`, `ASSIGNED`, `REASSIGNED`, `UNASSIGNED`, `STATUS_CHANGED`, `RESOLVED`, `REOPENED`.

### Deadlines, escalation and notifications

- `Request.dueAt` is stored in UTC. `deadlineState`, `escalatedPriority`, `escalatedAt` and `deadlineCycle` are maintained by the deadline monitor; `priorityRank` follows the working priority (`escalatedPriority ?? priority`) so lists sort by it. `escalateTo` is an optional minimum a manager sets.
- `ActivityLog.actorId` is null for automatic events written by the monitor (`DEADLINE_APPROACHING`, `DEADLINE_OVERDUE`, `PRIORITY_ESCALATED`, `PRIORITY_RESTORED`).
- `Notification(id, recipientId, requestId?, type, stage?, title, message, dedupeKey UNIQUE, readAt?, createdAt)` with an index on `(recipientId, readAt, createdAt)`. The unique `dedupeKey` is what prevents duplicate reminders. Notifications are deleted with their recipient or request (cascade).

See [deadlines.md](deadlines.md) for the rules.

## Foreign keys

| From                    | To           | On delete |
| ----------------------- | ------------ | --------- |
| `Request.assignedToId`  | `User.id`    | RESTRICT  |
| `Request.createdById`   | `User.id`    | RESTRICT  |
| `Request.resolvedById`  | `User.id`    | RESTRICT  |
| `RequestNote.requestId` | `Request.id` | RESTRICT  |
| `RequestNote.authorId`  | `User.id`    | RESTRICT  |
| `ActivityLog.requestId` | `Request.id` | RESTRICT  |
| `ActivityLog.actorId`   | `User.id`    | RESTRICT  |
| `Session.userId`        | `User.id`    | CASCADE   |

Nothing in the app deletes users, requests, notes or activity. `RESTRICT` makes sure a stray delete can never orphan history. Sessions are disposable, so they cascade.

## Constraints

- `User.email` unique. Emails are trimmed and lower-cased before saving and lookup.
- `Request.referenceNumber` unique; generated as `SR-` + six digits from the `Counter` row named `request`, inside the create transaction.
- `Request.clientRequestId` unique; a repeated create with the same key returns the existing request instead of a duplicate.
- Enums (`Role`, `Status`, `Priority`, `Source`, `ActionType`) are enforced by Prisma and by Zod at the API boundary.
- Passwords are stored only as bcrypt hashes (cost 12). Session tokens are stored only as SHA-256 hashes.

## Indexes

| Table       | Index                    | Serves                                 |
| ----------- | ------------------------ | -------------------------------------- |
| Request     | `status`                 | status filter, dashboard counts        |
| Request     | `(assignedToId, status)` | My requests, Unassigned, team workload |
| Request     | `priorityRank`           | sort by priority                       |
| Request     | `createdAt`, `updatedAt` | default sorts, recent lists            |
| RequestNote | `(requestId, createdAt)` | notes on a request, in order           |
| ActivityLog | `(requestId, createdAt)` | request history                        |
| ActivityLog | `createdAt`              | global recent activity feed            |
| Session     | `userId`                 | revoke all sessions for a user         |
| Session     | `expiresAt`              | purge expired sessions                 |

Unique constraints (`email`, `referenceNumber`, `clientRequestId`) also create indexes.

## Transactions

Every operation that changes a request runs in one Prisma interactive transaction together with its activity entries:

- create (counter increment + insert + `CREATED` and optional `ASSIGNED` activity)
- edit (version-checked update + one activity entry per changed field)
- status change (version-checked update + resolution fields + activity)
- assignment (version-checked update + optional automatic return to Open + activity)
- user deactivation (flag + delete sessions + release each unresolved request with activity)

The version check is an `updateMany ... where { id, version }`. If it matches zero rows, the transaction throws and rolls back and the API answers `409 STALE_VERSION`.

## Seed

`npm run db:seed` upserts four users by email and inserts 18 requests keyed by fixed `clientRequestId`s, each with backdated activity and notes. Running it again skips everything that exists.

It also adds 160 resolved requests spread over four months so analytics and smart assignment have real history to work from. Who handled each one, how fast and whether it was reopened follow a fixed per-person profile, generated deterministically so every run produces the same data:

- **Dean**: network (switches, VPN, Wi-Fi); slow and error-prone on building issues
- **Roman**: hardware (laptops, printers, peripherals); avoids software installs
- **Roxanne**: accounts and access (onboarding, MFA, permissions), software second
- **Mira**: office operations (facilities, moves, events, errands), handy with hardware
- **Theo**: software and licences, second-best on the network; not one for facilities

The current requests include unassigned work due soon (so smart assignment has something to suggest), a busy Dean (so workload balancing shows), and a mix of overdue, due-soon and on-track deadlines. History is keyed `…-9200-…` and replaces earlier versions (`…-9000-…`, `…-9100-…`).

`npm run db:demo` (seed with `--fresh`) first removes all requests, notes, history, notifications, sessions and non-demo accounts, and resets the demo accounts, so the data is exactly this story with dates relative to now. Run it before a presentation.

Fields added since the first release, each with its own migration: `User.mustChangePassword`, `User.deletedAt` and `deletedById`, `Request.dueAt`, `Request.category`, and the automatic priority rule (`escalateTo`, `escalatedAt`, `escalationById`).
