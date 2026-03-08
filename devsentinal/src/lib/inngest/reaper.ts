import { inngest } from '@/lib/inngest/client';
import { reapStaleInstances } from '@/lib/vultr/reaper';

/**
 * Cron job: clean up orphaned Vultr VMs every 15 minutes.
 * Destroys any instance tagged 'devsentinel' older than 30 minutes.
 */
export const reaperCron = inngest.createFunction(
  { id: 'reaper-cron' },
  { cron: 'TZ=UTC */15 * * * *' },
  async () => {
    const destroyed = await reapStaleInstances(30);
    if (destroyed > 0) {
      console.log(`[reaper] Cleaned up ${destroyed} stale instance(s)`);
    }
    return { destroyed };
  }
);
