/**
 * Discriminate Postgres unique-constraint violations from other errors so that
 * call sites can swallow the "already exists" case and re-throw everything else.
 *
 * Postgres returns `code: '23505'` on unique-violation; the constraint name is
 * in the `constraint` field on the underlying error. Drivers wrap this differently
 * (postgres-js puts it on `err.code` + `err.constraint_name`; node-postgres puts it
 * on `err.code` + `err.constraint`). Check both.
 */
export function isUniqueViolation(err: unknown, constraintName?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; constraint?: string; constraint_name?: string };
  if (e.code !== "23505") return false;
  if (!constraintName) return true;
  return e.constraint === constraintName || e.constraint_name === constraintName;
}
