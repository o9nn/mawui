/**
 * __tests__/cognitive-tier-integration.test.ts — Matula prime 127
 *
 * End-to-end integration tests that wire all cognitive-tier components
 * together:
 *
 *  EchoAgentLoop  →  GlobalWorkspaceBroadcaster  →  MemoryConsolidator  →  AtomSpace
 *
 * The tests drive the loop manually (via _step()) to stay deterministic.
 */

import { EchoAgentLoop } from "../echo-agent-loop";
import { GlobalWorkspaceBroadcaster } from "../telemetry/GlobalWorkspaceBroadcaster";
import {
  MemoryConsolidator,
} from "../memory/MemoryConsolidator";
import {
  AtomSpace,
  MemorySubsystem,
  SUBSYSTEM_MATULA,
  MEMORY_SEED,
  decodeLinks,
} from "../memory/schema";

describe("Cognitive tier integration (Matula 127)", () => {
  let broadcaster: GlobalWorkspaceBroadcaster;
  let space: AtomSpace;
  let consolidator: MemoryConsolidator;

  beforeEach(() => {
    broadcaster = new GlobalWorkspaceBroadcaster();
    space = new AtomSpace();
    consolidator = new MemoryConsolidator(space, broadcaster);
    consolidator.start();
  });

  afterEach(() => {
    consolidator.stop();
  });

  // ── Matula prime constants ────────────────────────────────────────────────

  it("GlobalWorkspaceBroadcaster has Matula prime 103", () => {
    expect(GlobalWorkspaceBroadcaster.MATULA_PRIME).toBe(103);
  });

  it("EchoAgentLoop has Matula prime 137", () => {
    expect(EchoAgentLoop.MATULA_PRIME).toBe(137);
  });

  it("MEMORY_SEED is 2 × 3 × 5 × 7 × 11 × 13 = 30030", () => {
    expect(MEMORY_SEED).toBe(2 * 3 * 5 * 7 * 11 * 13);
  });

  it("SUBSYSTEM_MATULA has the expected six primes", () => {
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Episodic]).toBe(2);
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Semantic]).toBe(3);
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Procedural]).toBe(5);
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Participatory]).toBe(7);
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Declarative]).toBe(11);
    expect(SUBSYSTEM_MATULA[MemorySubsystem.Working]).toBe(13);
  });

  // ── decodeLinks ───────────────────────────────────────────────────────────

  it("decodeLinks(0) returns []", () => {
    expect(decodeLinks(0)).toEqual([]);
  });

  it("decodeLinks(2 × 3 × 5) returns [2, 3, 5]", () => {
    expect(decodeLinks(2 * 3 * 5)).toEqual([2, 3, 5]);
  });

  it("decodeLinks(MEMORY_SEED) returns all six subsystem primes", () => {
    const factors = decodeLinks(MEMORY_SEED);
    expect(factors).toEqual([2, 3, 5, 7, 11, 13]);
  });

  // ── Broadcaster ───────────────────────────────────────────────────────────

  it("broadcaster notifies subscribers on broadcast()", () => {
    const events: string[] = [];
    broadcaster.subscribe((e) => events.push(e.type));
    broadcaster.broadcast([]);
    expect(events).toEqual(["sync_event"]);
  });

  it("unsubscribing stops receiving events", () => {
    const events: string[] = [];
    const unsub = broadcaster.subscribe((e) => events.push(e.type));
    unsub();
    broadcaster.broadcast([]);
    expect(events).toHaveLength(0);
  });

  it("listener errors are caught and do not propagate", () => {
    broadcaster.subscribe(() => { throw new Error("boom"); });
    expect(() => broadcaster.broadcast([])).not.toThrow();
  });

  // ── MemoryConsolidator ────────────────────────────────────────────────────

  it("consolidator writes atoms for all six subsystems on a broadcast", async () => {
    broadcaster.broadcast([]);
    // Give the async consolidation a chance to run.
    await new Promise((r) => setImmediate(r));
    expect(space.size).toBeGreaterThanOrEqual(6);
    for (const id of Object.values(MemorySubsystem)) {
      expect(space.bySubsystem(id).length).toBeGreaterThan(0);
    }
  });

  it("consolidator respects salience threshold", async () => {
    const gatedConsolidator = new MemoryConsolidator(
      new AtomSpace(),
      broadcaster,
      { salienceThreshold: 0.5 },
    );
    gatedConsolidator.start();

    broadcaster.broadcast([
      { stream: "episodic", salience: 0.9 },
      { stream: "semantic", salience: 0.1 }, // below threshold
    ]);
    await new Promise((r) => setImmediate(r));

    const gatedSpace = (gatedConsolidator as unknown as { _space: AtomSpace })._space;
    expect(gatedSpace.bySubsystem(MemorySubsystem.Episodic).length).toBeGreaterThan(0);
    expect(gatedSpace.bySubsystem(MemorySubsystem.Semantic).length).toBe(0);
    gatedConsolidator.stop();
  });

  it("consolidator drops events during consolidation (re-entrancy guard)", async () => {
    let resolveSlow!: () => void;
    const slow = new Promise<void>((r) => (resolveSlow = r));

    const slowConsolidator = new MemoryConsolidator(
      new AtomSpace(),
      broadcaster,
      {
        writers: {
          [MemorySubsystem.Episodic]: async () => { await slow; },
        },
      },
    );
    slowConsolidator.start();

    broadcaster.broadcast([]); // starts slow consolidation
    broadcaster.broadcast([]); // should be dropped
    broadcaster.broadcast([]); // should be dropped

    expect(slowConsolidator.droppedCount).toBe(2);

    resolveSlow();
    await new Promise((r) => setImmediate(r));
    slowConsolidator.stop();
  });

  // ── EchoAgentLoop ─────────────────────────────────────────────────────────

  it("loop emits a sync_event to broadcaster on each step", async () => {
    const events: string[] = [];
    broadcaster.subscribe((e) => events.push(e.type));

    const loop = new EchoAgentLoop(() => { /* noop */ }, {
      broadcaster,
      salientStreams: () => [],
    });

    await loop._step();
    expect(events).toEqual(["sync_event"]);
    await loop._step();
    expect(events).toHaveLength(2);
  });

  it("loop drops ticks when tickInProgress (re-entrancy guard)", async () => {
    let unlock!: () => void;
    const blockingTick = new Promise<void>((r) => (unlock = r));

    const loop = new EchoAgentLoop(async () => { await blockingTick; }, {
      stepDurationMs: 10,
    });

    const step1 = loop._step(); // starts; won't finish until unlock()
    const step2 = loop._step(); // should increment overrunCount immediately
    const step3 = loop._step(); // also dropped

    // step2 and step3 should have resolved (they returned early)
    await step2;
    await step3;
    expect(loop.overrunCount).toBe(2);

    unlock();
    await step1;
  });

  it("loop provides a shouldYield signal to tick callbacks", async () => {
    const yieldChecks: boolean[] = [];
    const loop = new EchoAgentLoop(
      (ctx) => { yieldChecks.push(ctx.shouldYield()); },
      { stepDurationMs: 60_000 }, // large budget → shouldYield() is false
    );
    await loop._step();
    expect(yieldChecks[0]).toBe(false);
  });

  it("loop start/stop is idempotent", () => {
    const loop = new EchoAgentLoop(() => { /* noop */ });
    loop.start();
    loop.start(); // idempotent
    expect(loop.running).toBe(true);
    loop.stop();
    loop.stop(); // idempotent
    expect(loop.running).toBe(false);
  });
});
