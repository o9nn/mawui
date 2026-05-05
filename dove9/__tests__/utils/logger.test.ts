/**
 * dove9/__tests__/utils/logger.test.ts — Matula prime 113
 */

import { Logger, LogRecord, LogLevel } from "../../utils/logger";

function captureRecords(): { records: LogRecord[]; restore: () => void } {
  const records: LogRecord[] = [];
  Logger.setSink((r) => records.push(r));
  return {
    records,
    restore: () => Logger.reset(),
  };
}

describe("Logger (Matula 113)", () => {
  afterEach(() => {
    Logger.reset();
  });

  it("has the expected Matula prime", () => {
    expect(Logger.MATULA_PRIME).toBe(113);
  });

  it("emits info records", () => {
    const { records, restore } = captureRecords();
    const log = new Logger("test");
    log.info("hello");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "info",
      name: "test",
      message: "hello",
    });
    restore();
  });

  it("attaches data to log records", () => {
    const { records, restore } = captureRecords();
    const log = new Logger("test");
    log.warn("something fishy", { code: 42 });
    expect(records[0].data).toEqual({ code: 42 });
    restore();
  });

  it("filters records below the instance min level", () => {
    const { records, restore } = captureRecords();
    Logger.setLevel("debug");
    const log = new Logger("test", "warn");
    log.debug("suppressed");
    log.info("also suppressed");
    log.warn("visible");
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe("warn");
    restore();
  });

  it("respects global min level", () => {
    const { records, restore } = captureRecords();
    Logger.setLevel("error");
    const log = new Logger("test");
    log.info("suppressed");
    log.warn("also suppressed");
    log.error("visible");
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe("error");
    restore();
  });

  it("records include a timestamp", () => {
    const { records, restore } = captureRecords();
    const log = new Logger("test");
    log.info("ts test");
    expect(records[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    restore();
  });

  it("reset() restores defaults", () => {
    Logger.setLevel("debug");
    Logger.setSink(() => { /* noop */ });
    Logger.reset();
    // After reset, global level should be 'info' again.
    const { records, restore } = captureRecords();
    const log = new Logger("test");
    log.debug("should be suppressed");
    log.info("should appear");
    expect(records).toHaveLength(1);
    restore();
  });

  it("all log methods emit records", () => {
    const { records, restore } = captureRecords();
    Logger.setLevel("debug");
    const log = new Logger("test", "debug");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    const levels: LogLevel[] = records.map((r) => r.level);
    expect(levels).toEqual(["debug", "info", "warn", "error"]);
    restore();
  });
});
