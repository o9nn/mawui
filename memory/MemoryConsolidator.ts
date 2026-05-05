/**
 * memory/MemoryConsolidator.ts — Phase 1: Consolidation Triggers
 *
 * Wires the memory system to the GlobalWorkspaceBroadcaster.  Every
 * sync_event is a write opportunity.  The streamSaliences carried by the
 * event gate which of the six memory subsystems are allowed to consolidate:
 * only subsystems whose salience exceeds the `salienceThreshold` are written.
 *
 * Design contract (mirrors the echo-agent-loop re-entrancy rule):
 *   If consolidation is still in progress when the next sync_event fires,
 *   the new event is **dropped** (not queued).  This prevents slow
 *   consolidation from blocking the next perception cycle.
 */

import {
  GlobalWorkspaceBroadcaster,
  BroadcastEvent,
  StreamSalience,
} from "../telemetry/GlobalWorkspaceBroadcaster";
import {
  AtomSpace,
  MemoryAtom,
  MemorySubsystem,
  MemorySubsystemId,
  SUBSYSTEM_MATULA,
  makeAtom,
  MatulaPrime,
} from "./schema";

/** A write handler for a single memory subsystem. */
export type SubsystemWriter = (
  space: AtomSpace,
  event: BroadcastEvent,
) => Promise<void> | void;

/** Options for MemoryConsolidator. */
export interface ConsolidatorOptions {
  /**
   * Minimum salience score a stream must reach for its subsystem to be
   * written.  Default 0 (all subsystems write on every sync_event).
   */
  salienceThreshold?: number;
  /** Map from subsystem id to a custom write handler. */
  writers?: Partial<Record<MemorySubsystemId, SubsystemWriter>>;
}

/**
 * Default write handler — records the broadcast event as a generic atom
 * in the given subsystem.  Production code should replace these with
 * domain-specific writers.
 */
function defaultWriter(subsystem: MemorySubsystemId): SubsystemWriter {
  return (space: AtomSpace, event: BroadcastEvent) => {
    const prime = SUBSYSTEM_MATULA[subsystem];
    // Derive a unique name by multiplying the subsystem prime by a hash of
    // the timestamp so repeated events don't collide.
    const tsHash = hashTimestamp(event.timestamp);
    const atomName = (prime * tsHash) as MatulaPrime;
    const atom = makeAtom(atomName, subsystem, { event }, [prime]);
    space.insert(atom);
  };
}

/** Simple, deterministic string → small-prime-safe integer hash. */
function hashTimestamp(ts: string): number {
  let h = 1;
  for (let i = 0; i < ts.length; i++) {
    h = (h * 31 + ts.charCodeAt(i)) >>> 0;
  }
  // Keep in a range that doesn't overflow JS safe integers when multiplied
  // by the largest subsystem prime (13).  Use modulo a large prime.
  return (h % 999_983) + 2; // >= 2, ensuring prime-product validity
}

/**
 * MemoryConsolidator subscribes to a GlobalWorkspaceBroadcaster and writes
 * to an AtomSpace on every qualifying sync_event.
 */
export class MemoryConsolidator {
  private readonly _space: AtomSpace;
  private readonly _broadcaster: GlobalWorkspaceBroadcaster;
  private readonly _salienceThreshold: number;
  private readonly _writers: Record<MemorySubsystemId, SubsystemWriter>;

  /** True while a consolidation pass is in progress. */
  private _consolidationInProgress = false;

  /** Events dropped because a consolidation was already in progress. */
  private _droppedCount = 0;

  private _unsubscribe: (() => void) | null = null;

  constructor(
    space: AtomSpace,
    broadcaster: GlobalWorkspaceBroadcaster,
    options: ConsolidatorOptions = {},
  ) {
    this._space = space;
    this._broadcaster = broadcaster;
    this._salienceThreshold = options.salienceThreshold ?? 0;

    const customWriters = options.writers ?? {};
    this._writers = {} as Record<MemorySubsystemId, SubsystemWriter>;
    for (const id of Object.values(MemorySubsystem)) {
      this._writers[id] = customWriters[id] ?? defaultWriter(id);
    }
  }

  /** Events dropped due to consolidation-in-progress re-entrancy guard. */
  get droppedCount(): number {
    return this._droppedCount;
  }

  /** True if a consolidation pass is currently running. */
  get consolidationInProgress(): boolean {
    return this._consolidationInProgress;
  }

  /** Start listening for broadcast events. */
  start(): void {
    if (this._unsubscribe) return;
    this._unsubscribe = this._broadcaster.subscribe((event) => {
      void this._handleEvent(event);
    });
  }

  /** Stop listening and detach from the broadcaster. */
  stop(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  private async _handleEvent(event: BroadcastEvent): Promise<void> {
    if (event.type !== "sync_event") return;

    // Re-entrancy guard: drop if still consolidating.
    if (this._consolidationInProgress) {
      this._droppedCount++;
      return;
    }

    this._consolidationInProgress = true;
    try {
      const activeSubsystems = this._selectSubsystems(event.streamSaliences);
      await Promise.all(
        activeSubsystems.map((id) =>
          Promise.resolve(this._writers[id](this._space, event)),
        ),
      );
    } finally {
      this._consolidationInProgress = false;
    }
  }

  /**
   * Returns subsystems whose salience meets the threshold.
   *
   * The stream-to-subsystem mapping follows the convention that a stream
   * named "episodic", "semantic", etc. maps directly to the same-named
   * subsystem.  Any subsystem with no matching stream entry is included
   * unconditionally (salience defaults to 1.0).
   */
  private _selectSubsystems(
    streamSaliences: ReadonlyArray<StreamSalience>,
  ): MemorySubsystemId[] {
    const salienceMap = new Map<string, number>(
      streamSaliences.map(({ stream, salience }) => [stream, salience]),
    );

    return (Object.values(MemorySubsystem) as MemorySubsystemId[]).filter(
      (id) => {
        const sal = salienceMap.get(id) ?? 1.0;
        return sal >= this._salienceThreshold;
      },
    );
  }
}
