import { listVultrInstances, deleteVultrInstance } from './client';

// ============================================================
// Stale Instance Reaper — safety net for orphaned Vultr VMs
// ============================================================

/**
 * Destroy any Vultr instances tagged 'devsentinel' that are older than maxAgeMinutes.
 * Returns the number of instances destroyed.
 */
export async function reapStaleInstances(
  maxAgeMinutes: number = 30
): Promise<number> {
  const instances = await listVultrInstances('devsentinel');
  const now = Date.now();
  let destroyed = 0;

  for (const instance of instances) {
    const ageMs = now - new Date(instance.date_created).getTime();
    const ageMinutes = Math.round(ageMs / 60_000);

    if (ageMs > maxAgeMinutes * 60_000) {
      try {
        await deleteVultrInstance(instance.id);
        destroyed++;
        console.log(
          `[reaper] Destroyed stale instance ${instance.id} (label: ${instance.label}, age: ${ageMinutes}m)`
        );
      } catch (error) {
        console.error(
          `[reaper] Failed to destroy instance ${instance.id}:`,
          error
        );
      }
    }
  }

  return destroyed;
}
