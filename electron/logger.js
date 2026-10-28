import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_BYTES = 2 * 1024 * 1024;

function serialiseError(error) {
  if (!error) return '';
  if (error instanceof Error) return `${error.stack || error.message}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export class Logger {
  constructor({ userDataPath, isDev = false } = {}) {
    this.isDev = isDev;
    this.filePath = userDataPath ? path.join(userDataPath, 'logs', 'showflow.log') : null;
    if (this.filePath) {
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.rotateIfNeeded();
      } catch (error) {
        this.filePath = null;
        console.error('Could not initialise ShowFlow log file', error);
      }
    }
  }

  rotateIfNeeded() {
    if (!this.filePath) return;
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.size > MAX_LOG_BYTES) {
        fs.renameSync(this.filePath, `${this.filePath}.old`);
      }
    } catch {
      /* no existing log */
    }
  }

  write(level, message, detail = null) {
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
      detail ? ` :: ${serialiseError(detail)}` : ''
    }\n`;
    if (this.filePath) {
      try {
        fs.appendFileSync(this.filePath, line, 'utf8');
      } catch {
        /* logging must never break the app */
      }
    }
    if (this.isDev) {
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[method](`[ShowFlow] ${message}`, detail || '');
    }
  }

  info(message, detail) {
    this.write('info', message, detail);
  }

  warn(message, detail) {
    this.write('warn', message, detail);
  }

  error(message, detail) {
    this.write('error', message, detail);
  }
}
