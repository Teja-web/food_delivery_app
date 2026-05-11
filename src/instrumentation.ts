/**
 * Next.js Instrumentation — runs once on server startup.
 * Starts the PG LISTEN connection for SSE event streaming.
 */

export async function register() {
  // Only run on the Node.js server, not in Edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEventListener } = await import("@/lib/events/listener");
    await startEventListener();
  }
}
