// ============================================================
// Vultr API Client — Direct HTTP (no SDK)
// ============================================================

const VULTR_API = 'https://api.vultr.com/v2';

function getApiKey(): string {
  const key = process.env.VULTR_API_KEY;
  if (!key) throw new Error('Missing VULTR_API_KEY environment variable');
  return key;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

export interface VultrInstanceConfig {
  region?: string;
  plan?: string;
  snapshotId?: string;
  osId?: number;
  sshKeyId?: string;
  userData?: string;
  label: string;
  tag: string;
}

export interface VultrInstanceInfo {
  id: string;
  main_ip: string;
  default_password: string;
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

  const body: Record<string, unknown> = {
    region,
    plan,
    label: config.label,
    tag: config.tag,
    backups: 'disabled',
    ddos_protection: false,
    enable_ipv6: false,
  };

  // SSH key is optional — if not provided, Vultr auto-generates a root password
  if (config.sshKeyId) {
    body.sshkey_id = [config.sshKeyId];
  }

  if (snapshotId) {
    body.snapshot_id = snapshotId;
  } else {
    // Fallback: Ubuntu 22.04 LTS (os_id 1743)
    body.os_id = config.osId || 1743;
    if (config.userData) {
      body.user_data = config.userData;
    }
  }

  console.log('[createVultrInstance] Creating with params:', JSON.stringify({
    region, plan, label: config.label, hasSnapshot: !!snapshotId,
  }));

  const res = await fetch(`${VULTR_API}/instances`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vultr createInstance failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const instance = data.instance;

  if (!instance) {
    throw new Error(`Vultr createInstance returned no instance. Response: ${JSON.stringify(data)}`);
  }

  return {
    id: instance.id,
    main_ip: instance.main_ip,
    default_password: instance.default_password || '',
    status: instance.status,
    server_status: instance.server_status || '',
    label: instance.label,
    date_created: instance.date_created,
  };
}

/**
 * Delete a Vultr instance. Idempotent — ignores 404 (already deleted).
 */
export async function deleteVultrInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${VULTR_API}/instances/${instanceId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete Vultr instance: ${res.status}`);
  }
}

/**
 * Get instance info by ID.
 */
export async function getVultrInstance(
  instanceId: string
): Promise<VultrInstanceInfo> {
  const res = await fetch(`${VULTR_API}/instances/${instanceId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to get Vultr instance: ${res.status}`);
  }

  const data = await res.json();
  const instance = data.instance;

  return {
    id: instance.id,
    main_ip: instance.main_ip,
    default_password: instance.default_password || '',
    status: instance.status,
    server_status: instance.server_status || '',
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
  const url = tag
    ? `${VULTR_API}/instances?tag=${encodeURIComponent(tag)}`
    : `${VULTR_API}/instances`;

  const res = await fetch(url, { headers: getHeaders() });

  if (!res.ok) {
    throw new Error(`Failed to list Vultr instances: ${res.status}`);
  }

  const data = await res.json();
  return (data.instances ?? []).map(
    (i: Record<string, unknown>) => ({
      id: i.id as string,
      main_ip: i.main_ip as string,
      default_password: (i.default_password as string) || '',
      status: i.status as string,
      server_status: (i.server_status as string) || '',
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
  timeoutMs: number = 300_000,
  onProgress?: (msg: string) => void
): Promise<string> {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < timeoutMs) {
    const info = await getVultrInstance(instanceId);

    if (info.status === 'active' && info.server_status === 'ok' && info.main_ip !== '0.0.0.0') {
      onProgress?.(`VM ready (ip: ${info.main_ip})`);
      return info.main_ip;
    }

    const statusStr = `status=${info.status}, server_status=${info.server_status}`;
    if (statusStr !== lastStatus) {
      onProgress?.(`Waiting for VM: ${statusStr}`);
      lastStatus = statusStr;
    }

    await sleep(3000);
  }

  throw new Error(
    `Vultr instance ${instanceId} did not become ready within ${timeoutMs}ms`
  );
}
