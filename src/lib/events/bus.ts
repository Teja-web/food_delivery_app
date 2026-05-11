/**
 * Event Bus — in-process pub/sub for broadcasting CRUD events to SSE connections.
 * Singleton via globalThis so all Next.js module scopes share one instance.
 */

import { EventEmitter } from "events";

export interface CrudEventPayload {
  entityType: string;
  operation: string;
  entityId: string;
  organizationId: string;
}

export interface BusEvent {
  type: string; // e.g. "candidate.insert"
  payload: CrudEventPayload;
  timestamp: string;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(1000);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  publish(event: BusEvent): void {
    this.emit(event.type, event);
    this.emit("*", event);
  }

  subscribe(topic: string, handler: (event: BusEvent) => void): () => void {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }

  subscribeAll(handler: (event: BusEvent) => void): () => void {
    return this.subscribe("*", handler);
  }
}

const GLOBAL_KEY = "__recruit_event_bus__" as const;

export const eventBus: EventBus =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as EventBus ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = EventBus.getInstance());
