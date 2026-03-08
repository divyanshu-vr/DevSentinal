declare module '@vultr/vultr-node' {
  interface VultrConfig {
    apiKey: string;
    baseUrl?: string;
    rateLimit?: number;
  }

  interface VultrClient {
    account: {
      getAccountInfo(): Promise<Record<string, unknown>>;
    };
    instances: {
      createInstance(params: Record<string, unknown>): Promise<{
        instance: Record<string, unknown>;
      }>;
      deleteInstance(params: Record<string, unknown>): Promise<void>;
      getInstance(params: Record<string, unknown>): Promise<{
        instance: Record<string, unknown>;
      }>;
      listInstances(params?: Record<string, unknown>): Promise<{
        instances: Record<string, unknown>[];
      }>;
    };
    snapshots: {
      createSnapshot(params: Record<string, unknown>): Promise<{
        snapshot: Record<string, unknown>;
      }>;
      listSnapshots(params?: Record<string, unknown>): Promise<{
        snapshots: Record<string, unknown>[];
      }>;
    };
    sshKeys: {
      createSshKey(params: Record<string, unknown>): Promise<{
        ssh_key: Record<string, unknown>;
      }>;
      listSshKeys(params?: Record<string, unknown>): Promise<{
        ssh_keys: Record<string, unknown>[];
      }>;
    };
    startupScripts: {
      createStartupScript(params: Record<string, unknown>): Promise<{
        startup_script: Record<string, unknown>;
      }>;
      listStartupScripts(params?: Record<string, unknown>): Promise<{
        startup_scripts: Record<string, unknown>[];
      }>;
    };
  }

  const VultrNode: {
    initialize(config: VultrConfig): VultrClient;
  };

  export default VultrNode;
}
