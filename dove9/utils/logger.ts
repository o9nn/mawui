/**
 * dove9/utils/logger.ts — Matula prime 113
 *
 * Lightweight structured logger for Dove9 agents.
 *
 * Features:
 *  - Named loggers with independent level filters.
 *  - Structured JSON output (or pretty-print in development).
 *  - All output goes through a replaceable sink so tests can capture logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** A single log record. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly name: string;
  readonly message: string;
  readonly timestamp: string;
  readonly data?: unknown;
}

/** A function that receives finished log records. */
export type LogSink = (record: LogRecord) => void;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Default sink: writes JSON to console. */
const consoleSink: LogSink = (record) => {
  const fn =
    record.level === "error"
      ? console.error
      : record.level === "warn"
        ? console.warn
        : console.log;
  fn(JSON.stringify(record));
};

/**
 * Logger — Matula prime 113
 *
 * ```ts
 * const log = new Logger("dove9.kernel");
 * log.info("process started", { pid: 42 });
 * ```
 */
export class Logger {
  /** Matula prime eternal name for this utility. */
  static readonly MATULA_PRIME = 113 as const;

  private static _globalSink: LogSink = consoleSink;
  private static _globalMinLevel: LogLevel = "info";

  /** Replace the global log sink (useful in tests). */
  static setSink(sink: LogSink): void {
    Logger._globalSink = sink;
  }

  /** Set the global minimum level. */
  static setLevel(level: LogLevel): void {
    Logger._globalMinLevel = level;
  }

  /** Reset to defaults (useful in test teardown). */
  static reset(): void {
    Logger._globalSink = consoleSink;
    Logger._globalMinLevel = "info";
  }

  readonly name: string;
  private readonly _minLevel: LogLevel;

  constructor(name: string, minLevel?: LogLevel) {
    this.name = name;
    this._minLevel = minLevel ?? Logger._globalMinLevel;
  }

  debug(message: string, data?: unknown): void {
    this._log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this._log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this._log("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this._log("error", message, data);
  }

  private _log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this._minLevel]) return;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[Logger._globalMinLevel]) return;

    const record: LogRecord = {
      level,
      name: this.name,
      message,
      timestamp: new Date().toISOString(),
      ...(data !== undefined ? { data } : {}),
    };
    Logger._globalSink(record);
  }
}
