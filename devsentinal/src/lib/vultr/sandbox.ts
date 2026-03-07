import { SSHManager, type CommandResult } from './ssh';
import {
  createVultrInstance,
  deleteVultrInstance,
  getVultrInstance,
  waitForInstanceReady,
} from './client';

// ============================================================
// VultrSandbox — drop-in replacement for E2B Sandbox
// ============================================================

export interface SandboxCommands {
  run(command: string, options?: { timeoutMs?: number }): Promise<CommandResult>;
}

export interface SandboxFiles {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export class VultrSandbox {
  public readonly sandboxId: string;
  public readonly commands: SandboxCommands;
  public readonly files: SandboxFiles;

  private sshManager: SSHManager;
  private instanceIp: string;

  constructor(instanceId: string, instanceIp: string, sshManager: SSHManager) {
    this.sandboxId = instanceId;
    this.instanceIp = instanceIp;
    this.sshManager = sshManager;

    this.commands = {
      run: async (
        command: string,
        options?: { timeoutMs?: number }
      ): Promise<CommandResult> => {
        return this.sshManager.exec(command, options);
      },
    };

    this.files = {
      read: async (path: string): Promise<string> => {
        return this.sshManager.readFile(path);
      },
      write: async (path: string, content: string): Promise<void> => {
        return this.sshManager.writeFile(path, content);
      },
      exists: async (path: string): Promise<boolean> => {
        return this.sshManager.fileExists(path);
      },
    };
  }

  /**
   * Destroy the Vultr instance and disconnect SSH.
   */
  async kill(): Promise<void> {
    try {
      await this.sshManager.disconnect();
    } catch {
      // SSH may already be dead
    }

    await deleteVultrInstance(this.sandboxId);
  }

  /**
   * Create a new VultrSandbox instance.
   * Provisions a Vultr VM, waits for it to boot, and establishes SSH.
   */
  static async create(options?: {
    timeoutMs?: number;
  }): Promise<VultrSandbox> {
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const sshKeyId = process.env.VULTR_SSH_KEY_ID;

    if (!sshKeyId) {
      throw new Error('VULTR_SSH_KEY_ID not configured');
    }

    const label = `devsentinel-sandbox-${Date.now()}`;

    // Create the Vultr instance
    const instance = await createVultrInstance({
      sshKeyId,
      label,
      tag: 'devsentinel',
    });

    try {
      // Wait for the instance to be ready (active + server_status: ok)
      const ip = await waitForInstanceReady(instance.id, timeoutMs);

      // Establish SSH connection (retries until SSH daemon is up)
      const sshManager = new SSHManager();
      await sshManager.connect(ip, {
        timeoutMs: Math.max(timeoutMs - (Date.now() - Date.now()), 120_000),
        maxRetries: 20,
      });

      return new VultrSandbox(instance.id, ip, sshManager);
    } catch (error) {
      // Cleanup on failure
      await deleteVultrInstance(instance.id).catch(() => {});
      throw error;
    }
  }

  /**
   * Reconnect to an existing VultrSandbox by instance ID.
   * Used when resuming across Inngest steps.
   */
  static async connect(sandboxId: string): Promise<VultrSandbox> {
    const info = await getVultrInstance(sandboxId);

    if (info.status !== 'active') {
      throw new Error(
        `Vultr instance ${sandboxId} is not active (status: ${info.status})`
      );
    }

    const sshManager = new SSHManager();
    await sshManager.connect(info.main_ip);

    return new VultrSandbox(sandboxId, info.main_ip, sshManager);
  }
}
