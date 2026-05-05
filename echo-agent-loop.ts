/**
 * echo-agent-loop — Matula prime 137
 *
 * Optimized cognitive-cycle driver with three key enhancements:
 *
 *  1. Re-entrancy guard (tickInProgress) — if the previous tick has not
 *     finished by the time the next interval fires, the new tick is
 *     **dropped** rather than queued.  This prevents unbounded work
 *     accumulation and mirrors the memory-consolidation contract: slow
 *     consolidation must not block the next perception cycle.
 *
 *  2. Overrun counter — every dropped tick increments `overrunCount` so
 *     callers can observe back-pressure without polling elapsed time.
 *
 *  3. Cooperative early-return — long-running tick callbacks can check
 *     the `shouldYield` signal passed to them and return early when the
 *     allotted step budget is exceeded.
 */

import { GlobalWorkspaceBroadcaster, StreamSalience } from "./telemetry/GlobalWorkspaceBroadcaster";

/** Function signature for a single cognitive step. */
export type TickCallback = (ctx: TickContext) => Promise<void> | void;

/** Context object injected into each tick callback. */
export interface TickContext {
  /** Returns true when the step has exceeded its time budget. */
  readonly shouldYield: () => boolean;
  /** The step sequence number (monotonically increasing). */
  readonly stepIndex: number;
  /** Timestamp (ms) when this tick started. */
  readonly startedAt: number;
}

/** Options for constructing an EchoAgentLoop. */
export interface EchoAgentLoopOptions {
  /** Target duration of a single step in milliseconds. Default 100 ms. */
  stepDurationMs?: number;
  /** Broadcaster to receive a sync_event after each completed tick. */
  broadcaster?: GlobalWorkspaceBroadcaster;
  /** Stream salience provider called after each tick. */
  salientStreams?: () => ReadonlyArray<StreamSalience>;
}

/**
 * EchoAgentLoop drives a cognitive cycle at a fixed step rate.
 *
 * ```ts
 * const loop = new EchoAgentLoop(async (ctx) => {
 *   if (ctx.shouldYield()) return;   // cooperative early-return
 *   await doWork();
 * }, { stepDurationMs: 50 });
 *
 * loop.start();
 * // …later…
 * loop.stop();
 * ```
 */
export class EchoAgentLoop {
  /** Matula prime eternal name for this subsystem. */
  static readonly MATULA_PRIME = 137 as const;

  private readonly _tick: TickCallback;
  private readonly _stepDurationMs: number;
  private readonly _broadcaster?: GlobalWorkspaceBroadcaster;
  private readonly _salientStreams?: () => ReadonlyArray<StreamSalience>;

  /** True while an async tick callback is executing. */
  private _tickInProgress = false;

  /** Number of ticks dropped due to re-entrancy. */
  private _overrunCount = 0;

  /** Monotonically increasing step counter. */
  private _stepIndex = 0;

  /** Handle returned by setInterval, null when stopped. */
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(tick: TickCallback, options: EchoAgentLoopOptions = {}) {
    this._tick = tick;
    this._stepDurationMs = options.stepDurationMs ?? 100;
    this._broadcaster = options.broadcaster;
    this._salientStreams = options.salientStreams;
  }

  /** Number of ticks dropped because the previous tick was still running. */
  get overrunCount(): number {
    return this._overrunCount;
  }

  /** True if the loop is currently running. */
  get running(): boolean {
    return this._intervalHandle !== null;
  }

  /** Start the cognitive cycle. Idempotent — safe to call more than once. */
  start(): void {
    if (this._intervalHandle !== null) return;
    this._intervalHandle = setInterval(
      () => void this._step(),
      this._stepDurationMs,
    );
  }

  /** Stop the cognitive cycle. Idempotent — safe to call more than once. */
  stop(): void {
    if (this._intervalHandle === null) return;
    clearInterval(this._intervalHandle);
    this._intervalHandle = null;
  }

  /**
   * Execute one step.  Called by the interval; exposed for testing.
   */
  async _step(): Promise<void> {
    // Re-entrancy guard: drop this tick if the previous one is still running.
    if (this._tickInProgress) {
      this._overrunCount++;
      return;
    }

    this._tickInProgress = true;
    const startedAt = Date.now();
    const stepIndex = this._stepIndex++;

    const ctx: TickContext = {
      shouldYield: () => Date.now() - startedAt > this._stepDurationMs,
      stepIndex,
      startedAt,
    };

    try {
      await this._tick(ctx);
    } finally {
      this._tickInProgress = false;

      // Phase 1 hook: broadcast a sync_event so the MemoryConsolidator can
      // write to the appropriate subsystems.
      if (this._broadcaster) {
        const saliences = this._salientStreams?.() ?? [];
        this._broadcaster.broadcast(saliences, { stepIndex });
      }
    }
  }
}
