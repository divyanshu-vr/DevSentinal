import { SSHManager, type CommandResult } from './ssh';
import {
  createVultrInstance,
  deleteVultrInstance,
  getVultrInstance,
  waitForInstanceReady,
} from './client';
import { generateCloudInit, encodeCloudInit } from './cloud-init';

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
  public readonly instanceIp: string;
  /** Vultr auto-generated password — needed for SSH reconnection across Inngest steps */
  public readonly defaultPassword: string;

  constructor(instanceId: string, instanceIp: string, sshManager: SSHManager, defaultPassword: string = '') {
    this.sandboxId = instanceId;
    this.instanceIp = instanceIp;
    this.defaultPassword = defaultPassword;
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
   * Supports both SSH key auth (VULTR_SSH_KEY_ID) and password auth (Vultr default_password).
   */
  static async create(options?: {
    timeoutMs?: number;
    onProgress?: (msg: string) => void;
  }): Promise<VultrSandbox> {
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const startTime = Date.now();
    const onProgress = options?.onProgress;
    const sshKeyId = process.env.VULTR_SSH_KEY_ID;
    const snapshotId = process.env.VULTR_SNAPSHOT_ID;

    const label = `devsentinel-sandbox-${Date.now()}`;

    // Build cloud-init user_data when creating from bare OS (no snapshot)
    let userData: string | undefined;
    if (!snapshotId) {
      const cloudInitYaml = generateCloudInit();
      userData = encodeCloudInit(cloudInitYaml);
    }

    // Create the Vultr instance (SSH key is optional)
    const instance = await createVultrInstance({
      sshKeyId: sshKeyId || undefined,
      label,
      tag: 'devsentinel',
      userData,
    });

    try {
      // Wait for the instance to be ready (active + server_status: ok)
      onProgress?.('VM instance created, waiting for boot...');
      const ip = await waitForInstanceReady(instance.id, timeoutMs, onProgress);

      // Establish SSH connection (retries until SSH daemon is up)
      // Use password auth from Vultr if no SSH key is configured
      onProgress?.('VM active, establishing SSH connection...');
      const sshManager = new SSHManager();
      await sshManager.connect(ip, {
        timeoutMs: Math.max(timeoutMs - (Date.now() - startTime), 30_000),
        maxRetries: 20,
        password: instance.default_password || undefined,
      });

      // Wait for cloud-init to finish (only for non-snapshot instances)
      if (!snapshotId) {
        onProgress?.('Waiting for cloud-init to complete...');
        await waitForCloudInit(sshManager, Math.max(timeoutMs - (Date.now() - startTime), 60_000), onProgress);
      }

      return new VultrSandbox(instance.id, ip, sshManager, instance.default_password);
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
  static async connect(sandboxId: string, password?: string): Promise<VultrSandbox> {
    const info = await getVultrInstance(sandboxId);

    if (info.status !== 'active') {
      throw new Error(
        `Vultr instance ${sandboxId} is not active (status: ${info.status})`
      );
    }

    const sshManager = new SSHManager();
    await sshManager.connect(info.main_ip, { password: password || info.default_password || undefined });

    return new VultrSandbox(sandboxId, info.main_ip, sshManager, password || info.default_password);
  }

  /**
   * Reconnect by IP directly, skipping the Vultr API call.
   * Use when the IP is already known from a previous step.
   */
  static async connectByIp(sandboxId: string, ip: string, password?: string): Promise<VultrSandbox> {
    const sshManager = new SSHManager();
    await sshManager.connect(ip, { password });
    return new VultrSandbox(sandboxId, ip, sshManager, password || '');
  }
}

/**
 * Wait for cloud-init to complete on the VM.
 * Polls for the marker file created by the cloud-init script.
 */
async function waitForCloudInit(
  sshManager: SSHManager,
  timeoutMs: number,
  onProgress?: (msg: string) => void
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 5_000;
  const markerFile = '/var/lib/cloud/instance/devsentinel-ready';

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await sshManager.exec(
        `test -f "${markerFile}" && echo "READY" || echo "WAITING"`,
        { timeoutMs: 10_000 }
      );

      if (result.stdout.trim() === 'READY') {
        onProgress?.('Cloud-init complete');
        return;
      }
    } catch {
      // SSH command may fail during boot — keep retrying
    }

    onProgress?.('Waiting for cloud-init...');
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Don't hard-fail — cloud-init marker may not exist on snapshots
  onProgress?.('Cloud-init wait timed out, proceeding anyway');
}
