import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { analysisRun } from '@/lib/inngest/analyze';
import { fixRun } from '@/lib/inngest/fix';

// Register all Inngest functions here.
const functions = [
  analysisRun,
  fixRun,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
