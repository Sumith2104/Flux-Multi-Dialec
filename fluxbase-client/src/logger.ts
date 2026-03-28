// ============================================================
// Fluxbase Client SDK - Debug Logger
// ============================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const COLORS: Record<LogLevel, string> = {
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  debug: '\x1b[90m',  // grey
};
const RESET = '\x1b[0m';

export class Logger {
  private enabled: boolean;
  private prefix: string;

  constructor(enabled: boolean, prefix = '[Fluxbase]') {
    this.enabled = enabled;
    this.prefix = prefix;
  }

  info(message: string, data?: any) {
    this._log('info', message, data);
  }

  warn(message: string, data?: any) {
    this._log('warn', message, data);
  }

  error(message: string, data?: any) {
    this._log('error', message, data);
  }

  debug(message: string, data?: any) {
    this._log('debug', message, data);
  }

  private _log(level: LogLevel, message: string, data?: any) {
    if (!this.enabled && level !== 'error') return;

    const isBrowser = typeof window !== 'undefined';
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    const label = `${this.prefix} [${timestamp}] ${level.toUpperCase()}`;

    if (isBrowser) {
      const styles: Record<LogLevel, string> = {
        info: 'color: #06b6d4; font-weight: bold',
        warn: 'color: #f59e0b; font-weight: bold',
        error: 'color: #ef4444; font-weight: bold',
        debug: 'color: #6b7280',
      };
      if (data !== undefined) {
        console.groupCollapsed(`%c${label}: ${message}`, styles[level]);
        console.log(data);
        console.groupEnd();
      } else {
        console.log(`%c${label}: ${message}`, styles[level]);
      }
    } else {
      const color = COLORS[level];
      const msg = `${color}${label}${RESET}: ${message}`;
      if (data !== undefined) {
        console.log(msg, data);
      } else {
        console.log(msg);
      }
    }
  }
}
