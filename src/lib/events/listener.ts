/**
 * PG Listener — single LISTEN connection for dilliznt_crud_events.
 * Parses NOTIFY payload and publishes to EventBus.
 * Exponential backoff reconnection on failure.
 */

import { Client } from "pg";
import { eventBus, type CrudEventPayload, type BusEvent } from "./bus";

const GLOBAL_KEY = "__recruit_listener_started__" as const;
const CHANNEL = "dilliznt_crud_events";
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

function isStarted(): boolean {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] === true;
}
function setStarted(v: boolean): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = v;
}

function handleNotification(payload: string): void {
  try {
    const raw = JSON.parse(payload) as CrudEventPayload;
    const event: BusEvent = {
      type: `${raw.entityType}.${raw.operation}`,
      payload: raw,
      timestamp: new Date().toISOString(),
    };
    eventBus.publish(event);
  } catch (error) {
    console.error("[dilliznt:listener] Failed to parse event:", error);
  }
}

export async function startEventListener(
  connectionString?: string,
): Promise<() => void> {
  if (isStarted()) return () => {};
  setStarted(true);

  const connStr = connectionString ?? process.env.DATABASE_URL;
  if (!connStr) {
    setStarted(false);
    throw new Error("DATABASE_URL not set");
  }

  let stopped = false;
  let currentClient: Client | null = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function cleanupClient(): void {
    const old = currentClient;
    currentClient = null;
    if (old) {
      old.removeAllListeners();
      old.end().catch(() => {});
    }
  }

  async function connect(): Promise<void> {
    if (stopped) return;

    cleanupClient();

    try {
      const client = new Client({ connectionString: connStr });
      currentClient = client;

      client.on("error", (err) => {
        console.error("[dilliznt:listener] Client error:", err.message);
        scheduleReconnect();
      });

      client.on("end", () => {
        if (!stopped) {
          console.warn("[dilliznt:listener] Connection ended, reconnecting...");
          scheduleReconnect();
        }
      });

      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);

      reconnectDelay = RECONNECT_BASE_MS;

      client.on("notification", (msg) => {
        if (msg.payload && msg.channel === CHANNEL) {
          handleNotification(msg.payload);
        }
      });

      console.log(`[dilliznt:listener] Listening on ${CHANNEL}`);
    } catch (err) {
      console.error("[dilliznt:listener] Connection failed:", err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    cleanupClient();
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch(() => {});
    }, delay);
  }

  await connect();

  return () => {
    stopped = true;
    setStarted(false);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    cleanupClient();
  };
}
