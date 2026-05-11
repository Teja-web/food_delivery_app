/**
 * SSE Stream Handler Factory
 *
 * Creates Next.js GET handlers that push real-time CRUD events
 * to the browser via Server-Sent Events. Org-scoped filtering
 * ensures tenants only see their own events.
 */

import { eventBus, type BusEvent } from "./bus";

interface StreamAuthContext {
  organizationId: string;
  userId: string;
  /** Custom event filter. When provided, replaces the default org-scoped filter. */
  filter?: (event: BusEvent) => boolean;
}

interface EventStreamOptions {
  /** Authenticate the request. Return null to reject. */
  authenticate: (request: Request) => Promise<StreamAuthContext | null>;
  /** Keepalive interval in ms (default: 30000) */
  pingInterval?: number;
}

export function createEventStreamHandler(options: EventStreamOptions) {
  const { authenticate, pingInterval = 30000 } = options;

  return async function GET(request: Request): Promise<Response> {
    const auth = await authenticate(request);
    if (!auth) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const send = async (data: unknown) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        // Client disconnected
      }
    };

    // Run subscription logic concurrently so Response is returned immediately
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => void) | null = null;

    function cleanup() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      writer.close().catch(() => {});
    }

    const streamTask = (async () => {
      await send({ type: "connected", timestamp: new Date().toISOString() });

      // Subscribe to all events, filter by org (or custom filter)
      const matchEvent = auth.filter
        ?? ((event: BusEvent) => event.payload.organizationId === auth.organizationId);
      unsubscribe = eventBus.subscribeAll((event: BusEvent) => {
        if (!matchEvent(event)) return;
        send(event);
      });

      // Keepalive
      pingTimer = setInterval(async () => {
        try {
          await send({ type: "ping", timestamp: new Date().toISOString() });
        } catch {
          cleanup();
        }
      }, pingInterval);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", cleanup);
    })();

    streamTask.catch(cleanup);

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
