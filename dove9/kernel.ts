/**
 * dove9/kernel.ts — Matula primes 107 (Process Suspend/Resume) and 109 (MailFlag)
 *
 * Minimal process-management kernel for Dove9 agents.
 *
 * Responsibilities:
 *  - Lifecycle management: start → running → suspended → stopped
 *  - MailFlag: a lightweight signal that a message is waiting so the agent
 *    can wake from suspension without polling.
 */

export type KernelState = "idle" | "running" | "suspended" | "stopped";

/** Listener called when the kernel changes state. */
export type StateChangeListener = (
  from: KernelState,
  to: KernelState,
) => void;

/** Options for constructing a Dove9Kernel. */
export interface KernelOptions {
  id?: string;
  onStateChange?: StateChangeListener;
}

/**
 * Dove9Kernel manages the lifecycle of a single Dove9 agent process and
 * its MailFlag signal.
 *
 * Matula prime 107 — Process Suspend/Resume
 * Matula prime 109 — MailFlag extended
 */
export class Dove9Kernel {
  static readonly MATULA_SUSPEND_RESUME = 107 as const;
  static readonly MATULA_MAIL_FLAG = 109 as const;

  readonly id: string;
  private _state: KernelState = "idle";
  private _mailFlag = false;
  private readonly _onStateChange?: StateChangeListener;

  constructor(options: KernelOptions = {}) {
    this.id = options.id ?? `dove9-${Date.now()}`;
    this._onStateChange = options.onStateChange;
  }

  get state(): KernelState {
    return this._state;
  }

  /** True when the MailFlag has been raised (message waiting). */
  get mailFlag(): boolean {
    return this._mailFlag;
  }

  /** Transition: idle → running. */
  start(): void {
    this._assertState("idle", "start");
    this._transition("running");
  }

  /** Transition: running → suspended. */
  suspend(): void {
    this._assertState("running", "suspend");
    this._transition("suspended");
  }

  /**
   * Transition: suspended → running.
   * Automatically clears the MailFlag so the agent can drain its inbox.
   */
  resume(): void {
    this._assertState("suspended", "resume");
    this._mailFlag = false;
    this._transition("running");
  }

  /** Transition from any non-stopped state → stopped. */
  stop(): void {
    if (this._state === "stopped") return;
    this._transition("stopped");
  }

  /**
   * Raise the MailFlag — signals that a message is waiting.
   * If the kernel is suspended, the caller is responsible for deciding
   * whether to call resume() immediately or to defer it.
   */
  raiseMailFlag(): void {
    if (this._state === "stopped") {
      throw new Error(`[Dove9Kernel:${this.id}] cannot raise MailFlag on stopped kernel`);
    }
    this._mailFlag = true;
  }

  private _transition(to: KernelState): void {
    const from = this._state;
    this._state = to;
    this._onStateChange?.(from, to);
  }

  private _assertState(expected: KernelState, op: string): void {
    if (this._state !== expected) {
      throw new Error(
        `[Dove9Kernel:${this.id}] ${op} requires state=${expected}, actual=${this._state}`,
      );
    }
  }
}
