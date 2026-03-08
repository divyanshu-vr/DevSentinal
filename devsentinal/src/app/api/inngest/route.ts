import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { analysisRun } from '@/lib/inngest/analyze';
import { fixRun } from '@/lib/inngest/fix';
import { autoFixRun } from '@/lib/inngest/auto-fix';
import { reaperCron } from '@/lib/inngest/reaper';

// Register all Inngest functions here.
const functions = [
  analysisRun,
  fixRun,
  autoFixRun,
  reaperCron,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
