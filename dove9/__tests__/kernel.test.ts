/**
 * dove9/__tests__/kernel.test.ts — Matula primes 107 (Suspend/Resume) and 109 (MailFlag)
 */

import { Dove9Kernel, KernelState } from "../kernel";

describe("Dove9Kernel — process lifecycle (Matula 107)", () => {
  let kernel: Dove9Kernel;

  beforeEach(() => {
    kernel = new Dove9Kernel({ id: "test-kernel" });
  });

  it("starts in idle state", () => {
    expect(kernel.state).toBe("idle");
  });

  it("transitions idle → running on start()", () => {
    kernel.start();
    expect(kernel.state).toBe("running");
  });

  it("transitions running → suspended on suspend()", () => {
    kernel.start();
    kernel.suspend();
    expect(kernel.state).toBe("suspended");
  });

  it("transitions suspended → running on resume()", () => {
    kernel.start();
    kernel.suspend();
    kernel.resume();
    expect(kernel.state).toBe("running");
  });

  it("transitions any state → stopped on stop()", () => {
    kernel.start();
    kernel.stop();
    expect(kernel.state).toBe("stopped");
  });

  it("stop() is idempotent from stopped state", () => {
    kernel.start();
    kernel.stop();
    expect(() => kernel.stop()).not.toThrow();
    expect(kernel.state).toBe("stopped");
  });

  it("start() throws when not idle", () => {
    kernel.start();
    expect(() => kernel.start()).toThrow(/start requires state=idle/);
  });

  it("suspend() throws when not running", () => {
    expect(() => kernel.suspend()).toThrow(/suspend requires state=running/);
  });

  it("resume() throws when not suspended", () => {
    kernel.start();
    expect(() => kernel.resume()).toThrow(/resume requires state=suspended/);
  });

  it("fires onStateChange for each transition", () => {
    const changes: Array<[KernelState, KernelState]> = [];
    const k = new Dove9Kernel({
      id: "observing",
      onStateChange: (from, to) => changes.push([from, to]),
    });
    k.start();
    k.suspend();
    k.resume();
    k.stop();
    expect(changes).toEqual([
      ["idle", "running"],
      ["running", "suspended"],
      ["suspended", "running"],
      ["running", "stopped"],
    ]);
  });
});

describe("Dove9Kernel — MailFlag (Matula 109)", () => {
  let kernel: Dove9Kernel;

  beforeEach(() => {
    kernel = new Dove9Kernel({ id: "mail-kernel" });
    kernel.start();
  });

  it("mailFlag is false initially", () => {
    expect(kernel.mailFlag).toBe(false);
  });

  it("raiseMailFlag() sets mailFlag to true", () => {
    kernel.raiseMailFlag();
    expect(kernel.mailFlag).toBe(true);
  });

  it("resume() clears the mailFlag", () => {
    kernel.raiseMailFlag();
    kernel.suspend();
    kernel.resume();
    expect(kernel.mailFlag).toBe(false);
  });

  it("raiseMailFlag() works while suspended", () => {
    kernel.suspend();
    kernel.raiseMailFlag();
    expect(kernel.mailFlag).toBe(true);
  });

  it("raiseMailFlag() throws on stopped kernel", () => {
    kernel.stop();
    expect(() => kernel.raiseMailFlag()).toThrow(/stopped kernel/);
  });
});
