import { Client, type ConnectConfig } from 'ssh2';
import * as fs from 'fs';

// ============================================================
// SSH Connection Manager — command execution + SFTP file I/O
// ============================================================

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function getPrivateKey(): string {
  const keyValue = process.env.VULTR_SSH_PRIVATE_KEY;
  if (!keyValue) throw new Error('VULTR_SSH_PRIVATE_KEY not configured');

  // Support both file path and inline key
  if (keyValue.startsWith('/') || keyValue.startsWith('~')) {
    const resolvedPath = keyValue.replace(/^~/, process.env.HOME || '');
    return fs.readFileSync(resolvedPath, 'utf8');
  }

  // Inline key (useful for Vercel/serverless) — unescape \n
  return keyValue.replace(/\\n/g, '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SSHManager {
  private conn: Client | null = null;
  private host: string = '';

  /**
   * Establish an SSH connection, retrying until the host is reachable.
   */
  async connect(
    host: string,
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<void> {
    const maxRetries = options?.maxRetries ?? 20;
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const startTime = Date.now();
    const privateKey = getPrivateKey();

    this.host = host;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`SSH connection to ${host} timed out after ${timeoutMs}ms`);
      }

      try {
        await this._tryConnect(host, privateKey);
        return;
      } catch (err) {
        if (attempt === maxRetries || Date.now() - startTime > timeoutMs) {
          throw new Error(
            `SSH connection to ${host} failed after ${attempt} attempts: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        await sleep(5000);
      }
    }
  }

  private _tryConnect(host: string, privateKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      const config: ConnectConfig = {
        host,
        port: 22,
        username: 'root',
        privateKey,
        readyTimeout: 10_000,
        keepaliveInterval: 10_000,
      };

      conn.on('ready', () => {
        this.conn = conn;
        resolve();
      });

      conn.on('error', (err) => {
        conn.end();
        reject(err);
      });

      conn.connect(config);
    });
  }

  /**
   * Execute a shell command over SSH.
   */
  async exec(
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<CommandResult> {
    if (!this.conn) throw new Error('SSH not connected');

    const timeout = options?.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SSH command timed out after ${timeout}ms: ${command.slice(0, 100)}`));
      }, timeout);

      this.conn!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
      });
    });
  }

  /**
   * Read a file via SFTP.
   */
  async readFile(remotePath: string): Promise<string> {
    if (!this.conn) throw new Error('SSH not connected');

    return new Promise((resolve, reject) => {
      this.conn!.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.readFile(remotePath, (readErr, data) => {
          sftp.end();
          if (readErr) { reject(readErr); return; }
          resolve(data.toString('utf8'));
        });
      });
    });
  }

  /**
   * Write a file via SFTP. Creates parent directories if needed.
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    if (!this.conn) throw new Error('SSH not connected');

    // Ensure parent directory exists
    const parentDir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    if (parentDir) {
      await this.exec(`mkdir -p "${parentDir}"`);
    }

    return new Promise((resolve, reject) => {
      this.conn!.sftp((err, sftp) => {
        if (err) { reject(err); return; }

        sftp.writeFile(remotePath, Buffer.from(content, 'utf8'), (writeErr) => {
          sftp.end();
          if (writeErr) { reject(writeErr); return; }
          resolve();
        });
      });
    });
  }

  /**
   * Check if a file exists on the remote host.
   */
  async fileExists(remotePath: string): Promise<boolean> {
    const result = await this.exec(`test -f "${remotePath}" && echo "EXISTS" || echo "MISSING"`);
    return result.stdout.trim() === 'EXISTS';
  }

  /**
   * Gracefully disconnect.
   */
  async disconnect(): Promise<void> {
    if (this.conn) {
      this.conn.end();
      this.conn = null;
    }
  }
}
