"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// -- Types --------------------------------------------------------------

interface EntityEvent {
  type: string;
  payload: {
    entityType: string;
    operation: string;
    entityId: string;
    organizationId: string;
  };
  timestamp: string;
}

type Listener = (event: EntityEvent) => void;

interface SSEContextValue {
  subscribe: (listener: Listener) => () => void;
}

// -- Context ------------------------------------------------------------

const SSEContext = createContext<SSEContextValue | null>(null);

// -- Provider -----------------------------------------------------------

/**
 * Single SSE connection shared by all components under this provider.
 * Mount once in the app layout — all useEntityEvent hooks subscribe
 * to in-memory listeners, not new network connections.
 */
export function SSEProvider({ children, url = "/api/events/stream" }: { children: ReactNode; url?: string }) {
  const listenersRef = useRef(new Set<Listener>());

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    let closed = false;

    function connect() {
      if (closed) return;
      source = new EventSource(url);

      source.onmessage = (msg) => {
        retryDelay = 1000; // reset backoff on successful message
        try {
          const data = JSON.parse(msg.data) as EntityEvent;
          if (data.type === "connected" || data.type === "ping") return;
          listenersRef.current.forEach((fn) => fn(data));
        } catch {
          // Ignore parse errors
        }
      };

      source.onerror = () => {
        source?.close();
        if (closed) return;
        retryTimeout = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimeout);
      source?.close();
    };
  }, [url]);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>
  );
}

// -- Hook ---------------------------------------------------------------

/**
 * Subscribe to real-time entity events via the shared SSE connection.
 *
 * @param entity - Entity type(s) to listen for (e.g. "candidate", ["candidate", "role"])
 * @param id - Optional entity ID for detail pages. Omit for list pages.
 * @param onEvent - Optional callback. If omitted, calls router.refresh() automatically.
 *
 * @example
 * // Detail page — refresh when this candidate changes
 * useEntityEvent("candidate", candidate.id);
 *
 * // List page — refresh when any candidate or role changes
 * useEntityEvent(["candidate", "role"]);
 *
 * // Custom handler
 * useEntityEvent("candidate", candidate.id, (event) => {
 *   toast.info("Profile updated");
 *   router.refresh();
 * });
 */
export function useEntityEvent(
  entity: string | string[],
  id?: string,
  onEvent?: (event: EntityEvent) => void,
) {
  const ctx = useContext(SSEContext);
  const router = useRouter();
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const entities = Array.isArray(entity) ? entity : [entity];
  const entitiesKey = entities.join(",");

  useEffect(() => {
    if (!ctx) return;

    return ctx.subscribe((event) => {
      if (!entities.includes(event.payload.entityType)) return;
      if (id && event.payload.entityId !== id) return;

      if (onEventRef.current) {
        onEventRef.current(event);
      } else {
        router.refresh();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, entitiesKey, id]);
}
