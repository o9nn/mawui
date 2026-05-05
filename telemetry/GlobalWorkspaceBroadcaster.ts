/**
 * GlobalWorkspaceBroadcaster — Matula prime 103
 *
 * Implements the Global Workspace Theory (GWT) broadcast channel.
 * Every subsystem that needs to react to a cognitive-cycle boundary
 * can subscribe here. The MemoryConsolidator (Phase 1) wires to this
 * channel so that every sync_event becomes a memory-write opportunity.
 */

/** Salience score in [0, 1] for a named stream. */
export interface StreamSalience {
  readonly stream: string;
  readonly salience: number;
}

/** Payload of a broadcast event emitted by the global workspace. */
export interface BroadcastEvent {
  readonly type: "sync_event" | "broadcast_pulse" | "workspace_clear";
  /** ISO-8601 timestamp of this event. */
  readonly timestamp: string;
  /** Salience values from the snapshot at broadcast time. */
  readonly streamSaliences: ReadonlyArray<StreamSalience>;
  /** Arbitrary metadata attached by the broadcaster. */
  readonly metadata?: Record<string, unknown>;
}

export type BroadcastListener = (event: BroadcastEvent) => void;

/**
 * A minimal, synchronous publish-subscribe hub for global-workspace events.
 *
 * Design constraints:
 * - Listeners must **never** throw (errors are caught and re-emitted as console
 *   warnings so that one bad subscriber cannot kill the broadcast pipeline).
 * - Broadcast is synchronous: all listeners are called before `broadcast`
 *   returns, which keeps the cognitive-cycle timing predictable.
 */
export class GlobalWorkspaceBroadcaster {
  /** Matula prime eternal name for this subsystem. */
  static readonly MATULA_PRIME = 103 as const;

  private readonly _listeners = new Set<BroadcastListener>();

  /** Register a listener. Returns a handle to unsubscribe. */
  subscribe(listener: BroadcastListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Broadcast a sync_event snapshot to all subscribers. */
  broadcast(
    streamSaliences: ReadonlyArray<StreamSalience>,
    metadata?: Record<string, unknown>,
  ): void {
    const event: BroadcastEvent = {
      type: "sync_event",
      timestamp: new Date().toISOString(),
      streamSaliences,
      metadata,
    };
    this._dispatchEvent(event);
  }

  /** Emit a raw event (for testing or advanced callers). */
  emit(event: BroadcastEvent): void {
    this._dispatchEvent(event);
  }

  private _dispatchEvent(event: BroadcastEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn(
          "[GlobalWorkspaceBroadcaster] listener threw:",
          err,
        );
      }
    }
  }
}
