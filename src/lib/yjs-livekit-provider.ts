/**
 * Yjs ↔ LiveKit Data Channel Transport Provider
 *
 * Piggybacks on the existing LiveKit WebRTC connection to sync
 * Yjs document updates and awareness (cursor/selection) between
 * participants. Zero additional infrastructure.
 */

import type { Room } from "livekit-client";
import { ConnectionState, RoomEvent } from "livekit-client";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";

interface DataChannelMessage {
  type: "yjs_update" | "yjs_awareness" | "yjs_sync_request" | "yjs_sync_response";
  topic: string;
  update?: number[];
}

export class LiveKitYjsProvider {
  private ydoc: Y.Doc;
  private room: Room;
  private topic: string;
  private awareness: awarenessProtocol.Awareness;
  private _destroyed = false;
  private handleDataReceived: (payload: Uint8Array) => void;
  private onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private onAwarenessUpdate: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;

  constructor(ydoc: Y.Doc, room: Room, topic: string) {
    this.ydoc = ydoc;
    this.room = room;
    this.topic = topic;
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    // Broadcast local Yjs updates to other participants
    this.onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (this._destroyed || origin === "remote") return;
      this.broadcast({
        type: "yjs_update",
        topic: this.topic,
        update: Array.from(update),
      });
    };
    ydoc.on("update", this.onDocUpdate);

    // Broadcast awareness updates (cursor position, selection)
    this.onAwarenessUpdate = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (this._destroyed || origin === "remote") return;
      const changedClients = [...added, ...updated, ...removed];
      const encodedUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
      this.broadcast({
        type: "yjs_awareness",
        topic: this.topic,
        update: Array.from(encodedUpdate),
      });
    };
    this.awareness.on("update", this.onAwarenessUpdate);

    // Receive updates from other participants
    this.handleDataReceived = (payload: Uint8Array) => {
      try {
        const msg: DataChannelMessage = JSON.parse(new TextDecoder().decode(payload));
        if (msg.topic !== this.topic) return;

        if (msg.type === "yjs_update" && msg.update) {
          Y.applyUpdate(this.ydoc, new Uint8Array(msg.update), "remote");
        } else if (msg.type === "yjs_awareness" && msg.update) {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            new Uint8Array(msg.update),
            "remote",
          );
        } else if (msg.type === "yjs_sync_request") {
          // Peer joined late — send full doc state
          const state = Y.encodeStateAsUpdate(this.ydoc);
          this.broadcast({
            type: "yjs_sync_response",
            topic: this.topic,
            update: Array.from(state),
          });
        } else if (msg.type === "yjs_sync_response" && msg.update) {
          Y.applyUpdate(this.ydoc, new Uint8Array(msg.update), "remote");
        }
      } catch {
        // Ignore non-Yjs messages on the data channel
      }
    };
    room.on(RoomEvent.DataReceived, this.handleDataReceived);

    // Request full state from existing peers
    this.broadcast({ type: "yjs_sync_request", topic: this.topic });
  }

  private broadcast(msg: DataChannelMessage) {
    if (this._destroyed || this.room.state !== ConnectionState.Connected) return;
    this.room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true },
    ).catch(() => {
      // Room may be disconnected
    });
  }

  getAwareness(): awarenessProtocol.Awareness {
    return this.awareness;
  }

  destroy() {
    this._destroyed = true;
    this.ydoc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    this.room.off(RoomEvent.DataReceived, this.handleDataReceived);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.ydoc.clientID], null);
    this.awareness.destroy();
  }
}
