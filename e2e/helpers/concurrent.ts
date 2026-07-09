/**
 * Tiny helper for firing N async functions in parallel and collecting the
 * pass/fail result of each one without short-circuiting on first error.
 *
 * Used by referral-race.spec.ts to verify that exactly one of two concurrent
 * single-use claims wins.
 */
export async function fireConcurrent<T>(
  fns: Array<() => Promise<T>>,
): Promise<Array<{ ok: true; value: T } | { ok: false; error: unknown }>> {
  return Promise.all(
    fns.map(async (fn) => {
      try {
        return { ok: true as const, value: await fn() };
      } catch (error) {
        return { ok: false as const, error };
      }
    }),
  );
}
