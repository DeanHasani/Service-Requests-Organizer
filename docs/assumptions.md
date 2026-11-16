# Assumptions

## Business

- Requests come in by phone, email or message. A staff member types them in. There is no integration with any of those channels.
- The requester is not a user. They never log in and are never notified.
- One request has at most one assignee at a time. Pairing up is handled through notes.
- Everyone can see every request. Visibility is not the problem being solved; ownership is.
- Notes are internal only.

## Roles

| Action                                                         | Manager     | Employee                               |
| -------------------------------------------------------------- | ----------- | -------------------------------------- |
| View all requests, details, notes, activity                    | Yes         | Yes                                    |
| Create a request                                               | Yes         | Yes (may only assign it to themselves) |
| Edit details (title, description, requester, source, priority) | Any request | Only requests assigned to them         |
| Change status (incl. resolve / reopen)                         | Any request | Only requests assigned to them         |
| Add a note                                                     | Any request | Only requests assigned to them         |
| Assign, reassign, unassign                                     | Any request | No                                     |
| Claim an unassigned request                                    | Yes         | Yes (assigns it to themselves)         |
| View team and workload                                         | Yes         | Yes (read-only)                        |
| Create users, activate / deactivate                            | Yes         | No                                     |

Decisions where the brief was open:

- **Employees can change priority** on their own requests. The brief lists "change priority" under managers but also says employees can "update requests assigned to them". Priority is part of the request, so it follows the same rule.
- **Employees can claim unassigned requests.** The core problem is "nobody knows who is responsible". Letting someone say "mine" without waiting for a manager fixes that directly. They still cannot take a request from a colleague.
- **Employees can reopen** their own resolved requests, since reopening is a status change.
- **Team page is visible to employees** (read-only) so they can see who is busy. Account management controls are manager-only.

## Request lifecycle

```
OPEN ──▶ IN_PROGRESS ──▶ RESOLVED
  │                         ▲  │
  └─────────────────────────┘  │
  ▲                            │
  └────────── reopen ──────────┘
```

- New requests are always `OPEN`.
- `IN_PROGRESS` needs an active assignee.
- `IN_PROGRESS → OPEN` is not allowed (not in the brief). Unassigning an in-progress request moves it back to `OPEN` automatically, since in-progress without an owner would break the rule above.
- Resolving stores `resolvedBy` and `resolvedAt`. Reopening clears both; the activity log keeps the old values.
- A resolved request cannot be edited or reassigned until it is reopened. Notes are still allowed, so people can add follow-up context.

## Accounts

- No public sign-up. Accounts come from the seed or are created by a manager.
- Deactivating a user: revokes their sessions, blocks login, and unassigns their unresolved requests (logged in activity, in one transaction). Their history stays.
- A manager cannot deactivate themselves, so the system always keeps at least one manager able to sign in.
- Nothing is ever hard-deleted. Foreign keys use `RESTRICT`.

## Technical

- Single company, single timezone. Dates are stored in UTC and shown in the browser's locale.
- Small team (tens of users, thousands of requests). SQLite is enough.
- Sessions last 8 hours and slide forward while in use.
- Search matches reference, title, requester name, requester contact and description, case-insensitive for ASCII (SQLite `LIKE`).

## Out of scope

- Email/phone/chat integrations, notifications, attachments, SLAs, multi-tenant, public sign-up, password reset, request deletion.
