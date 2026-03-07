import VultrNode from '@vultr/vultr-node';

// ============================================================
// Vultr API Client — Instance lifecycle management
// ============================================================

const vultr = VultrNode.initialize({
  apiKey: process.env.VULTR_API_KEY || '',
});

export interface VultrInstanceConfig {
  region?: string;
  plan?: string;
  snapshotId?: string;
  osId?: number;
  sshKeyId: string;
  userData?: string;
  label: string;
  tag: string;
}

export interface VultrInstanceInfo {
  id: string;
  main_ip: string;
  status: string;
  server_status: string;
  label: string;
  date_created: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a Vultr cloud compute instance.
 */
export async function createVultrInstance(
  config: VultrInstanceConfig
): Promise<VultrInstanceInfo> {
  const region = config.region || process.env.VULTR_REGION || 'ewr';
  const plan = config.plan || process.env.VULTR_PLAN || 'vc2-2c-4gb';
  const snapshotId = config.snapshotId || process.env.VULTR_SNAPSHOT_ID;

  const params: Record<string, unknown> = {
    region,
    plan,
    label: config.label,
    tag: config.tag,
    sshkey_id: [config.sshKeyId],
  };

  if (snapshotId) {
    params.snapshot_id = snapshotId;
  } else {
    // Fallback: Ubuntu 22.04 LTS (os_id 1743)
    params.os_id = config.osId || 1743;
    if (config.userData) {
      params.user_data = config.userData;
    }
  }

  const response = await vultr.instances.createInstance(params);
  const instance = response.instance as Record<string, string>;

  return {
    id: instance.id,
    main_ip: instance.main_ip,
    status: instance.status,
    server_status: instance.server_status,
    label: instance.label,
    date_created: instance.date_created,
  };
}

/**
 * Delete a Vultr instance. Idempotent — ignores 404 (already deleted).
 */
export async function deleteVultrInstance(instanceId: string): Promise<void> {
  try {
    await vultr.instances.deleteInstance({ 'instance-id': instanceId });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 404) return; // Already deleted
    throw error;
  }
}

/**
 * Get instance info by ID.
 */
export async function getVultrInstance(
  instanceId: string
): Promise<VultrInstanceInfo> {
  const response = await vultr.instances.getInstance({
    'instance-id': instanceId,
  });
  const instance = response.instance as Record<string, string>;

  return {
    id: instance.id,
    main_ip: instance.main_ip,
    status: instance.status,
    server_status: instance.server_status,
    label: instance.label,
    date_created: instance.date_created,
  };
}

/**
 * List all Vultr instances, optionally filtered by tag.
 */
export async function listVultrInstances(
  tag?: string
): Promise<VultrInstanceInfo[]> {
  const params: Record<string, unknown> = {};
  if (tag) params.tag = tag;

  const response = await vultr.instances.listInstances(params);
  return (response.instances || []).map(
    (i: Record<string, unknown>) => ({
      id: i.id as string,
      main_ip: i.main_ip as string,
      status: i.status as string,
      server_status: i.server_status as string,
      label: i.label as string,
      date_created: i.date_created as string,
    })
  );
}

/**
 * Poll until instance is active and server_status is 'ok'.
 * Returns the instance's main IP address.
 */
export async function waitForInstanceReady(
  instanceId: string,
  timeoutMs: number = 300_000
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const info = await getVultrInstance(instanceId);

    if (info.status === 'active' && info.server_status === 'ok' && info.main_ip !== '0.0.0.0') {
      return info.main_ip;
    }

    await sleep(3000);
  }

  throw new Error(
    `Vultr instance ${instanceId} did not become ready within ${timeoutMs}ms`
  );
}
