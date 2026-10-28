import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

const REQUIRED_PRAGMAS = ['PRAGMA foreign_keys = ON;'];

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // A short synchronous backoff is acceptable during atomic persistence.
  }
}

export class ShowFlowDatabase {
  constructor({ filePath, wasmPath, logger = console }) {
    if (!filePath) throw new Error('Database file path is required.');
    if (!wasmPath) throw new Error('sql.js WASM path is required.');
    this.filePath = filePath;
    this.wasmPath = wasmPath;
    this.logger = logger;
    this.db = null;
    this.SQL = null;
    this.closed = false;
    this.lastSaveAt = null;
  }

  async init() {
    ensureDirectory(this.filePath);
    this.SQL = await initSqlJs({
      locateFile: () => this.wasmPath,
    });

    let source = null;
    if (fs.existsSync(this.filePath)) {
      source = fs.readFileSync(this.filePath);
    }

    try {
      this.db = source && source.length > 0 ? new this.SQL.Database(source) : new this.SQL.Database();
      this.applyPragmas();
      const integrity = this.integrityCheck();
      if (integrity !== 'ok') throw new Error(`Database integrity check failed: ${integrity}`);
    } catch (error) {
      this.logger.error('Failed to open primary database', error);
      this.db = null;
      const recovered = this.tryRecoverBackup();
      if (!recovered) {
        const corruptPath = `${this.filePath}.corrupt-${Date.now()}`;
        if (source?.length) {
          try {
            fs.writeFileSync(corruptPath, source);
            this.logger.warn(`Preserved unreadable database copy at ${corruptPath}`);
          } catch (writeError) {
            this.logger.error('Could not preserve the unreadable database copy', writeError);
          }
        }
        this.db = new this.SQL.Database();
        this.applyPragmas();
      }
    }

    if (source?.length && this.db) {
      try {
        fs.copyFileSync(this.filePath, `${this.filePath}.bak`);
      } catch (error) {
        this.logger.warn('Could not refresh the launch database backup', error);
      }
    }

    this.saveNow();
    return this;
  }

  tryRecoverBackup() {
    const backupPath = `${this.filePath}.bak`;
    if (!fs.existsSync(backupPath)) return false;
    try {
      const backup = fs.readFileSync(backupPath);
      const candidate = new this.SQL.Database(backup);
      this.db = candidate;
      this.applyPragmas();
      const integrity = this.integrityCheck();
      if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);
      this.logger.warn('Recovered the database from the previous-launch backup.');
      return true;
    } catch (error) {
      this.logger.error('Database backup recovery failed', error);
      return false;
    }
  }

  applyPragmas() {
    for (const pragma of REQUIRED_PRAGMAS) this.db.run(pragma);
  }

  assertOpen() {
    if (!this.db || this.closed) throw new Error('The ShowFlow database is not open.');
  }

  all(sql, params = []) {
    this.assertOpen();
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  get(sql, params = []) {
    const rows = this.all(sql, params);
    return rows[0] || null;
  }

  execute(sql, params = []) {
    this.assertOpen();
    this.db.run(sql, params);
  }

  /**
   * Executes a multi-statement SQL script. sql.js `run()` prepares only the
   * first statement, so schema migrations must use this method.
   */
  executeScript(sql) {
    this.assertOpen();
    this.db.exec(sql);
  }

  saveNow() {
    this.assertOpen();
    const data = Buffer.from(this.db.export());
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
    ensureDirectory(this.filePath);
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        fs.writeFileSync(temporaryPath, data);
        fs.renameSync(temporaryPath, this.filePath);
        this.lastSaveAt = new Date().toISOString();
        return;
      } catch (error) {
        lastError = error;
        try {
          if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        } catch {
          /* best effort */
        }
        sleep(40 + attempt * 60);
      }
    }
    throw new Error(`Could not persist the ShowFlow database: ${lastError?.message || 'unknown error'}`);
  }

  transaction(callback) {
    this.assertOpen();
    this.db.run('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      this.db.run('COMMIT;');
      this.saveNow();
      return result;
    } catch (error) {
      try {
        this.db.run('ROLLBACK;');
      } catch (rollbackError) {
        this.logger.error('Database rollback failed', rollbackError);
      }
      throw error;
    }
  }

  integrityCheck() {
    this.assertOpen();
    const result = this.db.exec('PRAGMA integrity_check;');
    return String(result?.[0]?.values?.[0]?.[0] ?? 'unknown');
  }

  stats() {
    const tables = [
      'events',
      'cues',
      'media_assets',
      'operators',
      'assignments',
      'checklists',
      'displays',
      'activity',
    ];
    const counts = {};
    for (const table of tables) {
      counts[table] = Number(this.get(`SELECT COUNT(*) AS count FROM ${table};`)?.count || 0);
    }
    let fileSize = 0;
    try {
      fileSize = fs.statSync(this.filePath).size;
    } catch {
      fileSize = 0;
    }
    return {
      counts,
      filePath: this.filePath,
      fileSize,
      lastSaveAt: this.lastSaveAt,
      integrity: this.integrityCheck(),
    };
  }

  exportBuffer() {
    this.assertOpen();
    return Buffer.from(this.db.export());
  }

  close() {
    if (this.closed || !this.db) return;
    try {
      this.saveNow();
    } finally {
      this.db.close();
      this.closed = true;
    }
  }
}
