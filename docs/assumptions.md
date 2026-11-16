# Assumptions

## Business

- Requests come in by phone, email or message. A staff member types them in. There is no integration with any of those channels.
- The requester is not a user. They never log in and are never notified.
- One request has at most one assignee at a time. Pairing up is handled through notes.
- Everyone can see every request. The problem the brief describes is unclear ownership, so all staff keep full visibility.
- Notes are internal only.

## Roles

| Action                                                         | Manager     | Employee                               |
| -------------------------------------------------------------- | ----------- | -------------------------------------- |
| View all requests, details, notes, activity                    | Yes         | Yes                                    |
| Create a request                                               | Yes         | Yes (may only assign it to themselves) |
| Edit details (title, description, requester, source, priority) | Any request | Only requests assigned to them         |
| Change status (incl. resolve / reopen)                         | Any request | Only requests assigned to them         |
| Add a note                                                     | Any request | Only requests assigned to them         |
| Assign, reassign, unassign (to employees only)                 | Any request | No                                     |
| Be the assignee of a request                                   | No          | Yes                                    |
| Claim an unassigned request                                    | No          | Yes (assigns it to themselves)         |
| View team and workload                                         | Yes         | Yes (read-only)                        |
| Create users, activate / deactivate                            | Yes         | No                                     |

Decisions where the brief was open:

- Employees can change the priority of their own requests. The brief lists "change priority" under managers but also says employees can "update requests assigned to them". Priority is part of the request, so it follows the same rule.
- Managers are never assignees. The manager triages and hands out work, and only active employees can own a request. The server rejects assigning a manager and the assignee pickers list employees only. For the same reason managers have no My requests page, and their dashboard shows the team's workload instead of their own.
- Employees can claim unassigned requests. The core problem in the brief is that nobody knows who is responsible, and letting someone say "mine" without waiting for a manager fixes that. They still cannot take a request from a colleague.
- Employees can reopen their own resolved requests, since reopening is a status change.
- Employees can see the Team page (read only) so they know who is busy. Only managers get the account controls.

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
- Moving from `IN_PROGRESS` back to `OPEN` is not allowed (not in the brief). Unassigning an in-progress request moves it back to `OPEN` automatically, since in-progress without an owner would break the rule above.
- Resolving stores `resolvedBy` and `resolvedAt`. Reopening clears both; the activity log keeps the old values.
- A resolved request cannot be edited or reassigned until it is reopened. Notes are still allowed, so people can add follow-up context.

## Accounts

- No public sign-up. Accounts come from the seed or are created by a manager.
- Deactivating a user revokes their sessions, blocks login and unassigns their unresolved requests, all in one transaction and recorded in the activity history. Their past work stays.
- A manager cannot deactivate themselves, so the system always keeps at least one manager able to sign in.
- Nothing is ever hard-deleted. Foreign keys use `RESTRICT`.

## Technical

- Single company, single timezone. Dates are stored in UTC and shown in the browser's locale.
- Small team (tens of users, thousands of requests). SQLite is enough.
- Sessions last 8 hours and slide forward while in use.
- Search matches reference, title, requester name, requester contact and description, case-insensitive for ASCII (SQLite `LIKE`).

## Out of scope

- Email/phone/chat integrations, notifications, attachments, SLAs, multi-tenant, public sign-up, password reset, request deletion.
