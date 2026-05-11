/**
 * Safe path revalidation that works in both Next.js server and worker contexts.
 * In worker/background contexts, revalidatePath is unavailable — this is expected.
 */
export function safeRevalidate(path: string, type?: "layout" | "page") {
  try {
    const { revalidatePath } = require("next/cache");
    revalidatePath(path, type);
  } catch {
    // Expected in worker context where next/cache is unavailable
  }
}
