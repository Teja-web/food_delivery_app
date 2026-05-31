# Task Management Backend Test Plan

## Scope

Single-user Task Management System v1. Authentication is not included in v1. The backend uses Node.js, Express.js, TypeScript, PostgreSQL, Drizzle ORM, Zod validation, and Vitest or Jest with Supertest.

## Suggested Folder Structure

```text
src/
  app.ts
  server.ts
  db/
    index.ts
    schema/
      tasks.ts
  routes/
    tasks.routes.ts
  services/
    tasks.service.ts
  validation/
    task.schemas.ts
  http/
    problem.ts
tests/
  api/
    tasks.contract.test.ts
  integration/
    tasks.persistence.test.ts
  validation/
    tasks.validation.test.ts
  support/
    task-api-assertions.ts
    test-db.ts
drizzle/
  migrations/
```

## Drizzle Schema Definitions Required

`src/db/schema/tasks.ts` should define:

| Column | API Field | Required | Notes |
| --- | --- | --- | --- |
| `id` | `id` | yes | Generated stable identifier, preferably UUID. |
| `title` | `title` | yes | Non-empty string. |
| `description` | `description` | no | Nullable text. |
| `status` | `status` | yes | Enum: `todo`, `in_progress`, `done`; default `todo`. |
| `priority` | `priority` | yes | Enum: `low`, `med`, `high`; default can be `med` if omitted. |
| `due_date` | `dueDate` | yes | Required date. |
| `created_at` | `createdAt` | yes | Defaults to current timestamp. |
| `updated_at` | `updatedAt` | yes | Updated on mutation. |

Required index:

```text
tasks_status_due_date_idx on (status, due_date)
```

## Route Handlers Required

| Handler | Responsibility |
| --- | --- |
| `POST /tasks` | Validate create payload, insert task, return `201 Created`. |
| `GET /tasks` | Return all tasks or filter by `status` query. |
| `GET /tasks/:id` | Return one task or `404` problem details. |
| `PATCH /tasks/:id` | Apply RFC 7396 merge-patch update idempotently. |
| `DELETE /tasks/:id` | Delete task, return `204 No Content`, then make it unretrievable. |

## Validation Rules

| Field | Create | Patch | Rules |
| --- | --- | --- | --- |
| `title` | required | optional | Must be a non-empty trimmed string. |
| `description` | optional | optional | String or null. |
| `status` | optional | optional | Must be `todo`, `in_progress`, or `done`; default `todo` on create. |
| `priority` | optional | optional | Must be `low`, `med`, or `high`; default should be deterministic. |
| `dueDate` | required | optional | ISO date string. |

All validation failures return:

```text
HTTP 400
Content-Type: application/problem+json
```

Problem details must include `type`, `title`, `status`, and `detail`.

## Implementation Checklist

- [ ] Add package test dependencies: Vitest or Jest, Supertest, and any TypeScript test runtime.
- [ ] Export Express `app` from `src/app.ts` without starting the server.
- [ ] Add Drizzle `tasks` schema with enum constraints/defaults.
- [ ] Add migration for `tasks` table and `(status, due_date)` composite index.
- [ ] Add test database connection and cleanup strategy.
- [ ] Add Zod create, patch, path param, and query validation schemas.
- [ ] Add RFC 7807 problem response helper.
- [ ] Implement `POST /tasks`.
- [ ] Implement `GET /tasks` and `GET /tasks?status=:status`.
- [ ] Implement `GET /tasks/:id`.
- [ ] Implement idempotent `PATCH /tasks/:id` with merge-patch semantics.
- [ ] Implement `DELETE /tasks/:id`.
- [ ] Run tests and fix implementation until contract, integration, and validation tests pass.

## File-by-File Development Plan

| File | Purpose |
| --- | --- |
| `tests/api/tasks.contract.test.ts` | HTTP contract, status codes, response shape, RFC 7807 behavior. |
| `tests/integration/tasks.persistence.test.ts` | Verifies API operations persist through Drizzle/PostgreSQL. |
| `tests/validation/tasks.validation.test.ts` | Edge cases for invalid title, status, priority, filter, patch, and delete. |
| `tests/support/task-api-assertions.ts` | Shared assertions for problem details and task response shape. |
| `tests/support/test-db.ts` | Test-only database cleanup helper. |
| `src/db/schema/tasks.ts` | Future Drizzle schema; no implementation added yet. |
| `src/routes/tasks.routes.ts` | Future route definitions. |
| `src/validation/task.schemas.ts` | Future Zod request validation. |
| `src/http/problem.ts` | Future RFC 7807 response helper. |

## Coverage Matrix

| Requirement | Contract Test | Integration Test | Validation/Edge Test |
| --- | --- | --- | --- |
| Create task with title, description, priority, due date | `POST /tasks creates a task...` | `persists created tasks...` | covered by invalid payload tests |
| Title is mandatory | `POST /tasks rejects a missing title...` | n/a | `POST /tasks rejects missing/blank/whitespace title` |
| Status defaults to `todo` | `POST /tasks creates a task...` | `persists created tasks...` | n/a |
| Retrieve all tasks | `GET /tasks returns all tasks...` | n/a | n/a |
| Filter tasks by status | `GET /tasks?status=:status filters...` | `stores status and dueDate values...` | invalid filter tests |
| Retrieve task by id | `GET /tasks/:id returns one task...` | n/a | n/a |
| Update title, description, status, priority, due date | `PATCH /tasks/:id applies RFC 7396...` | status persistence test | empty/unknown patch tests |
| Mark tasks in progress or done | patch contract tests | status persistence test | explicit transition tests |
| Delete task | `DELETE /tasks/:id deletes a task` | `removes deleted tasks...` | missing delete test |
| Deleted tasks are no longer retrievable | `DELETE /tasks/:id deletes a task` | `removes deleted tasks...` | n/a |
| Invalid task ids return 404 | GET/PATCH/DELETE missing id tests | n/a | delete missing id test |
| Invalid status values return 400 | GET filter and PATCH status tests | n/a | status enum tests |
| Invalid priority values return 400 | POST and PATCH priority tests | n/a | priority enum tests |
| RFC 7807 errors | all error contract tests | n/a | all validation tests |
| PATCH is idempotent | idempotency contract test | n/a | n/a |

## TDD Implementation Order

1. Wire the test runner and confirm tests fail because `src/app`, `src/db`, and schema files do not exist yet.
2. Add the minimal Express app export and route mounting to move failures from import errors to route failures.
3. Add Drizzle connection, `tasks` schema, and migration.
4. Add validation schemas and RFC 7807 helper.
5. Implement `POST /tasks` until create/default/validation tests pass.
6. Implement `GET /tasks` and status filtering until list/filter tests pass.
7. Implement `GET /tasks/:id` until retrieval and 404 tests pass.
8. Implement `PATCH /tasks/:id` with merge-patch semantics until update, validation, and idempotency tests pass.
9. Implement `DELETE /tasks/:id` until deletion and missing-id tests pass.
10. Run the full test suite and keep all tests green before marking implementation complete.
