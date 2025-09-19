type LogMethod = (...args: any[]) => void;

interface SimpleLogger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

const safeConsole = typeof console !== 'undefined' ? console : ({} as Console);

const prefix = '[OKX]';

export const logger: SimpleLogger = {
  debug: (...args: any[]) => {
    try {
      (safeConsole.debug || safeConsole.log || (() => {})).call(safeConsole, prefix, ...args);
    } catch {}
  },
  info: (...args: any[]) => {
    try {
      (safeConsole.info || safeConsole.log || (() => {})).call(safeConsole, prefix, ...args);
    } catch {}
  },
  warn: (...args: any[]) => {
    try {
      (safeConsole.warn || safeConsole.log || (() => {})).call(safeConsole, prefix, ...args);
    } catch {}
  },
  error: (...args: any[]) => {
    try {
      (safeConsole.error || safeConsole.log || (() => {})).call(safeConsole, prefix, ...args);
    } catch {}
  },
};